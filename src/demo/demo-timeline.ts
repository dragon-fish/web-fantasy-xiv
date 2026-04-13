import { SceneManager } from '@/renderer/scene-manager'
import { ArenaRenderer } from '@/renderer/arena-renderer'
import { EntityRenderer } from '@/renderer/entity-renderer'
import { AoeRenderer } from '@/renderer/aoe-renderer'
import { HitEffectRenderer } from '@/renderer/hit-effect-renderer'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { GameLoop } from '@/core/game-loop'
import { SkillResolver } from '@/skill/skill-resolver'
import { BuffSystem } from '@/combat/buff'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { Arena } from '@/arena/arena'
import { calculateDamage } from '@/combat/damage'
import { BossBehavior } from '@/ai/boss-behavior'
import { TimelineScheduler } from '@/timeline/timeline-scheduler'
import { InputManager } from '@/input/input-manager'
import { PlayerController } from './player-controller'
import { UIManager } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { DEMO_SKILLS, AUTO_ATTACK } from './demo-skills'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'

const ARENA_DEF: ArenaDef = {
  name: 'Timeline Test Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

// Boss fan AoE: instant ability, but zone has 3s telegraph + 3s resolve delay
const BOSS_FAN: SkillDef = {
  id: 'boss_fan',
  name: '扇形斩',
  type: 'ability',
  castTime: 0,
  cooldown: 0,
  gcd: false,
  targetType: 'aoe',
  requiresTarget: false,
  range: 0,
  zones: [{
    anchor: { type: 'caster' },
    direction: { type: 'caster_facing' },
    shape: { type: 'fan', radius: 12, angle: 90 },
    telegraphDuration: 3000,
    resolveDelay: 3000,
    hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 15000 }],
  }],
}

// Enrage: massive circle, instant kill
const ENRAGE_SKILL: SkillDef = {
  id: 'enrage_blast',
  name: '时间切迫',
  type: 'ability',
  castTime: 0,
  cooldown: 0,
  gcd: false,
  targetType: 'aoe',
  requiresTarget: false,
  range: 0,
  zones: [{
    anchor: { type: 'caster' },
    direction: { type: 'none' },
    shape: { type: 'circle', radius: 99 },
    telegraphDuration: 0,
    resolveDelay: 0,
    hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 999999 }],
  }],
}

// Timeline: clockwise fan rotation every 5s, enrage at 30s
const TIMELINE_ACTIONS: TimelineAction[] = [
  // South (180°)
  { at: 0, action: 'lock_facing', facing: 180 },
  { at: 0, action: 'use', use: 'boss_fan' },
  // West (270°)
  { at: 5000, action: 'lock_facing', facing: 270 },
  { at: 5000, action: 'use', use: 'boss_fan' },
  // North (0°)
  { at: 10000, action: 'lock_facing', facing: 0 },
  { at: 10000, action: 'use', use: 'boss_fan' },
  // East (90°)
  { at: 15000, action: 'lock_facing', facing: 90 },
  { at: 15000, action: 'use', use: 'boss_fan' },
  // South again
  { at: 20000, action: 'lock_facing', facing: 180 },
  { at: 20000, action: 'use', use: 'boss_fan' },
  // West again
  { at: 25000, action: 'lock_facing', facing: 270 },
  { at: 25000, action: 'use', use: 'boss_fan' },
]

const ENRAGE_CONFIG = { time: 30000, castTime: 10000, skill: 'enrage_blast' }

let cleanup: (() => void) | null = null

