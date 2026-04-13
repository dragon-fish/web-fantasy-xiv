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
import { DebugInfo } from '@/ui/debug-info'
import type { ArenaDef } from '@/core/types'

const DEMO_ARENA: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

export function startDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(DEMO_ARENA)
  const gameLoop = new GameLoop()
  const displacer = new DisplacementAnimator(arena)

  new CombatResolver(bus, entityMgr, buffSystem, arena, displacer)

  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, DEMO_ARENA)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -5, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })
  player.inCombat = true

  const dummy = entityMgr.create({
    id: 'dummy', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 999999, maxHp: 999999, attack: 0,
    speed: 0, size: 1.5, autoAttackRange: 5, facing: 180,
  })

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

  const uiManager = new UIManager(uiRoot, bus, DEMO_SKILL_BAR)
  uiManager.bindScene(sceneManager)
  const pauseMenu = new PauseMenu(uiRoot)
  const devTerminal = new DevTerminal(bus, new CommandRegistry())
  devTerminal.mount(uiRoot)
  const debugInfo = new DebugInfo(uiRoot)

  let paused = false
  pauseMenu.onResumeGame(() => { paused = false; pauseMenu.hide() })
  pauseMenu.onQuitGame(() => window.location.reload())

  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || devTerminal.isVisible()) return
    const result = playerDriver.update(dt)
    if (result === 'pause') { paused = true; pauseMenu.show(); return }
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
    uiManager.update(player, dummy, (sid) => skillResolver.getCooldown(player.id, sid))
    debugInfo.update(delta, player, null) // no combat timer in training dummy
  })

  window.addEventListener('resize', () => sceneManager.engine.resize())
}
