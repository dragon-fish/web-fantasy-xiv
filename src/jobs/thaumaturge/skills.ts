import type { SkillDef } from '@/core/types'

export const THAUMATURGE_SKILLS: SkillDef[] = [
  // 1: 辉石魔砾 — caster ranged GCD spell, 2s cast, main DPS
  {
    id: 'thm_stone',
    name: '辉石魔砾',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    mpCost: 400,
    effects: [{ type: 'damage', potency: 2.0 }],
  },
  // 2: 治疗 — self-heal spell, 2s cast
  {
    id: 'thm_cure',
    name: '治疗',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 2400,
    effects: [{ type: 'heal', potency: 5 }],
  },
  // 3: 即刻咏唱 — oGCD, cd 40s, next spell instant
  {
    id: 'thm_swiftcast',
    name: '即刻咏唱',
    type: 'ability',
    castTime: 0,
    cooldown: 40000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'thm_swiftcast_ready' }],
  },
]
