import type { SkillDef } from '@/core/types'

export const ARCHER_SKILLS: SkillDef[] = [
  // 1: heavy shot — basic ranged GCD
  {
    id: 'arc_heavy_shot',
    name: '强力射击',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 12,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.3 }],
  },
  // 2: venom shot — small hit + DoT applied to target
  {
    id: 'arc_venom_shot',
    name: '毒药箭',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 12,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 0.3 },
      { type: 'apply_buff', buffId: 'arc_venom', target: 'target' },
    ],
  },
  // 3: barrage — self-buff oGCD, +30% damage for 6s
  {
    id: 'arc_barrage',
    name: '强化',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'arc_barrage' }],
  },
]
