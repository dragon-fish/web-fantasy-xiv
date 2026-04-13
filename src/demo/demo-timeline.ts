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
import { TimelineDisplay } from '@/ui/timeline-display'
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

// ========== SKILL DEFINITIONS ==========

// --- 90° fans (3s cast) ---
function makeFan90(id: string, name: string, angle: number): SkillDef {
  return {
    id, name, type: 'spell',
    castTime: 3000, cooldown: 0, gcd: false,
    targetType: 'aoe', requiresTarget: false, range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'fixed', angle },
      shape: { type: 'fan', radius: 12, angle: 90 },
      resolveDelay: 3000, hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    }],
  }
}
const FAN_S = makeFan90('fan_s', '扇形斩・前', 180)
const FAN_W = makeFan90('fan_w', '扇形斩・右', 270)
const FAN_N = makeFan90('fan_n', '扇形斩・后', 0)
const FAN_E = makeFan90('fan_e', '扇形斩・左', 90)

// --- Left-right cleave (one 8s spell, two zones with staggered telegraph) ---
const LR_CLEAVE: SkillDef = {
  id: 'lr_cleave', name: '左右开弓', type: 'spell',
  castTime: 8000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Left 180°: shows immediately, resolves at 5s
    {
      anchor: { type: 'caster' },
      direction: { type: 'fixed', angle: 90 },
      shape: { type: 'fan', radius: 14, angle: 180 },
      resolveDelay: 5000, telegraphBefore: 5000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
    // Right 180°: shows at 3s, resolves at 8s
    {
      anchor: { type: 'caster' },
      direction: { type: 'fixed', angle: 270 },
      shape: { type: 'fan', radius: 14, angle: 180 },
      resolveDelay: 8000, telegraphBefore: 5000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
  ],
}

// --- Pull (5s cast) ---
const PULL_CAST: SkillDef = {
  id: 'pull_cast', name: '引力漩涡', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 20 },
    resolveDelay: 5000, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 2000 }, { type: 'pull', distance: 6, source: { type: 'caster' } }],
    displacementHint: 'pull',
  }],
}

// --- Pull (instant, no cast) ---
const PULL_INSTANT: SkillDef = {
  id: 'pull_instant', name: '引力崩塌', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 20 },
    resolveDelay: 0, hitEffectDuration: 300,
    effects: [{ type: 'pull', distance: 6, source: { type: 'caster' } }],
    displacementHint: 'pull',
  }],
}

// --- Iron Chariot + Lunar Dynamo (one 8s spell, staggered) ---
const IRON_LUNAR: SkillDef = {
  id: 'iron_lunar', name: '钢铁月环', type: 'spell',
  castTime: 8000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Iron Chariot (circle): shows immediately, resolves at 5s
    {
      anchor: { type: 'caster' }, direction: { type: 'none' },
      shape: { type: 'circle', radius: 6 },
      resolveDelay: 5000, telegraphBefore: 5000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
    // Lunar Dynamo (ring): shows at 3s, resolves at 8s
    {
      anchor: { type: 'caster' }, direction: { type: 'none' },
      shape: { type: 'ring', innerRadius: 6, outerRadius: 14 },
      resolveDelay: 8000, telegraphBefore: 5000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
  ],
}

// --- Cross cut (5s cast, 2 crossing rectangles, telegraph 3s before) ---
// Standing at center takes 2 hits — intentional
const CROSS_CUT: SkillDef = {
  id: 'cross_cut', name: '十字斩', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Vertical bar (N↔S, centered on boss)
    {
      anchor: { type: 'position', x: 0, y: 15 },
      direction: { type: 'fixed', angle: 180 },
      shape: { type: 'rect', length: 30, width: 4 },
      resolveDelay: 5000, telegraphBefore: 3000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
    // Horizontal bar (E↔W, centered on boss)
    {
      anchor: { type: 'position', x: -15, y: 0 },
      direction: { type: 'fixed', angle: 90 },
      shape: { type: 'rect', length: 30, width: 4 },
      resolveDelay: 5000, telegraphBefore: 3000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
  ],
}

// --- Boss front 180° fan from current facing (used when AI is on) ---
const BOSS_FRONT_CLEAVE: SkillDef = {
  id: 'boss_front', name: '前方斩击', type: 'spell',
  castTime: 3000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' },
    direction: { type: 'caster_facing' }, // follows boss current facing
    shape: { type: 'fan', radius: 12, angle: 180 },
    resolveDelay: 3000, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 12000 }],
  }],
}

// --- Enrage (shown on timeline as a spell, actual kill on resolve) ---
const ENRAGE_CAST: SkillDef = {
  id: 'enrage', name: '时间切迫', type: 'spell',
  castTime: 10000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 99 },
    resolveDelay: 10000, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 999999 }],
  }],
}

