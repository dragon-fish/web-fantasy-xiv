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
import { DebugInfo } from '@/ui/debug-info'
import type { ArenaDef, SkillDef, AoeZoneDef } from '@/core/types'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'

const ARENA_DEF: ArenaDef = {
  name: 'Timeline Test Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

// ========== HELPER ==========
function dmgZone(
  direction: AoeZoneDef['direction'],
  shape: AoeZoneDef['shape'],
  resolveDelay: number,
  telegraphBefore?: number,
  extra?: Partial<AoeZoneDef>,
): AoeZoneDef {
  return {
    anchor: { type: 'caster' },
    direction,
    shape,
    resolveDelay,
    telegraphBefore,
    hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 15000 }],
    ...extra,
  }
}

// ========== SKILLS ==========

// Phase 1: 4 individual 3s fan spells, each with its own cast bar
// Frame alignment tolerance in SkillResolver.tryUse handles the 1-tick desync
function makeFan(id: string, name: string, angle: number): SkillDef {
  return {
    id, name, type: 'spell',
    castTime: 3000, cooldown: 0, gcd: false,
    targetType: 'aoe', requiresTarget: false, range: 0,
    zones: [dmgZone({ type: 'fixed', angle }, { type: 'fan', radius: 12, angle: 90 }, 3000)],
  }
}
const FAN_S = makeFan('fan_s', '扇形斬・前', 180)
const FAN_W = makeFan('fan_w', '扇形斬・右', 270)
const FAN_N = makeFan('fan_n', '扇形斬・後', 0)
const FAN_E = makeFan('fan_e', '扇形斬・左', 90)

// Phase 2: 左右開弓 — 5s cast (matches left resolve), right resolves 2s later
const LR_CLEAVE: SkillDef = {
  id: 'lr_cleave', name: '左右開弓', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Left 180°: telegraph from cast start, resolves at 5s
    dmgZone({ type: 'fixed', angle: 90 }, { type: 'fan', radius: 14, angle: 180 }, 5000, 5000),
    // Right 180°: telegraph shows 4s before resolve (= 3s into cast), resolves at 7s
    dmgZone({ type: 'fixed', angle: 270 }, { type: 'fan', radius: 14, angle: 180 }, 7000, 4000),
  ],
}

// Phase 3: 引力漩渦 — 5s cast pull
const PULL_CAST: SkillDef = {
  id: 'pull_cast', name: '引力漩渦', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 20 },
    resolveDelay: 5000, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 2000 }, { type: 'pull', distance: 99, source: { type: 'caster' } }],
    displacementHint: 'pull',
  }],
}

// Phase 4: 鋼鉄月環 — 5s cast, circle resolves at 5s, ring resolves at 8s
const IRON_LUNAR: SkillDef = {
  id: 'iron_lunar', name: '鋼鉄月環', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Iron Chariot (circle): telegraph from start, resolves at 5s
    dmgZone({ type: 'none' }, { type: 'circle', radius: 6 }, 5000, 5000),
    // Lunar Dynamo (ring): telegraph 5s before, resolves at 8s (shows at 3s)
    dmgZone({ type: 'none' }, { type: 'ring', innerRadius: 6, outerRadius: 14 }, 8000, 5000),
  ],
}

// Phase 5a: 引力崩壊 — instant pull (ability, no cast)
const PULL_INSTANT: SkillDef = {
  id: 'pull_instant', name: '引力崩壊', type: 'ability',
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

// Phase 5b: 十字斬 — 5s cast, telegraph 3s before resolve, 2 crossing rects
const CROSS_CUT: SkillDef = {
  id: 'cross_cut', name: '十字斬', type: 'spell',
  castTime: 5000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    // Vertical (N→S, starts at north edge)
    {
      anchor: { type: 'position', x: 0, y: 15 },
      direction: { type: 'fixed', angle: 180 },
      shape: { type: 'rect', length: 30, width: 4 },
      resolveDelay: 5000, telegraphBefore: 3000,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 15000 }],
    },
    // Horizontal (W→E, starts at west edge)
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

// Phase 6: 前方斬撃 — boss casts from current facing (AI active)
const BOSS_FRONT: SkillDef = {
  id: 'boss_front', name: '前方斬撃', type: 'spell',
  castTime: 3000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [
    dmgZone({ type: 'caster_facing' }, { type: 'fan', radius: 12, angle: 180 }, 3000),
  ],
}

