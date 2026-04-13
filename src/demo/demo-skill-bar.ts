import type { SkillBarEntry } from '@/ui/ui-manager'
import { DEMO_SKILLS, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'

/** Standard skill bar layout for all demo scenes */
export const DEMO_SKILL_BAR: SkillBarEntry[] = [
  ...DEMO_SKILLS.map((s, i) => ({ key: `${i + 1}`, skill: s })),
  { key: 'Q', skill: SKILL_DASH },
  { key: 'E', skill: SKILL_BACKSTEP },
]
