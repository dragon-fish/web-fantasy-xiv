import { Engine } from '@babylonjs/core'
import { GameScene } from '@/game/game-scene'
import { BossBehavior } from '@/ai/boss-behavior'
import { PhaseScheduler } from '@/timeline/phase-scheduler'
import { loadEncounter } from '@/game/encounter-loader'
import { DeathZoneManager } from '@/arena/death-zone-manager'
import { ScriptRunner } from '@/timeline/script-runner'
import { getJob, JobCategory } from '@/jobs'
import { MechanicHost } from '@/game/mechanics/mechanic-host'
import { MECHANICS, FAST_FORWARD } from '@/game/mechanics'
import { matchesCondition } from '@/combat/conditions'
import { createPlayerRevive, REVIVE_BUFFS } from '@/game/player-revive'
import { PARRY_BUFFS } from '@/game/parry'
import { createParryPrompt } from '@/game/parry-prompt'
import type { EventBus } from '@/core/event-bus'
import type { TimelineEntry } from '@/timeline/types'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'
import type { EncounterData } from '@/game/encounter-loader'
import type { BuffDef, EntityType } from '@/core/types'
import type { BuffSystem } from '@/combat/buff'
import type { CombatResolver } from '@/game/combat-resolver'

/**
 * Death-window grace period (ms) for DoT-comeback resolution.
 * When the player's hp drops to 0, combat does not end immediately — instead a
 * DEATH_WINDOW_MS grace window opens during which player-sourced DoTs on the
 * boss keep ticking. If a DoT tick brings boss.hp to 0 inside the window, the
 * encounter resolves as `victory` (DoT-comeback). Otherwise the window closes
 * with `wipe` on timeout or when the last player DoT expires.
 */
/**
 * Default death-window length in ms — the unified buffer between player death
 * and the result screen. During the window, boss timeline / AI / DoT ticks
 * continue; if boss hp reaches 0 inside, player wins ("DoT comeback"). Otherwise
 * the window closes with `wipe` at the deadline.
 *
 * Encounter yaml may override via top-level `death_window_ms: <ms>`. A value of
 * `0` is accepted and means "no window; finalize on the very next tick".
 */
export const DEATH_WINDOW_MS = 5000

/**
 * Shortened cap applied when the player has no active DoT on any enemy at the
 * moment of death. 2 seconds is enough for the red-vignette HUD overlay to
 * appear and the death to land emotionally, but doesn't linger when there's
 * nothing for the DoT-comeback mechanic to resolve. The encounter's configured
 * window (or the default) still wins if it's shorter than this cap.
 */
export const DEATH_WINDOW_NO_DOT_CAP_MS = 1500

export interface DeathWindowDeps {
  bus: EventBus
  player: Entity
  boss: Entity
  buffSystem: Pick<BuffSystem, 'clearDeathBuffs'>
  scriptRunner: { disposeAll(): void }
  /** Called on finalize with the resolution result. */
  endBattle: (result: 'victory' | 'wipe') => void
  /** Returns the current in-combat elapsed time in ms (for deadline + event payload). */
  getElapsed: () => number
  /**
   * Per-encounter window length in ms. `0` is valid (= no window). Negative /
   * undefined / non-number → fallback to `DEATH_WINDOW_MS`.
   */
  windowMs?: number
  /**
   * Predicate invoked ONCE at enter() to decide whether any enemy carries an
   * active player-sourced DoT. When `false`, the window is capped to
   * `DEATH_WINDOW_NO_DOT_CAP_MS` (or the configured windowMs, whichever is
   * shorter). Default: checks `boss` only — callers with multiple enemies
   * (e.g. live battle-runner) should pass a predicate iterating entityMgr.
   */
  hasPlayerDotOnEnemies?: () => boolean
}

export interface DeathWindowRuntime {
  /** Open the death window. No-op if already active. Emits `player:died`, clears non-preserved buffs. */
  enter(): void
  /** Per-frame tick. Checks the three finalize conditions. No-op if inactive. */
  tick(gameTime: number): void
  /** Force-finalize with a specific result (used by the boss-death path is NOT via this — see notes). */
  finalize(result: 'victory' | 'wipe'): void
  /** Whether the window is currently open. */
  isActive(): boolean
  /** Current window state, or null if inactive. */
  getState(): { startedAt: number; deadline: number } | null
}

