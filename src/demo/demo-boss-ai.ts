import { GameScene } from '@/game/game-scene'
import { BossBehavior } from '@/ai/boss-behavior'
import { DEMO_SKILLS, AUTO_ATTACK, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'
import { DEMO_SKILL_BAR } from './demo-skill-bar'
import { DEMO_BUFFS } from './demo-buffs'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'

const ARENA: ArenaDef = {
  name: 'Boss Arena',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

const BOSS_AUTO: SkillDef = {
  id: 'boss_auto', name: '攻撃', type: 'ability',
  castTime: 0, cooldown: 0, gcd: false,
  targetType: 'single', requiresTarget: true, range: 15,
  effects: [{ type: 'damage', potency: 1 }],
}

let scene: GameScene | null = null

export function startBossAiDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  scene?.dispose()

  scene = new GameScene({
    canvas, uiRoot, arena: ARENA,
    skillBarEntries: DEMO_SKILL_BAR,
    playerInputConfig: {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
    restart: () => startBossAiDemo(canvas, uiRoot),
  })

  const s = scene

  s.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5, autoAttackRange: 5,
  })

  const boss = s.entityMgr.create({
    id: 'boss', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 200000, maxHp: 200000, attack: 1,
    speed: 3, size: 1.5, autoAttackRange: 5, aggroRange: 8, facing: 180,
  })
  s.bossEntity = boss
  s.combatResolver.registerBuffs(DEMO_BUFFS)

  const bossAI = new BossBehavior(boss, {
    chaseRange: 5, autoAttackRange: 15, autoAttackInterval: 3000, aggroRange: 8,
  })

  let combatStartTime: number | null = null

  function engageCombat() {
    if (boss.inCombat) return
    bossAI.engage()
    boss.target = s.player.id
    s.player.inCombat = true
    combatStartTime = performance.now()
    s.announce.show('战斗开始')
    s.bus.emit('combat:started', { entities: [s.player, boss] })
  }

  s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity }) => {
    if (payload.target.id === boss.id && !boss.inCombat) engageCombat()
    if (payload.target.id === s.player.id && payload.target.hp <= 0) s.onBattleEnd('wipe')
  })

  s.getCombatElapsed = () => combatStartTime != null ? performance.now() - combatStartTime : null

  s.onLogicTick = (dt) => {
    if (!boss.inCombat && bossAI.checkAggro(s.player)) engageCombat()
    if (boss.inCombat && boss.alive && !boss.casting) {
      bossAI.updateFacing(s.player)
      bossAI.updateMovement(s.player, dt)
      if (bossAI.tickAutoAttack(dt) && bossAI.isInAutoAttackRange(s.player)) {
        boss.target = s.player.id
        s.skillResolver.tryUse(boss, BOSS_AUTO)
      }
    }
  }

  s.start()
}
