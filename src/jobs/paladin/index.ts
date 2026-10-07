import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { MELEE_AUTO, ROLE_DASH, ROLE_BACKSTEP, ROLE_SECOND_WIND } from '../commons/role-skills'
import { PALADIN_SKILLS } from './skills'
import { PALADIN_BUFFS } from './status'

export const PALADIN_JOB: PlayerJob = {
  id: 'paladin',
  name: '骑士',
  description: '以剑与盾为武器的防护职业，同时精通物理近战与魔法远程。通过安魂祈祷与战逃反应的交替循环，在近战与远程之间切换输出节奏。圣盾阵可连用两次，护盾消失时回复体力，拥有终极防御技能神圣领域。',
  category: JobCategory.Tank,
  stats: {
    hp: 10000,
    mp: 10000,
    attack: 900,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...PALADIN_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...PALADIN_SKILLS, ROLE_SECOND_WIND], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(PALADIN_BUFFS),
  buffMap: mergeBuffMap(PALADIN_BUFFS),
}
