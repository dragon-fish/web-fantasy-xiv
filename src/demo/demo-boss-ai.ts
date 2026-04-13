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
import { InputManager } from '@/input/input-manager'
import { PlayerController } from './player-controller'
import { UIManager } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { DEMO_SKILLS, AUTO_ATTACK } from './demo-skills'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'

const ARENA_DEF: ArenaDef = {
  name: 'Boss Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

/** Boss auto-attack: ability, no GCD, potency=1 */
const BOSS_AUTO_ATTACK: SkillDef = {
  id: 'boss_auto',
  name: '攻击',
  type: 'ability',
  castTime: 0,
  cooldown: 0,
  gcd: false,
  targetType: 'single',
  requiresTarget: true,
  range: 5,
  effects: [{ type: 'damage', potency: 1 }],
}

export function startBossAiDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  // --- Core systems ---
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(ARENA_DEF)
  const gameLoop = new GameLoop()

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
    position: { x: 0, y: -12, z: 0 },
    hp: 30000,
    maxHp: 30000,
    attack: 1000,
    speed: 6,
    size: 0.5,
    skillIds: DEMO_SKILLS.map((s) => s.id),
  })

  const boss = entityMgr.create({
    id: 'boss',
    type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 200000,
    maxHp: 200000,
    attack: 1, // potency=1 → 1 damage per auto
    speed: 3,
    size: 1.5,
    facing: 180, // face south (toward player spawn)
  })

  // --- Boss AI ---
  const bossAI = new BossBehavior(boss, 5, 3000, 8)

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

  pauseMenu.onResumeGame(() => {
    paused = false
    pauseMenu.hide()
  })

  pauseMenu.onQuitGame(() => {
    window.location.reload()
  })

  // --- Aggro: player attacks boss → boss engages ---
  bus.on('damage:dealt', (payload: { source: Entity; target: Entity }) => {
    if (payload.target.id === boss.id && !boss.inCombat) {
      bossAI.engage()
      boss.target = player.id
      player.inCombat = true
      bus.emit('combat:started', { entities: [player, boss] })
    }
  })

  // --- Damage handling: single-target skills (any caster) ---
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

  // --- Damage handling: AoE zones ---
  bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
    // Determine caster from zone
    const casterId = payload.zone.casterId
    const caster = casterId ? entityMgr.get(casterId) : null
    const attackPower = caster?.attack ?? player.attack

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
        }
      }
    }
  })

  // --- Mouse world position ---
  function updateMouseWorld(): void {
    const pickResult = sceneManager.scene.pick(
      sceneManager.scene.pointerX,
      sceneManager.scene.pointerY,
    )
    if (pickResult?.pickedPoint) {
      input.updateMouseWorldPos({
        x: pickResult.pickedPoint.x,
        y: pickResult.pickedPoint.z,
      })
    }
  }

  // --- Game loop ---
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused) return
    if (devTerminal.isVisible()) return

    const result = playerCtrl.update(dt)
    if (result === 'pause') {
      paused = true
      pauseMenu.show()
      return
    }

    // --- Boss AI update ---
    // Aggro check (proximity)
    if (!boss.inCombat && bossAI.checkAggro(player)) {
      bossAI.engage()
      boss.target = player.id
      player.inCombat = true
      bus.emit('combat:started', { entities: [player, boss] })
    }

    // Combat behavior
    if (boss.inCombat && boss.alive) {
      bossAI.updateFacing(player)
      bossAI.updateMovement(player, dt)

      // Auto-attack
      if (bossAI.tickAutoAttack(dt) && bossAI.isInAutoAttackRange(player)) {
        boss.target = player.id
        skillResolver.tryUse(boss, BOSS_AUTO_ATTACK)
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

  window.addEventListener('resize', () => sceneManager.engine.resize())

  console.log('XIV Stage Play — Boss AI Demo Ready')
  console.log('Boss is idle in center. Walk into aggro range or attack to engage.')
  console.log('Controls: WASD move, mouse aim, right-click lock, 1-6 skills, ~ dev terminal')
}
