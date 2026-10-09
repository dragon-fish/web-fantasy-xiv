import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { CASTER_AUTO, ROLE_DASH_FORWARD } from '../commons/role-skills'
import { WHITE_MAGE_SKILLS, WHITE_MAGE_RAISE } from './skills'
import { WHITE_MAGE_BUFFS } from './status'

export const WHITE_MAGE_JOB: PlayerJob = {
  id: 'white_mage',
  name: '白魔法师',
  description: '使用幻具的治疗职业，以纯粹的治疗魔法守护队友。救疗与医济读条回复，治疗百合带来免费的狂喜之心，积满血百合即可放出苦难之心；节制为全队减伤，免费复活每 3 分钟一次。',
  category: JobCategory.Healer,
  stats: {
    hp: 9000,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: WHITE_MAGE_SKILLS,
  extraSkills: new Map([[100, ROLE_DASH_FORWARD], [101, WHITE_MAGE_RAISE]]),
  autoAttackSkill: CASTER_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar(WHITE_MAGE_SKILLS, ROLE_DASH_FORWARD, WHITE_MAGE_RAISE),
  buffs: mergeBuffs(WHITE_MAGE_BUFFS),
  buffMap: mergeBuffMap(WHITE_MAGE_BUFFS),
  // Healer role trait + the first free raise
  combatBuffs: ['healer_lucid_dreaming', 'whm_free_raise'],
  passiveBuffs: [{ buffId: 'whm_lily', interval: 20000, stacks: 1 }],
  gauge: [
    { kind: 'stacks', label: '治疗百合', buffId: 'whm_lily', max: 3, shape: 'diamond', color: '#d2f0ff' },
    { kind: 'timer', label: '百合积攒', buffId: 'whm_lily', max: 3, color: '#8fd4ff' },
    { kind: 'stacks', label: '血百合', buffId: 'whm_blood_lily', max: 3, shape: 'chevron', color: '#ff9aa4' },
  ],
  gaugeArt: 'whm-lily',
}