// --- Boss auto-attack ---
const BOSS_AUTO: SkillDef = {
  id: 'boss_auto', name: '攻击', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'single', requiresTarget: true, range: 5,
  effects: [{ type: 'damage', potency: 500 }],
}

// ========== TIMELINE ==========
const TIMELINE_ACTIONS: TimelineAction[] = [
  // Phase 1: clockwise 90° fans (2-14s)
  { at: 2000, action: 'use', use: 'fan_s' },
  { at: 5000, action: 'use', use: 'fan_w' },
  { at: 8000, action: 'use', use: 'fan_n' },
  { at: 11000, action: 'use', use: 'fan_e' },

  // Phase 2: left-right cleave (15-23s)
  { at: 15000, action: 'use', use: 'lr_cleave' },

  // Phase 3: pull → iron chariot + lunar dynamo (25-38s)
  { at: 25000, action: 'use', use: 'pull_cast' },
  { at: 30000, action: 'use', use: 'iron_lunar' },

  // Phase 4: instant pull + cross cut with delayed telegraph (40-45s)
  { at: 40000, action: 'use', use: 'pull_instant' },
  { at: 40000, action: 'use', use: 'cross_cut' },

  // Phase 5: enable AI (45s), boss hunts player
  { at: 45000, action: 'enable_ai' },

  // Phase 6: boss front cleave from current position (52s)
  { at: 52000, action: 'use', use: 'boss_front' },

  // Phase 7: teleport to center, disable AI, enrage (60s)
  { at: 60000, action: 'disable_ai' },
  { at: 60000, action: 'teleport', position: { x: 0, y: 0 } },
  { at: 60000, action: 'lock_facing', facing: 180 },
  { at: 60500, action: 'use', use: 'enrage' },
]

// ========== SCENE ==========
let cleanup: (() => void) | null = null

export function startTimelineDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  if (cleanup) { cleanup(); cleanup = null }

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
  for (const s of [
    FAN_S, FAN_W, FAN_N, FAN_E,
    LR_CLEAVE, PULL_CAST, PULL_INSTANT,
    IRON_LUNAR, CROSS_CUT, BOSS_FRONT_CLEAVE,
    ENRAGE_CAST, BOSS_AUTO,
  ]) {
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
    position: { x: 0, y: -12, z: 0 },
    hp: 50000, maxHp: 50000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })
  player.inCombat = true

  const boss = entityMgr.create({
    id: 'boss', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 500000, maxHp: 500000, attack: 1,
    speed: 4, size: 1.5, autoAttackRange: 5, facing: 180,
  })
  boss.inCombat = true

  const bossAI = new BossBehavior(boss, 5, 3000)
  bossAI.lockFacing(180)
  let aiEnabled = false

  const scheduler = new TimelineScheduler(bus, TIMELINE_ACTIONS)

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
  const timelineDisplay = new TimelineDisplay(uiRoot, TIMELINE_ACTIONS, skillMap)
  const pauseMenu = new PauseMenu(uiRoot)
  const devTerminal = new DevTerminal(bus, new CommandRegistry())
  devTerminal.mount(uiRoot)

  let paused = false
  let battleOver = false

  pauseMenu.onResumeGame(() => { paused = false; pauseMenu.hide() })
  pauseMenu.onQuitGame(() => window.location.reload())

  // --- Timeline action handler ---
  bus.on('timeline:action', (action: TimelineAction) => {
    if (battleOver) return

    if (action.action === 'use' && action.use) {
      const skill = skillMap.get(action.use)
      if (skill) skillResolver.tryUse(boss, skill)
    }

    if (action.action === 'lock_facing' && action.facing != null) {
      bossAI.lockFacing(action.facing)
    }

    if (action.action === 'enable_ai') {
      aiEnabled = true
      bossAI.unlockFacing()
      boss.target = player.id
    }

    if (action.action === 'disable_ai') {
      aiEnabled = false
    }

    if (action.action === 'teleport' && action.position) {
      displacer.start(boss, action.position.x, action.position.y, 400)
    }
  })

  // --- Player death ---
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

  // --- Game loop ---
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || battleOver) return
    if (devTerminal.isVisible()) return

    const result = playerDriver.update(dt)
    if (result === 'pause') { paused = true; pauseMenu.show(); return }

    scheduler.update(dt)

    // Boss AI (only when enabled)
    if (aiEnabled && boss.alive && !boss.casting) {
      bossAI.updateFacing(player)
      bossAI.updateMovement(player, dt)
      if (bossAI.tickAutoAttack(dt) && bossAI.isInAutoAttackRange(player)) {
        boss.target = player.id
        skillResolver.tryUse(boss, BOSS_AUTO)
      }
    }

    displacer.update(dt)
    zoneMgr.update(dt)
    timelineDisplay.update(scheduler.elapsed, dt)
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
