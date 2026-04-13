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
import { InputManager } from '@/input/input-manager'
import { PlayerController } from './player-controller'
import { UIManager } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { DEMO_SKILLS, AUTO_ATTACK } from './demo-skills'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'

const DEMO_ARENA_DEF: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

export function startDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  // --- Core systems ---
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(DEMO_ARENA_DEF)
  const gameLoop = new GameLoop()

  // --- DevTools ---
  const commandRegistry = new CommandRegistry()
  const devTerminal = new DevTerminal(bus, commandRegistry)

  // --- Rendering ---
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, DEMO_ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  // --- Entities ---
  const player = entityMgr.create({
    id: 'player',
    type: 'player',
    position: { x: 0, y: -5, z: 0 },
    hp: 30000,
    maxHp: 30000,
    attack: 1000,
    speed: 6,
    size: 0.5,
    skillIds: DEMO_SKILLS.map((s) => s.id),
  })
  player.inCombat = true

  const dummy = entityMgr.create({
    id: 'dummy',
    type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 999999,
    maxHp: 999999,
    attack: 0,
    speed: 0,
    size: 1.5,
  })

  // --- Input ---
  const input = new InputManager(canvas)

  // --- Player controller ---
  const playerCtrl = new PlayerController(
    player,
    input,
    skillResolver,
    buffSystem,
    entityMgr,
    bus,
    DEMO_SKILLS,
    arena,
    3000,
    AUTO_ATTACK,
  )

  // --- UI ---
  const uiManager = new UIManager(uiRoot, bus, DEMO_SKILLS)
  const pauseMenu = new PauseMenu(uiRoot)
  devTerminal.mount(uiRoot)

  // --- Pause ---
  let paused = false

  pauseMenu.onResumeGame(() => {
    paused = false
    pauseMenu.hide()
  })

  pauseMenu.onQuitGame(() => {
    window.location.reload()
  })

  // --- Damage handling: single-target skills ---
  bus.on('skill:cast_complete', (payload: { caster: Entity; skill: SkillDef | any }) => {
    if (payload.caster.id !== player.id) return
    const skill = payload.skill as SkillDef | undefined
    if (!skill?.effects) return

    const target = player.target ? entityMgr.get(player.target) : null
    if (!target) return

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const dmg = calculateDamage({
          attack: player.attack,
          potency: effect.potency,
          increases: buffSystem.getDamageIncreases(player),
          mitigations: buffSystem.getMitigations(target),
        })
        target.hp = Math.max(0, target.hp - dmg)
        bus.emit('damage:dealt', { source: player, target, amount: dmg, skill })
      }
    }
  })

  // --- Damage handling: AoE zones ---
  bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
    for (const hit of payload.hitEntities) {
      for (const effect of payload.zone.def.effects) {
        if (effect.type === 'damage') {
          const dmg = calculateDamage({
            attack: player.attack,
            potency: effect.potency,
            increases: buffSystem.getDamageIncreases(player),
            mitigations: buffSystem.getMitigations(hit),
          })
          hit.hp = Math.max(0, hit.hp - dmg)
          bus.emit('damage:dealt', { source: player, target: hit, amount: dmg, skill: null })
        }
      }
    }
  })

  // --- Mouse world position (raycast ground plane) ---
  function updateMouseWorld(): void {
    const pickResult = sceneManager.scene.pick(
      sceneManager.scene.pointerX,
      sceneManager.scene.pointerY,
    )
    if (pickResult?.pickedPoint) {
      input.updateMouseWorldPos({
        x: pickResult.pickedPoint.x,
        y: pickResult.pickedPoint.z, // Babylon Z → game Y
      })
    }
  }

  // --- Game loop ---
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused) return
    if (devTerminal.isVisible()) return // freeze game while terminal is open

    const result = playerCtrl.update(dt)
    if (result === 'pause') {
      paused = true
      pauseMenu.show()
      return
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
    uiManager.update(player, dummy, (skillId) => skillResolver.getCooldown(player.id, skillId))
  })

  window.addEventListener('resize', () => sceneManager.engine.resize())

  console.log('XIV Stage Play — Training Dummy Demo Ready')
  console.log('Controls: WASD move, mouse aim, right-click lock target, 1-4 skills, ~ dev terminal')
}
