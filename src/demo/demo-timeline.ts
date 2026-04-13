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
import { BossBehavior } from '@/ai/boss-behavior'
import { TimelineScheduler } from '@/timeline/timeline-scheduler'
import { InputManager } from '@/input/input-manager'
import { CameraController } from '@/game/camera-controller'
import { CombatResolver } from '@/game/combat-resolver'
import { PlayerInputDriver } from '@/game/player-input-driver'
import { DisplacementAnimator } from '@/game/displacement-animator'
import { UIManager } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { DEMO_SKILLS, AUTO_ATTACK, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'
import { DEMO_SKILL_BAR } from './demo-skill-bar'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'

const ARENA_DEF: ArenaDef = {
  name: 'Timeline Test Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

function makeFan(id: string, name: string, angle: number): SkillDef {
  return {
    id, name, type: 'ability',
    castTime: 0, cooldown: 0, gcd: false,
    targetType: 'aoe', requiresTarget: false, range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'fixed', angle },
      shape: { type: 'fan', radius: 12, angle: 90 },
      telegraphDuration: 3000, resolveDelay: 3000, hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    }],
  }
}

const FAN_SOUTH = makeFan('fan_south', '扇形斩・前', 180)
const FAN_WEST = makeFan('fan_west', '扇形斩・右', 270)
const FAN_NORTH = makeFan('fan_north', '扇形斩・后', 0)
const FAN_EAST = makeFan('fan_east', '扇形斩・左', 90)

const ENRAGE_SKILL: SkillDef = {
  id: 'enrage_blast', name: '时间切迫', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 99 },
    telegraphDuration: 0, resolveDelay: 0, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 999999 }],
  }],
}

const TIMELINE_ACTIONS: TimelineAction[] = [
  { at: 0, action: 'use', use: 'fan_south' },
  { at: 5000, action: 'use', use: 'fan_west' },
  { at: 10000, action: 'use', use: 'fan_north' },
  { at: 15000, action: 'use', use: 'fan_east' },
  { at: 20000, action: 'use', use: 'fan_south' },
  { at: 25000, action: 'use', use: 'fan_west' },
]

const ENRAGE_CONFIG = { time: 30000, castTime: 10000, skill: 'enrage_blast' }

let cleanup: (() => void) | null = null

export function startTimelineDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  if (cleanup) { cleanup(); cleanup = null }

  // Core
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(ARENA_DEF)
  const gameLoop = new GameLoop()

  const displacer = new DisplacementAnimator(arena)
  new CombatResolver(bus, entityMgr, buffSystem, arena, displacer)

  const skillMap = new Map<string, SkillDef>()
  for (const s of [FAN_SOUTH, FAN_WEST, FAN_NORTH, FAN_EAST, ENRAGE_SKILL]) {
    skillMap.set(s.id, s)
  }

  // Rendering
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  // Entities
  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -8, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })
  player.inCombat = true

  const boss = entityMgr.create({
    id: 'boss', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 200000, maxHp: 200000, attack: 1,
    speed: 0, size: 1.5, autoAttackRange: 5, facing: 180,
  })
  boss.inCombat = true

  const bossAI = new BossBehavior(boss, 5, 999999)
  bossAI.lockFacing(180)

  const scheduler = new TimelineScheduler(bus, TIMELINE_ACTIONS, ENRAGE_CONFIG)

  // Camera + Input + Player
  const camera = new CameraController()
  camera.follow(player)

  const input = new InputManager(canvas)
  const playerDriver = new PlayerInputDriver(
    player, input, skillResolver, buffSystem, entityMgr, bus, arena,
    {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
  )

  // UI
  const uiManager = new UIManager(uiRoot, bus, DEMO_SKILL_BAR)
  uiManager.bindScene(sceneManager)
  const pauseMenu = new PauseMenu(uiRoot)
  const devTerminal = new DevTerminal(bus, new CommandRegistry())
  devTerminal.mount(uiRoot)

  let paused = false
  let battleOver = false
  let enrageCasting = false
  let enrageCastElapsed = 0

  pauseMenu.onResumeGame(() => { paused = false; pauseMenu.hide() })
  pauseMenu.onQuitGame(() => window.location.reload())

  // Timeline action handler
  bus.on('timeline:action', (action: TimelineAction) => {
    if (battleOver) return
    if (action.action === 'use' && action.use) {
      const skill = skillMap.get(action.use)
      if (skill) skillResolver.tryUse(boss, skill)
    }
    if (action.action === 'lock_facing' && action.facing != null) {
      bossAI.lockFacing(action.facing)
    }
  })

  bus.on('timeline:enrage', (payload: { castTime: number }) => {
    if (battleOver) return
    enrageCasting = true
    enrageCastElapsed = 0
    bus.emit('skill:cast_start', { caster: boss, skill: { name: '时间切迫' } })
  })

  // Player death check
  bus.on('damage:dealt', (payload: { target: Entity }) => {
    if (payload.target.id === player.id && payload.target.hp <= 0) {
      onBattleEnd('wipe')
    }
  })

  function onBattleEnd(result: 'victory' | 'wipe') {
    if (battleOver) return
    battleOver = true
    bus.emit('combat:ended', { result })

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); z-index: 80; cursor: pointer;
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
    hint.style.cssText = 'font-size: 14px; color: #888;'
    overlay.appendChild(hint)
    overlay.addEventListener('click', () => startTimelineDemo(canvas, uiRoot))
    uiRoot.appendChild(overlay)
  }

  // Game loop
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || battleOver) return
    if (devTerminal.isVisible()) return

    const result = playerDriver.update(dt)
    if (result === 'pause') { paused = true; pauseMenu.show(); return }

    scheduler.update(dt)

    if (enrageCasting) {
      enrageCastElapsed += dt
      boss.casting = {
        skillId: 'enrage_blast', targetId: null,
        elapsed: enrageCastElapsed, castTime: ENRAGE_CONFIG.castTime,
      }
      if (enrageCastElapsed >= ENRAGE_CONFIG.castTime) {
        enrageCasting = false
        boss.casting = null
        bus.emit('skill:cast_complete', { caster: boss, skill: ENRAGE_SKILL })
        skillResolver.tryUse(boss, ENRAGE_SKILL)
      }
    }

    displacer.update(dt)
    zoneMgr.update(dt)
  })

  sceneManager.startRenderLoop(() => {
    const now = performance.now()
    const delta = now - lastTime
    lastTime = now

    const mousePos = sceneManager.pickGroundPosition()
    if (mousePos) input.updateMouseWorldPos(mousePos)

    gameLoop.tick(delta)

    const camPos = camera.update(delta)
    sceneManager.setCameraTarget(camPos.x, camPos.y)

    entityRenderer.updateAll(entityMgr.getAlive())
    aoeRenderer.update(now)
    hitEffectRenderer.update(delta, (id) => entityMgr.get(id))
    uiManager.update(player, boss, (sid) => skillResolver.getCooldown(player.id, sid))
  })

  const onResize = () => sceneManager.engine.resize()
  window.addEventListener('resize', onResize)

  cleanup = () => {
    sceneManager.dispose()
    input.dispose()
    window.removeEventListener('resize', onResize)
    while (uiRoot.firstChild) uiRoot.removeChild(uiRoot.firstChild)
  }
}
