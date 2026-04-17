import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { PHYS_RANGED_AUTO, ROLE_DASH_FORWARD, ROLE_BACKSTEP, ROLE_SECOND_WIND } from '../commons/role-skills'
import { ARCHER_SKILLS } from './skills'
import { ARCHER_BUFFS } from './status'

export const ARCHER_JOB: PlayerJob = {
  id: 'archer',
  name: '弓箭手',
  description: '以弓矢远程狙击的猎人。强力射击是稳定输出，毒药箭让敌人持续流血，强化爆发窗口内能打出爆炸伤害。机动性强，善于风筝走打。',
  category: JobCategory.PhysRanged,
  stats: {
    hp: 6500,
    mp: 10000,
    attack: 900,
    speed: 5,
    autoAttackRange: 10,
  },
  skills: [...ARCHER_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH_FORWARD], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: PHYS_RANGED_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...ARCHER_SKILLS, ROLE_SECOND_WIND], ROLE_DASH_FORWARD, ROLE_BACKSTEP),
  buffs: mergeBuffs(ARCHER_BUFFS),
  buffMap: mergeBuffMap(ARCHER_BUFFS),
}
