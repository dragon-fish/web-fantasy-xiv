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
import type { Entity } from '@/entity/entity'

const ARENA_DEF: ArenaDef = {
  name: 'Boss Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

const BOSS_AUTO_ATTACK: SkillDef = {
  id: 'boss_auto', name: '攻击', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'single', requiresTarget: true, range: 5,
  effects: [{ type: 'damage', potency: 1 }],
}

export function startBossAiDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(ARENA_DEF)
  const gameLoop = new GameLoop()
  const displacer = new DisplacementAnimator(arena)

  new CombatResolver(bus, entityMgr, buffSystem, arena, displacer)

  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })

  const boss = entityMgr.create({
    id: 'boss', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 200000, maxHp: 200000, attack: 1,
    speed: 3, size: 1.5, autoAttackRange: 5, aggroRange: 8, facing: 180,
  })

  const bossAI = new BossBehavior(boss, 5, 3000, 8)

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

  let paused = false
  pauseMenu.onResumeGame(() => { paused = false; pauseMenu.hide() })
  pauseMenu.onQuitGame(() => window.location.reload())

  bus.on('damage:dealt', (payload: { source: Entity; target: Entity }) => {
    if (payload.target.id === boss.id && !boss.inCombat) {
      bossAI.engage()
      boss.target = player.id
      player.inCombat = true
      bus.emit('combat:started', { entities: [player, boss] })
    }
  })

  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || devTerminal.isVisible()) return
    const result = playerDriver.update(dt)
    if (result === 'pause') { paused = true; pauseMenu.show(); return }

    if (!boss.inCombat && bossAI.checkAggro(player)) {
      bossAI.engage()
      boss.target = player.id
      player.inCombat = true
      bus.emit('combat:started', { entities: [player, boss] })
    }
    if (boss.inCombat && boss.alive) {
      bossAI.updateFacing(player)
      bossAI.updateMovement(player, dt)
      if (bossAI.tickAutoAttack(dt) && bossAI.isInAutoAttackRange(player)) {
        boss.target = player.id
        skillResolver.tryUse(boss, BOSS_AUTO_ATTACK)
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

  window.addEventListener('resize', () => sceneManager.engine.resize())
}