/**
 * Factory for the death-window runtime.
 *
 * Extracted into a pure factory so it can be unit-tested without spinning up
 * Babylon.js, canvases, or YAML encounter loaders. The live battle-runner
 * constructs one instance per encounter inside `initScene` and wires
 *   - enter()  into the `damage:dealt` player-hp-zero branch
 *   - tick()   into the `onLogicTick` loop (after `tickPeriodicBuffs` in GameScene)
 *
 * Finalize order of precedence per tick:
 *   1. victory  — boss.hp <= 0 (no delay; DoT comeback wins instantly)
 *   2. wipe     — gameTime >= deadline (timeout)
 *
 * The window length is a unified buffer regardless of DoT presence — even
 * encounters with zero player DoTs wait the full window so the red-vignette
 * HUD overlay is visible and the death has a dramatic beat. Per-encounter
 * override: pass `deps.windowMs` (plumbed from encounter yaml `death_window_ms`).
 */
export function createDeathWindow(deps: DeathWindowDeps): DeathWindowRuntime {
  const { bus, player, boss, buffSystem, scriptRunner, endBattle, getElapsed } = deps
  // Base window: accept 0 explicitly. Only undefined / null / non-finite /
  // negative values fall back to the default.
  const baseWindow =
    typeof deps.windowMs === 'number' && Number.isFinite(deps.windowMs) && deps.windowMs >= 0
      ? deps.windowMs
      : DEATH_WINDOW_MS
  // Default predicate checks only boss — sufficient for unit tests and for
  // encounters with a single enemy. Live battle-runner wires a predicate that
  // iterates the full entity manager.
  const hasDotCheck =
    deps.hasPlayerDotOnEnemies ??
    (() =>
      boss.buffs.some(
        (b) => b.periodic?.effectType === 'dot' && b.periodic.sourceCasterId === player.id,
      ))
  let state: { startedAt: number; deadline: number } | null = null

  function enter(): void {
    if (state) return
    const now = getElapsed()
    // No active player DoT on any enemy → cap the window so the player isn't
    // left staring at nothing for the full baseWindow. If baseWindow is already
    // shorter than the cap, the shorter value wins (respect explicit override).
    const effectiveMs = hasDotCheck()
      ? baseWindow
      : Math.min(baseWindow, DEATH_WINDOW_NO_DOT_CAP_MS)
    state = { startedAt: now, deadline: now + effectiveMs }
    bus.emit('player:died', { gameTime: now })
    buffSystem.clearDeathBuffs(player)
    // Boss timeline / AI / DoT tick continue running until finalize is called.
  }

  function tick(gameTime: number): void {
    if (!state) return
    if (boss.hp <= 0) return finalize('victory')
    if (gameTime >= state.deadline) return finalize('wipe')
  }

  function finalize(result: 'victory' | 'wipe'): void {
    if (!state) return
    state = null
    scriptRunner.disposeAll()
    bus.emit('combat:ended', { result, elapsed: getElapsed() })
    endBattle(result)
  }

  return {
    enter,
    tick,
    finalize,
    isActive: () => state !== null,
    getState: () => state,
  }
}

/** Context passed to the battle init callback */
export interface BattleInitContext {
  player: Entity
  buffSystem: BuffSystem
  combatResolver: CombatResolver
  registerBuffs: (buffs: Record<string, BuffDef>) => void
  /** Encounter data loaded for this battle (exposes top-level fields like `conditions`). */
  encounter: EncounterData
}

export type BattleInitCallback = (ctx: BattleInitContext) => void | Promise<void>

let scene: GameScene | null = null

export function disposeActiveScene(): void {
  scene?.dispose()
  scene = null
}

export function getActiveScene(): GameScene | null {
  return scene
}

export async function startTimelineDemo(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLDivElement,
  encounterUrl?: string,
  jobOverride?: string,
  onInit?: BattleInitCallback,
): Promise<void> {
  scene?.dispose()

  const loading = document.createElement('div')
  loading.style.cssText = `
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.9); z-index: 200;
    color: #888; font-size: 16px; letter-spacing: 2px;
  `
  loading.textContent = 'Loading...'
  uiRoot.appendChild(loading)

  const url = encounterUrl ?? `${import.meta.env.BASE_URL}encounters/timeline-test.yaml`

  try {
    const encounter = await loadEncounter(url)
    loading.remove()
    await initScene(canvas, uiRoot, encounter, url, jobOverride, onInit)
  } catch (err) {
    loading.textContent = `Failed to load encounter: ${err}`
    loading.style.color = '#ff4444'
  }
}