export function startTimelineDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  // Clean up previous run
  if (cleanup) {
    cleanup()
    cleanup = null
  }
  // --- Core systems ---
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(ARENA_DEF)
  const gameLoop = new GameLoop()

  // --- Skill registry ---
  const skillMap = new Map<string, SkillDef>()
  skillMap.set(BOSS_FAN.id, BOSS_FAN)
  skillMap.set(ENRAGE_SKILL.id, ENRAGE_SKILL)

  // --- DevTools ---
  const commandRegistry = new CommandRegistry()
  const devTerminal = new DevTerminal(bus, commandRegistry)

  // --- Rendering ---
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  // --- Entities ---
  const player = entityMgr.create({
    id: 'player',
    type: 'player',
    position: { x: 0, y: -8, z: 0 },
    hp: 30000,
    maxHp: 30000,
    attack: 1000,
    speed: 6,
    size: 0.5,
    autoAttackRange: 5,
    skillIds: DEMO_SKILLS.map((s) => s.id),
  })
  player.inCombat = true

  const boss = entityMgr.create({
    id: 'boss',
    type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 200000,
    maxHp: 200000,
    attack: 1,
    speed: 0, // no movement
    size: 1.5,
    autoAttackRange: 5,
    facing: 180,
  })
  boss.inCombat = true

  // --- Boss AI (locked, no movement/facing/auto-attack) ---
  const bossAI = new BossBehavior(boss, 5, 999999) // huge interval = no auto-attack
  bossAI.lockFacing(180)

  // --- Timeline Scheduler ---
  const scheduler = new TimelineScheduler(bus, TIMELINE_ACTIONS, ENRAGE_CONFIG)

  // --- Input ---
  const input = new InputManager(canvas)

  // --- Player controller ---
  const playerCtrl = new PlayerController(
    player, input, skillResolver, buffSystem,
    entityMgr, bus, DEMO_SKILLS, arena, 3000, AUTO_ATTACK,
  )

  // --- UI ---
  const uiManager = new UIManager(uiRoot, bus, DEMO_SKILLS)
  const pauseMenu = new PauseMenu(uiRoot)
  devTerminal.mount(uiRoot)

  let paused = false
  let battleOver = false
  let enrageCasting = false
  let enrageCastElapsed = 0

  pauseMenu.onResumeGame(() => {
    paused = false
    pauseMenu.hide()
  })

  pauseMenu.onQuitGame(() => {
    window.location.reload()
  })

  // --- Timeline action handler ---
  bus.on('timeline:action', (action: TimelineAction) => {
    if (battleOver) return

    if (action.action === 'use' && action.use) {
      const skill = skillMap.get(action.use)
      if (skill) {
        skillResolver.tryUse(boss, skill)
      }
    }

    if (action.action === 'lock_facing' && action.facing != null) {
      bossAI.lockFacing(action.facing)
    }
  })

  // --- Enrage handler ---
  bus.on('timeline:enrage', (payload: { castTime: number; skill: string }) => {
    if (battleOver) return
    enrageCasting = true
    enrageCastElapsed = 0
    // Show cast bar for enrage
    bus.emit('skill:cast_start', { caster: boss, skill: { name: '时间切迫' } })
  })

  // --- Damage handling (both single + AoE, any caster) ---
  bus.on('skill:cast_complete', (payload: { caster: Entity; skill: SkillDef | any }) => {
    const skill = payload.skill as SkillDef | undefined
    if (!skill?.effects) return
    const caster = payload.caster
    const target = caster.target ? entityMgr.get(caster.target) : null
    if (!target) return

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const dmg = calculateDamage({
          attack: caster.attack,
          potency: effect.potency,
          increases: buffSystem.getDamageIncreases(caster),
          mitigations: buffSystem.getMitigations(target),
        })
        target.hp = Math.max(0, target.hp - dmg)
        bus.emit('damage:dealt', { source: caster, target, amount: dmg, skill })
      }
    }
  })

  bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
    const casterId = payload.zone.casterId
    const caster = casterId ? entityMgr.get(casterId) : null
    const attackPower = caster?.attack ?? 1

    for (const hit of payload.hitEntities) {
      for (const effect of payload.zone.def.effects) {
        if (effect.type === 'damage') {
          const dmg = calculateDamage({
            attack: attackPower,
            potency: effect.potency,
            increases: caster ? buffSystem.getDamageIncreases(caster) : [],
            mitigations: buffSystem.getMitigations(hit),
          })
          hit.hp = Math.max(0, hit.hp - dmg)
          bus.emit('damage:dealt', { source: caster ?? hit, target: hit, amount: dmg, skill: null })

          // Check player death
          if (hit.id === player.id && hit.hp <= 0) {
            onBattleEnd('wipe')
          }
        }
      }
    }
  })

  // --- Battle end ---
  function onBattleEnd(result: 'victory' | 'wipe') {
    if (battleOver) return
    battleOver = true
    bus.emit('combat:ended', { result })

    // Show overlay
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.6); z-index: 80;
    `
    const text = document.createElement('h2')
    text.textContent = result === 'wipe' ? 'DEFEATED' : 'VICTORY'
    text.style.cssText = `
      font-size: 32px; color: ${result === 'wipe' ? '#ff4444' : '#44ff44'};
      font-weight: 300; letter-spacing: 6px; margin-bottom: 20px;
    `
    overlay.appendChild(text)

    const hint = document.createElement('p')
    hint.textContent = 'Click to retry'
    hint.style.cssText = 'font-size: 14px; color: #888; cursor: pointer;'
    overlay.appendChild(hint)

    overlay.style.cursor = 'pointer'
    overlay.addEventListener('click', () => startTimelineDemo(canvas, uiRoot))
    uiRoot.appendChild(overlay)
  }

  // --- Mouse world position ---
  function updateMouseWorld(): void {
    const pos = sceneManager.pickGroundPosition()
    if (pos) input.updateMouseWorldPos(pos)
  }

  // --- Game loop ---
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || battleOver) return
    if (devTerminal.isVisible()) return

    const result = playerCtrl.update(dt)
    if (result === 'pause') {
      paused = true
      pauseMenu.show()
      return
    }

    // Timeline
    scheduler.update(dt)

    // Enrage cast progress
    if (enrageCasting) {
      enrageCastElapsed += dt
      boss.casting = {
        skillId: 'enrage_blast',
        targetId: null,
        elapsed: enrageCastElapsed,
        castTime: ENRAGE_CONFIG.castTime,
      }

      if (enrageCastElapsed >= ENRAGE_CONFIG.castTime) {
        enrageCasting = false
        boss.casting = null
        bus.emit('skill:cast_complete', { caster: boss, skill: ENRAGE_SKILL })
        // Fire enrage AoE
        skillResolver.tryUse(boss, ENRAGE_SKILL)
      }
    }

    zoneMgr.update(dt)
  })

  sceneManager.startRenderLoop(() => {
    const now = performance.now()
    const delta = now - lastTime
    lastTime = now

    updateMouseWorld()
    gameLoop.tick(delta)

    entityRenderer.updateAll(entityMgr.getAlive())
    aoeRenderer.update(now)
    hitEffectRenderer.update(delta, (id) => entityMgr.get(id))
    sceneManager.followTarget(player.position.x, player.position.y)
    uiManager.update(player, boss, (skillId) => skillResolver.getCooldown(player.id, skillId))
  })

  const onResize = () => sceneManager.engine.resize()
  window.addEventListener('resize', onResize)

  // Register cleanup for restart
  cleanup = () => {
    sceneManager.dispose()
    input.dispose()
    window.removeEventListener('resize', onResize)
    // Remove all UI children added by this run
    while (uiRoot.firstChild) uiRoot.removeChild(uiRoot.firstChild)
  }

  console.log('XIV Stage Play — Timeline Demo')
  console.log('Boss rotates 90° fan clockwise every 5s. Enrage at 30s. Dodge!')
}
