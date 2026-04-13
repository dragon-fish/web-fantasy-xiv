import { GameScene } from '@/game/game-scene'
import { BossBehavior } from '@/ai/boss-behavior'
import { TimelineScheduler } from '@/timeline/timeline-scheduler'
import { TimelineDisplay } from '@/ui/timeline-display'
import { loadEncounter } from '@/game/encounter-loader'
import { DEMO_SKILLS, AUTO_ATTACK, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'
import { DEMO_SKILL_BAR } from './demo-skill-bar'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'
import type { EncounterData } from '@/game/encounter-loader'

let scene: GameScene | null = null

export async function startTimelineDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): Promise<void> {
  scene?.dispose()
  const encounter = await loadEncounter('/encounters/timeline-test.yaml')
  initScene(canvas, uiRoot, encounter)
}

function initScene(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement, enc: EncounterData): void {
  scene = new GameScene({
    canvas, uiRoot, arena: enc.arena,
    skillBarEntries: DEMO_SKILL_BAR,
    playerInputConfig: {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
    restart: () => startTimelineDemo(canvas, uiRoot),
  })

  const s = scene

  s.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    ...enc.player,
  })

  const boss = s.entityMgr.create(enc.boss)
  s.bossEntity = boss

  const bossAI = new BossBehavior(boss, enc.bossAI)
  bossAI.lockFacing(boss.facing)
  let aiEnabled = false
  let combatStarted = false

  const bossAutoSkill = enc.skills.get('boss_auto')
  const scheduler = new TimelineScheduler(s.bus, enc.timeline)
  const timelineDisplay = new TimelineDisplay(uiRoot, enc.timeline, enc.skills)

  // Engage
  function engageCombat() {
    if (combatStarted) return
    combatStarted = true
    s.player.inCombat = true
    boss.inCombat = true
    s.announce.show('战斗开始')
    s.bus.emit('combat:started', { entities: [s.player, boss] })
  }

  s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity }) => {
    if (payload.target.id === boss.id && !combatStarted) engageCombat()
    if (payload.target.id === s.player.id && payload.target.hp <= 0) s.onBattleEnd('wipe')
  })

  // Timeline actions
  s.bus.on('timeline:action', (action: TimelineAction) => {
    if (s.battleOver) return
    if (action.action === 'use' && action.use) {
      const skill = enc.skills.get(action.use)
      if (skill) s.skillResolver.tryUse(boss, skill)
    }
    if (action.action === 'lock_facing' && action.facing != null) bossAI.lockFacing(action.facing)
    if (action.action === 'enable_ai') { aiEnabled = true; bossAI.unlockFacing(); boss.target = s.player.id }
    if (action.action === 'disable_ai') aiEnabled = false
    if (action.action === 'teleport' && action.position) s.displacer.start(boss, action.position.x, action.position.y, 400)
  })

  s.getCombatElapsed = () => combatStarted ? scheduler.elapsed : null

  s.onLogicTick = (dt) => {
    if (!combatStarted && bossAI.checkAggro(s.player)) engageCombat()
    if (combatStarted) scheduler.update(dt)

    if (aiEnabled && boss.alive && !boss.casting) {
      bossAI.updateFacing(s.player)
      bossAI.updateMovement(s.player, dt)
      if (bossAutoSkill && bossAI.tickAutoAttack(dt) && bossAI.isInAutoAttackRange(s.player)) {
        boss.target = s.player.id
        s.skillResolver.tryUse(boss, bossAutoSkill)
      }
    }

    timelineDisplay.update(scheduler.elapsed, dt)
  }

  s.start()
}