async function initScene(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement, enc: EncounterData, encounterUrl: string, jobOverride?: string, onInit?: BattleInitCallback): Promise<void> {
  const engine = Engine.Instances.find(e => e.getRenderingCanvas() === canvas) as Engine | undefined
  if (!engine) throw new Error('No Engine found for canvas')

  const job = getJob(jobOverride ?? 'default')

  scene = new GameScene({
    engine, uiRoot, arena: enc.arena,
    playerInputConfig: {
      skills: job.skills,
      extraSkills: job.extraSkills,
      autoAttackSkill: job.autoAttackSkill,
      autoAttackInterval: job.autoAttackInterval,
      noMpRegen: job.stats.noMpRegen,
      passiveBuffs: job.passiveBuffs,
      buffDefs: job.buffMap,
    },
    restart: () => startTimelineDemo(canvas, uiRoot, encounterUrl, jobOverride, onInit),
  })

  const s = scene
  s.skillBarEntries = job.skillBar
  s.jobGauge = job.gauge ?? []
  s.buffDefs = job.buffMap

  s.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    ...enc.player,
    model: `job:${job.id}`,
    role: job.category === JobCategory.Tank ? 'tank' : job.category === JobCategory.Healer ? 'healer' : 'dps',
    hp: job.stats.hp, maxHp: job.stats.hp,
    mp: job.stats.mp, maxMp: job.stats.mp,
    attack: job.stats.attack,
    speed: job.stats.speed,
    autoAttackRange: job.stats.autoAttackRange,
    gcdDuration: job.stats.gcdDuration,
  })

  // Create all entities from encounter data
  const entityMap = new Map<string, Entity>()
  entityMap.set('player', s.player)
  const aiMap = new Map<string, BossBehavior>()
  const aiEnabled = new Set<string>()
  const knownGroups = new Set<string>()  // groups that have had at least one entity

  for (const [id, opts] of enc.entities) {
    const entity = s.entityMgr.create(opts)
    entityMap.set(id, entity)
    knownGroups.add(entity.group)

    // Boss entity shortcut
    if (id === 'boss') s.bossEntity = entity

    // Create AI for boss/mob type entities
    if (opts.type === 'boss' || opts.type === 'mob') {
      const ai = new BossBehavior(entity, id === 'boss' ? enc.bossAI : {})
      ai.lockFacing(entity.facing)
      aiMap.set(id, ai)
    }
  }

  const boss = entityMap.get('boss')!
  s.combatResolver.registerBuffs(job.buffs)
  // Parry stances step down through registered defs; available in every encounter
  s.combatResolver.registerBuffs(PARRY_BUFFS)
  s.buffDefs = { ...s.buffDefs, ...PARRY_BUFFS }

  // Register encounter-local buffs (from YAML local_buffs section)
  if (enc.localBuffs && Object.keys(enc.localBuffs).length > 0) {
    s.combatResolver.registerBuffs(enc.localBuffs)
    // Merge into s.buffDefs so HUD tooltip can lookup
    s.buffDefs = { ...s.buffDefs, ...enc.localBuffs }
  }

  // Init callback: apply practice mode buffs, echo, etc.
  // Awaited so async activators (e.g. battlefield conditions fetching pool
  // manifest) complete BEFORE combat engages — guarantees any applied buffs
  // are in effect at frame 0.
  if (onInit) {
    await onInit({
      player: s.player,
      buffSystem: s.buffSystem,
      combatResolver: s.combatResolver,
      registerBuffs: (buffs) => s.combatResolver.registerBuffs(buffs),
      encounter: enc,
    })
  }

  let combatStarted = false
  const bossAutoSkill = enc.skills.get('boss_auto')
  const scheduler = new PhaseScheduler(s.bus, enc.phases)
  const deathZoneMgr = new DeathZoneManager(s.bus)
  if (enc.arena.deathZones) deathZoneMgr.loadInitial(enc.arena.deathZones)
  s.arena.setWallZoneProvider(() => deathZoneMgr.getWallZones())

  const scriptRunner = new ScriptRunner({
    bus: s.bus,
    buildCtx: () => ({
      // Entity access
      player: s.player,
      getEntity: (id: string) => entityMap.get(id) ?? null,

      // Game actions
      showDialog: (text: string) => { s.setDialog(text) },
      hideDialog: () => { s.setDialog('') },
      activatePhase: (phaseId: string) => scheduler.activatePhase(phaseId),
      teleport: (entityId: string, x: number, y: number) => {
        const e = entityMap.get(entityId)
        if (e) {
          s.displacer.start(e, x, y, 400)
          s.bus.emit('entity:teleported', { entity: e, position: { x, y } })
        }
      },
      setVisible: (entityId: string, visible: boolean) => {
        const e = entityMap.get(entityId)
        if (e) e.visible = visible
      },
      setTargetable: (entityId: string, targetable: boolean) => {
        const e = entityMap.get(entityId)
        if (e) {
          e.targetable = targetable
          if (!targetable && s.player.target === e.id) {
            s.player.target = null
            s.bus.emit('target:released', { entity: s.player })
          }
        }
      },
      enableAI: (entityId: string) => {
        const e = entityMap.get(entityId)
        if (e) {
          aiEnabled.add(e.id)
          const ai = aiMap.get(e.id)
          ai?.unlockFacing()
          e.target = s.player.id
        }
      },
      disableAI: (entityId: string) => {
        aiEnabled.delete(entityId)
      },
      useSkill: (entityId: string, skillId: string) => {
        const e = entityMap.get(entityId)
        const skill = enc.skills.get(skillId)
        if (e && skill) {
          if (e.type === 'mob' || e.type === 'boss') e.target = s.player.id
          s.skillResolver.tryUse(e, skill)
        }
      },
      spawnEntity: (opts: any) => {
        const id = opts.id ?? `mob_${Date.now()}`
        const entity = s.entityMgr.create({
          id,
          type: opts.type ?? 'mob',
          group: opts.group ?? opts.type ?? 'mob',
          visible: opts.visible ?? true,
          targetable: opts.targetable ?? true,
          hp: opts.hp ?? 1000,
          maxHp: opts.hp ?? 1000,
          attack: opts.attack ?? 100,
          speed: opts.speed ?? 0,
          size: opts.size ?? 0.5,
          model: opts.model,
          autoAttackRange: opts.autoAttackRange ?? 5,
          aggroRange: opts.aggroRange ?? 999,
          position: { x: opts.x ?? 0, y: opts.y ?? 0, z: 0 },
          facing: opts.facing ?? 180,
        })
        entityMap.set(id, entity)
        knownGroups.add(entity.group)
        if (entity.type === 'mob' || entity.type === 'boss') {
          const ai = new BossBehavior(entity, {})
          ai.lockFacing(entity.facing)
          aiMap.set(id, ai)
        }
        return entity
      },
      addDeathZone: (def: any) => {
        deathZoneMgr.add({
          id: def.id,
          center: { x: def.center.x, y: def.center.y },
          facing: def.facing ?? 0,
          shape: def.shape,
          behavior: def.behavior ?? 'lethal',
        })
      },
      removeDeathZone: (id: string) => deathZoneMgr.remove(id),
    }),
  })

  // Death-window runtime: player hp=0 opens a DEATH_WINDOW_MS grace period during
  // which player-sourced DoTs on boss keep ticking. Finalizes via tick() below.
  const deathWindow = createDeathWindow({
    bus: s.bus,
    player: s.player,
    boss,
    buffSystem: s.buffSystem,
    scriptRunner,
    endBattle: (result) => s.endBattle(result),
    getElapsed: () => scheduler.combatElapsed,
    windowMs: enc.deathWindowMs,
    // Check ALL alive non-player entities for a player-sourced DoT. Keeps the
    // full window when a DoT comeback is still possible; otherwise the no-DoT
    // cap kicks in at enter().
    hasPlayerDotOnEnemies: () =>
      s.entityMgr.getAll().some(
        (e) =>
          e.id !== s.player.id &&
          e.alive &&
          e.buffs.some(
            (b) => b.periodic?.effectType === 'dot' && b.periodic.sourceCasterId === s.player.id,
          ),
      ),
  })

  // Helper: resolve entity from action (default: boss)
  function resolveEntity(action: TimelineAction): Entity | undefined {
    return action.entity ? entityMap.get(action.entity) : boss
  }

  // Engage
  function engageCombat() {
    if (combatStarted) return
    combatStarted = true
    s.player.inCombat = true
    boss.inCombat = true
    for (const id of job.combatBuffs ?? []) s.combatResolver.grantBuff(s.player, id)
    s.setAnnounce('战斗开始')
    s.bus.emit('combat:started', { entities: [s.player, boss] })
  }

  s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity; amount: number; skill: any; noRevive?: boolean }) => {
    if (payload.target.id === boss.id && !combatStarted) engageCombat()
    // Check victory: boss dead
    if (payload.target.id === boss.id && payload.target.hp <= 0) {
      if (!s.battleOver) {
        scriptRunner.disposeAll()
        s.bus.emit('combat:ended', { result: 'victory', elapsed: scheduler.combatElapsed })
        s.endBattle('victory')
      }
    }
    // Player dead → revive (if the encounter allows and a tier is left) or the death window.
    // Finalization (victory / wipe) happens from deathWindow.tick() in the logic loop.
    if (payload.target.id === s.player.id && payload.target.hp <= 0) handlePlayerDeath(payload.noRevive)
    // Mob death: destroy entity when hp reaches 0
    if (payload.target.type === 'mob' && payload.target.hp <= 0 && payload.target.alive) {
      s.entityMgr.destroy(payload.target.id)
    }
    // Damage log for death recap HUD
    if (payload.target.id === s.player.id && payload.amount > 0) {
      const elapsed = combatStarted ? scheduler.combatElapsed : 0
      const mitigations = s.buffSystem.getMitigations(payload.target)
      const totalMit = mitigations.length > 0
        ? 1 - mitigations.reduce((acc: number, v: number) => acc * (1 - v), 1)
        : 0
      const log = s.damageLog
      s.damageLog = [...log.slice(-19), {
        time: elapsed,
        sourceName: payload.source?.id ?? '?',
        skillName: payload.skill?.name ?? '自动攻击',
        amount: payload.amount,
        hpAfter: payload.target.hp,
        mitigation: totalMit,
      }]
    }
  })

  // Generic entity death cleanup: clear stale target + cancel orphan AOE zones.
  // Also triggers the death window when the player dies from non-damage causes
  // (e.g. maxHp ≤ 0 from vitality_down stacking).
  s.bus.on('entity:died', (payload: { entity: Entity }) => {
    const dead = payload.entity
    if (s.player.target === dead.id) {
      s.player.target = null
      s.bus.emit('target:released', { entity: s.player })
    }
    s.zoneMgr.cancelAllByCaster(dead.id)
    if (dead.id === s.player.id) handlePlayerDeath()
  })

  if (import.meta.env.DEV) {
    const seekTo = (arg: unknown): string => {
      const named = typeof arg === 'string' ? enc.checkpoints[arg] : undefined
      const sec = named ?? Number(arg)
      if (!Number.isFinite(sec) || sec < 0) {
        const names = Object.entries(enc.checkpoints).map(([k, v]) => `${k}(${v}s)`).join(' ')
        return `Usage: seek <seconds|checkpoint>${names ? `\nCheckpoints: ${names}` : ''}`
      }
      if (!combatStarted) engageCombat()
      scheduler.seek(sec * 1000)
      return `Timeline → ${sec}s (lasting state fast-forwarded)`
    }
    s.devCommands.register('seek', '[dev] seek <seconds|checkpoint> — jump the timeline; arena/visibility/positions are fast-forwarded', (args) => seekTo((args._ as unknown[])[0]))
    ;(globalThis as any).__battle = { seek: seekTo }
  }

  /** Timeline actions that restore lasting state when a seek fast-forwards past them */
  const FAST_FORWARD_ACTIONS = new Set([
    'set_visible', 'set_targetable', 'set_speed', 'teleport', 'enable_ai', 'disable_ai', 'lock_facing',
    'add_death_zone', 'remove_death_zone', 'mechanic', 'run_script', 'hide_dialog', 'disable_revive',
  ])

  /** `choose:` group → picked option index (decided when the group first fires; re-rolled on each loop) */
  const variantPicks = new Map<string, number>()
  s.bus.on('timeline:loop', () => variantPicks.clear())

  // Parry prompt: idle until a tankbuster grants `parry_ready`
  const parryPrompt = createParryPrompt({
    bus: s.bus, player: s.player, buffs: s.buffSystem, input: s.input, setQte: (prompt) => { s.qte = prompt },
  })

  // Encounter mechanics run on the logic clock (frozen while paused)
  let announceSerial = 0
  const mechanics = new MechanicHost({
    bus: s.bus, entities: s.entityMgr, buffs: s.buffSystem, combat: s.combatResolver, input: s.input, player: s.player,
    arena: s.arena, deathZones: deathZoneMgr, zones: s.zoneMgr,
    buffDef: (id) => enc.localBuffs[id],
    setQte: (prompt) => { s.qte = prompt },
    announce: (text, ms) => {
      const serial = ++announceSerial
      s.setAnnounce(text)
      mechanics.after(ms, () => { if (serial === announceSerial) s.setAnnounce(null) })
    },
  }, MECHANICS)

  const revive = enc.revive
    ? createPlayerRevive({
      bus: s.bus, player: s.player, buffSystem: s.buffSystem,
      schedule: (ms, fn) => mechanics.after(ms, fn),
      relocate: () => {
        ;(s.player as any)._fallOffset = 0
        const spot = nearestSafeSpot({ x: s.player.position.x, y: s.player.position.y })
        s.player.position.x = spot.x
        s.player.position.y = spot.y
      },
    })
    : null
  if (revive) {
    s.combatResolver.registerBuffs(REVIVE_BUFFS)
    s.buffDefs = { ...s.buffDefs, ...REVIVE_BUFFS }
    s.bus.on('player:revived', () => s.setAnnounce(null))
  }

  /** Closest point that is inside the arena and outside every lethal zone (spiral search). */
  function nearestSafeSpot(from: { x: number; y: number }): { x: number; y: number } {
    const safe = (p: { x: number; y: number }) => s.arena.isInBounds(p) && !deathZoneMgr.isInAnyZone(p)
    if (safe(from)) return from
    for (let r = 0.5; r <= 60; r += 0.5) {
      for (let a = 0; a < 360; a += 15) {
        const rad = (a * Math.PI) / 180
        const p = { x: from.x + Math.sin(rad) * r, y: from.y + Math.cos(rad) * r }
        if (safe(p)) return p
      }
    }
    return { x: 0, y: 0 }
  }

  let handlingDeath = false
  function handlePlayerDeath(noRevive = false): void {
    // entity:died below re-enters through its listener; also ignore deaths while a revive is pending
    if (handlingDeath || s.battleOver || deathWindow.isActive() || revive?.isPending()) return
    handlingDeath = true
    // Pre-combat death (e.g. dev `kill` before engagement) would lock up
    // because scheduler.combatElapsed never advances pre-engage; force
    // engage here so the tick loop can finalize the window normally.
    if (!combatStarted) engageCombat()
    // Flip alive + zero MP + interrupt any in-progress cast + emit
    // entity:died so downstream systems (input-driver gate, target-clear,
    // HUD) see the dead state consistently. entityMgr.destroy is NOT
    // called — the player entity reference must stay valid for the death
    // window (DoT ticks on enemies still reference it as caster).
    if (s.player.alive) {
      s.player.alive = false
      s.player.mp = 0
      if (s.player.casting) s.skillResolver.interruptCast(s.player)
      s.bus.emit('entity:died', { entity: s.player })
    }
    if (noRevive || !revive?.tryRevive()) deathWindow.enter()
    handlingDeath = false
  }

  // Revived dormant entities join the fight; optional per-entity follow-up skill
  s.bus.on('entity:revived', ({ entity }: { entity: Entity }) => {
    aiEnabled.add(entity.id)
    aiMap.get(entity.id)?.unlockFacing()
    entity.target = s.player.id
    entity.inCombat = true
    const hook = enc.reviveHooks.get(entity.id)
    const skill = hook ? enc.skills.get(hook.use) : undefined
    if (hook && skill) {
      mechanics.after(hook.after, () => {
        if (entity.alive && !entity.dormant) s.skillResolver.tryUse(entity, skill)
      })
    }
  })

  // Timeline actions
  s.bus.on('timeline:action', (action: TimelineAction) => {
    if (s.battleOver) return
    if (!matchesCondition(action.when, s.player)) return
    if (action.fastForward && !FAST_FORWARD_ACTIONS.has(action.action)) return
    if (action.variant) {
      let picked = variantPicks.get(action.variant.group)
      if (picked === undefined) {
        picked = Math.floor(Math.random() * action.variant.count)
        variantPicks.set(action.variant.group, picked)
      }
      if (picked !== action.variant.index) return
    }
    const target = resolveEntity(action)

    switch (action.action) {
      case 'mechanic':
        if (!action.mechanic) break
        if (action.fastForward) FAST_FORWARD[action.mechanic]?.(mechanics, action.params ?? {}, s.entityMgr)
        else mechanics.start(action.mechanic, action.params)
        break
      case 'use':
        if (action.use && target) {
          // Ensure mobs target player so toward_target AOE works
          if (target.type === 'mob' || target.type === 'boss') target.target = s.player.id
          const skill = enc.skills.get(action.use)
          if (skill) s.skillResolver.tryUse(target, skill)
        }
        break
      case 'lock_facing':
        if (action.facing != null && target) {
          const ai = aiMap.get(target.id)
          ai?.lockFacing(action.facing)
        }
        break
      case 'enable_ai':
        if (target) {
          aiEnabled.add(target.id)
          const ai = aiMap.get(target.id)
          ai?.unlockFacing()
          target.target = s.player.id
        }
        break
      case 'disable_ai':
        if (target) aiEnabled.delete(target.id)
        break
      case 'teleport':
        if (target && action.position && action.fastForward) {
          target.position.x = action.position.x
          target.position.y = action.position.y
        } else if (target && action.position) {
          s.displacer.start(target, action.position.x, action.position.y, 400)
          s.bus.emit('entity:teleported', { entity: target, position: action.position })
        }
        break
      case 'set_visible':
        if (target) target.visible = action.value ?? true
        break
      case 'disable_revive':
        revive?.disable()
        break
      case 'set_speed':
        if (target) target.speed = action.speed ?? 0
        break
      case 'set_targetable':
        if (target) {
          target.targetable = action.value ?? true
          // Clear player target if entity becomes untargetable
          if (!target.targetable && s.player.target === target.id) {
            s.player.target = null
            s.bus.emit('target:released', { entity: s.player })
          }
        }
        break
      case 'add_death_zone':
        if (action.deathZone) {
          deathZoneMgr.add({
            id: action.deathZone.id,
            center: { x: action.deathZone.center.x, y: action.deathZone.center.y },
            facing: action.deathZone.facing ?? 0,
            shape: action.deathZone.shape,
            behavior: action.deathZone.behavior ?? 'lethal',
          })
        }
        break
      case 'remove_death_zone':
        if (action.deathZoneId) deathZoneMgr.remove(action.deathZoneId)
        break
      case 'camera_roll':
        if (action.angle != null) {
          s.sceneManager.rollCamera(action.angle, action.snapMs ?? 150, action.returnMs ?? 1500)
        }
        break
      case 'show_dialog':
        if (action.dialogText) s.setDialog(action.dialogText)
        break
      case 'hide_dialog':
        s.setDialog('')
        break
      case 'run_script':
        if (action.script) scriptRunner.run(action.script)
        break
      case 'spawn_entity': {
        const id = action.spawnId ?? action.entity ?? `mob_${Date.now()}`
        const type = (action.spawnType ?? 'mob') as EntityType
        const entity = s.entityMgr.create({
          id,
          type,
          group: action.spawnGroup ?? type,
          hp: action.spawnHp ?? 1000,
          maxHp: action.spawnHp ?? 1000,
          attack: action.spawnAttack ?? 100,
          speed: action.spawnSpeed ?? 0,
          size: action.spawnSize ?? 0.5,
          model: action.spawnModel,
          autoAttackRange: action.spawnAutoAttackRange ?? 5,
          aggroRange: action.spawnAggroRange ?? 999,
          position: { x: action.position?.x ?? 0, y: action.position?.y ?? 0, z: 0 },
          facing: 180,
        })
        entityMap.set(id, entity)
        knownGroups.add(entity.group)
        if (type === 'mob' || type === 'boss') {
          const ai = new BossBehavior(entity, {})
          ai.lockFacing(entity.facing)
          aiMap.set(id, ai)
        }
        break
      }
    }
  })

  s.getCombatElapsed = () => combatStarted ? scheduler.combatElapsed : null

  const DEATH_ZONE_DAMAGE = 999999
  const FALL_DURATION = 600 // ms to fall before dying
  let falling = false
  let fallElapsed = 0
  let fallReason = ''

  s.onLogicTick = (dt) => {
    if (!combatStarted) {
      const bossAI = aiMap.get('boss')
      if (bossAI?.checkAggro(s.player)) engageCombat()
    }
    if (combatStarted) {
      scheduler.checkTriggers({
        allKilledInGroup: (group) => {
          if (!knownGroups.has(group)) return false
          const alive = s.entityMgr.getAlive()
          return !alive.some((e) => e.group === group)
        },
      })
      scheduler.update(dt)
      mechanics.update(dt)
      parryPrompt.update(dt)
    }

    // Falling animation (triggered by death zone / out of bounds)
    if (falling) {
      fallElapsed += dt
      // Accelerating fall: quadratic ease-in
      const t = Math.min(fallElapsed / FALL_DURATION, 1)
      ;(s.player as any)._fallOffset = t * t * 8 // fall up to 8 units deep

      if (fallElapsed >= FALL_DURATION) {
        falling = false
        s.player.hp -= DEATH_ZONE_DAMAGE
        s.bus.emit('damage:dealt', {
          source: { id: '场地' } as any, target: s.player,
          amount: DEATH_ZONE_DAMAGE,
          skill: { name: fallReason },
        })
      }
      return // freeze game logic while falling
    }

    // Out-of-bounds: fall off the edge
    if (s.player.alive && !falling) {
      const pos = { x: s.player.position.x, y: s.player.position.y }
      if (s.arena.def.boundary === 'lethal' && !s.arena.isInBounds(pos)) {
        falling = true
        fallElapsed = 0
        fallReason = '场外坠落'
        ;(s.player as any)._fallOffset = 0
      }
    }

    // Death zone: instant kill (no fall animation)
    if (s.player.alive && !falling) {
      const pos = { x: s.player.position.x, y: s.player.position.y }
      if (deathZoneMgr.isInAnyZone(pos)) {
        s.player.hp -= DEATH_ZONE_DAMAGE
        s.bus.emit('damage:dealt', {
          source: { id: '场地' } as any, target: s.player,
          amount: DEATH_ZONE_DAMAGE,
          skill: { name: '死亡区域' },
        })
      }
    }

    // Update AI for all enabled entities
    for (const entityId of aiEnabled) {
      const entity = entityMap.get(entityId)
      const ai = aiMap.get(entityId)
      if (!entity?.alive || !ai || entity.casting) continue

      ai.updateFacing(s.player)
      ai.updateMovement(s.player, dt)

      if (bossAutoSkill && ai.tickAutoAttack(dt) && ai.isInAutoAttackRange(s.player)) {
        entity.target = s.player.id
        s.skillResolver.tryUse(entity, bossAutoSkill)
      }
    }

    updateTimelineSignal(s, dt, scheduler, enc.skills)

    // Death-window finalize check: runs AFTER tickPeriodicBuffs (fired in
    // GameScene.start before onLogicTick) so this frame's DoT ticks have
    // already had a chance to bring boss.hp to 0.
    deathWindow.tick(scheduler.combatElapsed)
  }

  s.start()
}

