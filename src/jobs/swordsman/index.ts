import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { MELEE_AUTO, ROLE_DASH, ROLE_BACKSTEP, ROLE_SECOND_WIND } from '../commons/role-skills'
import { SWORDSMAN_SKILLS } from './skills'
import { SWORDSMAN_BUFFS } from './status'

export const SWORDSMAN_JOB: PlayerJob = {
  id: 'swordsman',
  name: '剑术师',
  description: '以单手剑战斗的新晋冒险者。重斩是你唯一的主动输出手段，搭配架式的短暂爆发窗口就能完成循环。攻防均衡，适合新手。',
  category: JobCategory.Melee,
  stats: {
    hp: 7500,
    mp: 10000,
    attack: 700,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...SWORDSMAN_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...SWORDSMAN_SKILLS, ROLE_SECOND_WIND], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(SWORDSMAN_BUFFS),
  buffMap: mergeBuffMap(SWORDSMAN_BUFFS),
}