// Phase 7: 時間切迫 (enrage) — normal spell so it shows on timeline + cast bar
const ENRAGE: SkillDef = {
  id: 'enrage', name: '時間切迫', type: 'spell',
  castTime: 10000, cooldown: 0, gcd: false,
  targetType: 'aoe', requiresTarget: false, range: 0,
  zones: [{
    anchor: { type: 'caster' }, direction: { type: 'none' },
    shape: { type: 'circle', radius: 99 },
    resolveDelay: 10000, hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 999999 }],
  }],
}

// Boss auto-attack
const BOSS_AUTO: SkillDef = {
  id: 'boss_auto', name: '攻撃', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'single', requiresTarget: true, range: 5,
  effects: [{ type: 'damage', potency: 500 }],
}

// ========== TIMELINE ==========
const TIMELINE: TimelineAction[] = [
  // Phase 1 (2-14s): 4 independent fan casts, back-to-back
  { at: 2000, action: 'use', use: 'fan_s' },
  { at: 5000, action: 'use', use: 'fan_w' },
  { at: 8000, action: 'use', use: 'fan_n' },
  { at: 11000, action: 'use', use: 'fan_e' },

  // Phase 2 (16s): 左右開弓 — 5s cast, left@21s right@23s
  // 2s gap after last fan resolves at 14s
  { at: 16000, action: 'use', use: 'lr_cleave' },

  // Phase 3 (25s): 引力漩渦 — 5s pull
  // 2s gap after right cleave resolves at 23s
  { at: 25000, action: 'use', use: 'pull_cast' },

  // Phase 4 (31s): 鋼鉄月環 — circle@36s ring@39s
  // 1s gap after pull resolves at 30s
  { at: 31000, action: 'use', use: 'iron_lunar' },

  // Phase 5 (40s): instant pull → cross cut (5s cast, telegraph at 42s)
  // 1s gap after ring resolves at 39s
  { at: 40000, action: 'use', use: 'pull_instant' },
  { at: 40000, action: 'use', use: 'cross_cut' },

  // Phase 6 (47s): enable AI, boss hunts player
  // 2s gap after cross cut resolves at 45s
  { at: 47000, action: 'enable_ai' },

  // Phase 6b (52s): front 180° cleave from current position
  { at: 52000, action: 'use', use: 'boss_front' },

  // Phase 7 (60s): teleport to center, enrage
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
    FAN_S, FAN_W, FAN_N, FAN_E, LR_CLEAVE, PULL_CAST, PULL_INSTANT,
    IRON_LUNAR, CROSS_CUT, BOSS_FRONT, ENRAGE, BOSS_AUTO,
  ]) {
    skillMap.set(s.id, s)
  }

  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    hp: 50000, maxHp: 50000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })
  const boss = entityMgr.create({
    id: 'boss', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 500000, maxHp: 500000, attack: 1,
    speed: 4, size: 1.5, autoAttackRange: 5, aggroRange: 8, facing: 180,
  })

  const bossAI = new BossBehavior(boss, {
    chaseRange: 5,
    autoAttackRange: 15,
    autoAttackInterval: 3000,
    aggroRange: 8,
  })
  bossAI.lockFacing(180)
  let aiEnabled = false
  let combatStarted = false

  function engageCombat() {
    if (combatStarted) return
    combatStarted = true
    player.inCombat = true
    boss.inCombat = true
    bus.emit('combat:started', { entities: [player, boss] })
  }

  // Aggro on player attacking boss + player death check
  bus.on('damage:dealt', (payload: { source: Entity; target: Entity }) => {
    if (payload.target.id === boss.id && !combatStarted) {
      engageCombat()
    }
    if (payload.target.id === player.id && payload.target.hp <= 0) {
      onBattleEnd('wipe')
    }
  })

  const scheduler = new TimelineScheduler(bus, TIMELINE)

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
  const timelineDisplay = new TimelineDisplay(uiRoot, TIMELINE, skillMap)
  const pauseMenu = new PauseMenu(uiRoot)
  const devTerminal = new DevTerminal(bus, new CommandRegistry())
  devTerminal.mount(uiRoot)
  const debugInfo = new DebugInfo(uiRoot)

  let paused = false
  let battleOver = false

  pauseMenu.onResumeGame(() => { paused = false; pauseMenu.hide() })
  pauseMenu.onQuitGame(() => window.location.reload())

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

  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    if (paused || battleOver) return
    if (devTerminal.isVisible()) return

    const result = playerDriver.update(dt)
    if (result === 'pause') { paused = true; pauseMenu.show(); return }

    // Aggro check (proximity)
    if (!combatStarted && bossAI.checkAggro(player)) {
      engageCombat()
    }

    // Timeline only runs after combat starts
    if (combatStarted) {
      scheduler.update(dt)
    }

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
    debugInfo.update(delta, player, combatStarted ? scheduler.elapsed : null)
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
