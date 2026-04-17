import { Engine } from '@babylonjs/core'
import { GameScene } from '@/game/game-scene'
import { BossBehavior } from '@/ai/boss-behavior'
import { PhaseScheduler } from '@/timeline/phase-scheduler'
import { loadEncounter } from '@/game/encounter-loader'
import { DeathZoneManager } from '@/arena/death-zone-manager'
import { ScriptRunner } from '@/timeline/script-runner'
import { getJob } from '@/jobs'
import type { TimelineEntry } from '@/timeline/types'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'
import type { EncounterData } from '@/game/encounter-loader'
import type { BuffDef, EntityType } from '@/core/types'
import type { BuffSystem } from '@/combat/buff'
import type { CombatResolver } from '@/game/combat-resolver'

/** Context passed to the battle init callback */
export interface BattleInitContext {
  player: Entity
  buffSystem: BuffSystem
  combatResolver: CombatResolver
  registerBuffs: (buffs: Record<string, BuffDef>) => void
}

export type BattleInitCallback = (ctx: BattleInitContext) => void

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
    initScene(canvas, uiRoot, encounter, url, jobOverride, onInit)
  } catch (err) {
    loading.textContent = `Failed to load encounter: ${err}`
    loading.style.color = '#ff4444'
  }
}

function initScene(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement, enc: EncounterData, encounterUrl: string, jobOverride?: string, onInit?: BattleInitCallback): void {
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
  s.buffDefs = job.buffMap

  s.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    ...enc.player,
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

  // Init callback: apply practice mode buffs, echo, etc.
  if (onInit) {
    onInit({
      player: s.player,
      buffSystem: s.buffSystem,
      combatResolver: s.combatResolver,
      registerBuffs: (buffs) => s.combatResolver.registerBuffs(buffs),
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
    s.setAnnounce('战斗开始')
    s.bus.emit('combat:started', { entities: [s.player, boss] })
  }

  s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity; amount: number; skill: any }) => {
    if (payload.target.id === boss.id && !combatStarted) engageCombat()
    // Check victory: boss dead
    if (payload.target.id === boss.id && payload.target.hp <= 0) {
      if (!s.battleOver) {
        scriptRunner.disposeAll()
        s.bus.emit('combat:ended', { result: 'victory' })
        s.endBattle('victory')
      }
    }
    // Check player dead
    if (payload.target.id === s.player.id && payload.target.hp <= 0) {
      if (!s.battleOver) {
        scriptRunner.disposeAll()
        s.bus.emit('combat:ended', { result: 'wipe' })
        s.endBattle('wipe')
      }
    }
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

  // Generic mob death cleanup: clear stale target + cancel orphan AOE zones
  s.bus.on('entity:died', (payload: { entity: Entity }) => {
    const dead = payload.entity
    if (s.player.target === dead.id) {
      s.player.target = null
      s.bus.emit('target:released', { entity: s.player })
    }
    s.zoneMgr.cancelAllByCaster(dead.id)
  })

  // Timeline actions
  s.bus.on('timeline:action', (action: TimelineAction) => {
    if (s.battleOver) return
    const target = resolveEntity(action)

    switch (action.action) {
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
        if (target && action.position) {
          s.displacer.start(target, action.position.x, action.position.y, 400)
          s.bus.emit('entity:teleported', { entity: target, position: action.position })
        }
        break
      case 'set_visible':
        if (target) target.visible = action.value ?? true
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
