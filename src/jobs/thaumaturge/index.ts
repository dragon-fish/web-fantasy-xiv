import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { CASTER_AUTO, ROLE_DASH, ROLE_BACKSTEP, ROLE_LUCID_DREAMING } from '../commons/role-skills'
import { THAUMATURGE_SKILLS } from './skills'
import { THAUMATURGE_BUFFS } from './status'

export const THAUMATURGE_JOB: PlayerJob = {
  id: 'thaumaturge',
  name: '咒术师',
  description: '以魔法杖吟唱咒文的学徒。辉石魔砾是慢读条高伤害的主输出，治疗能应急自救，即刻咏唱让你在机动战中抢一个瞬发窗口。身板脆弱，走位是生存关键。',
  category: JobCategory.Caster,
  stats: {
    hp: 6500,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...THAUMATURGE_SKILLS, ROLE_LUCID_DREAMING],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: CASTER_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...THAUMATURGE_SKILLS, ROLE_LUCID_DREAMING], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(THAUMATURGE_BUFFS),
  buffMap: mergeBuffMap(THAUMATURGE_BUFFS),
}
