import type { SkillDef } from '@/core/types'

export const SWORDSMAN_SKILLS: SkillDef[] = [
  // 1: heavy slash — melee single-target GCD weaponskill
  {
    id: 'swm_heavy_slash',
    name: '重斩',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.5 }],
  },
  // 2: guard — oGCD self-buff, cd 30s, +20% damage 8s
  {
    id: 'swm_guard',
    name: '架式',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'swm_guard' }],
  },
]
