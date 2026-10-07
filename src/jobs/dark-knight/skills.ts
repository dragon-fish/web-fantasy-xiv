import type { SkillDef } from '@/core/types'
import { icon } from '../commons/icon-paths'

export const DARK_KNIGHT_SKILLS: SkillDef[] = [
  // 1: Shadow Bolt — melee, costs HP, high potency
  //    With 行尸走肉: HP cost becomes HP heal
  //    With 嗜血: HP cost becomes MP cost
  {
    id: 'drk_shadow_bolt',
    name: '噬魂斩',
    vfx: { element: 'dark' },
    icon: icon('skill_icons/32_DRK', 3051),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    hpCost: 1100,
    hpCostSwapBuff: 'drk_dark_mind',
    hpCostReverseBuff: 'drk_living_dead',
    effects: [{ type: 'damage', potency: 2.5 }],
  },
  // 2: Drain Slash — ranged, low damage, heals self
  {
    id: 'drk_drain_slash',
    name: '吸收波',
    vfx: { element: 'dark' },
    icon: icon('skill_icons/32_DRK', 3064),
    type: 'spell',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 15,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 1.0 },
      { type: 'heal', potency: 2.5 },
    ],
  },
  // 3: 嗜血 — swap HP cost to MP cost + lifesteal for 10s
  {
    id: 'drk_dark_mind',
    name: '嗜血',
    vfx: { element: 'dark' },
    icon: icon('skill_icons/32_DRK', 3071),
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'heal', potency: 1.5 },
      { type: 'apply_buff', buffId: 'drk_dark_mind' },
    ],
  },
  // 4: 暗影墙 — shield + MP on hit for 8s
  {
    id: 'drk_shadow_wall',
    name: '暗影墙',
    vfx: { element: 'dark' },
    icon: icon('skill_icons/32_DRK', 3075),
    type: 'ability',
    castTime: 0,
    cooldown: 12000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'apply_buff', buffId: 'drk_shadow_wall' },
      { type: 'apply_buff', buffId: 'shield', stacks: 3000, duration: 8000 },
    ],
  },
  // 6: Living Dead — undying + HP cost reversal for 10s
  {
    id: 'drk_living_dead',
    name: '行尸走肉',
    vfx: { element: 'dark' },
    icon: icon('skill_icons/32_DRK', 3077),
    type: 'ability',
    castTime: 0,
    cooldown: 300000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'drk_living_dead' }],
  },
]