const TIMELINE_WINDOW_MS = 30000
const TIMELINE_MAX_ENTRIES = 5
const TIMELINE_FLASH_DURATION = 1000

function updateTimelineSignal(scene: GameScene, dt: number, scheduler: PhaseScheduler, skillMap: Map<string, import('@/core/types').SkillDef>): void {
  const elapsed = scheduler.combatElapsed
  const allActions = scheduler.getAllActions()
  const upcoming: TimelineEntry[] = []

  for (const { action, phaseId, absoluteAt } of allActions) {
    if (action.action !== 'use' || !action.use) continue
    const skill = skillMap.get(action.use)
    if (!skill) continue

    const timeUntil = absoluteAt - elapsed
    if (timeUntil > TIMELINE_WINDOW_MS) continue
    if (timeUntil < -TIMELINE_FLASH_DURATION - (skill.castTime || 0)) continue

    const key = `${phaseId}_${action.at}_${action.use}_${action.entity ?? ''}`
    const isInstant = skill.type !== 'spell' || skill.castTime === 0

    let state: 'upcoming' | 'casting' | 'flash' = 'upcoming'
    let flashElapsed = 0

    if (timeUntil <= 0) {
      if (isInstant) {
        state = 'flash'
      } else if (-timeUntil < skill.castTime) {
        state = 'casting'
      } else {
        state = 'flash'
      }
    }

    // Carry over flash elapsed from previous frame
    const prev = scene.timelineEntries.find((e) => e.key === key)
    if (state === 'flash') {
      flashElapsed = prev?.state === 'flash' ? prev.flashElapsed + dt : 0
    }

    if (flashElapsed < TIMELINE_FLASH_DURATION) {
      upcoming.push({ key, skillName: skill.name, state, timeUntil, castTime: skill.castTime, flashElapsed })
    }
  }

  upcoming.sort((a, b) => a.timeUntil - b.timeUntil)
  scene.timelineEntries = upcoming.slice(0, TIMELINE_MAX_ENTRIES)

  // Update current phase display
  const latestPhase = scheduler.getLatestPhase()
  if (latestPhase && latestPhase.total > 1) {
    const label = latestPhase.name ?? `P${latestPhase.index}`
    scene.currentPhaseInfo = { label, showLabel: true }
  } else {
    scene.currentPhaseInfo = null
  }
}
