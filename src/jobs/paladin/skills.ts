import type { SkillDef } from '@/core/types'
import { icon } from '../commons/icon-paths'

export const PALADIN_SKILLS: SkillDef[] = [
  // 1: Vanguard Blade — melee, stacks Requiescat, consumes Fight or Flight for +25% damage + 2000 MP
  {
    id: 'pld_vanguard',
    name: '先锋剑',
    icon: icon('skill_icons/19_PLD', 158),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    potencyWithBuff: { buffId: 'pld_fof', damageIncrease: 0.25, consumeStack: true, restoreMp: 2000 },
    effects: [
      { type: 'damage', potency: 1.4 },
      { type: 'apply_buff', buffId: 'pld_requiescat' },
    ],
  },
  // 2: Holy Spirit — ranged magic, MP 2250, heals self, stacks Fight or Flight, instant with Requiescat
  {
    id: 'pld_holy_spirit',
    name: '圣灵',
    vfx: { element: 'holy' },
    icon: icon('skill_icons/19_PLD', 2514),
    type: 'spell',
    castTime: 1500,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 25,
    mpCost: 2250,
    castTimeWithBuff: { buffId: 'pld_requiescat', castTime: 0, consumeStack: true },
    effects: [
      { type: 'damage', potency: 2.1, dmgType: 'magical' },
      { type: 'heal', potency: 0.5 },
      { type: 'apply_buff', buffId: 'pld_fof' },
    ],
  },
  // 3: Holy Sheltron — oGCD, 2 charges (20s each): 20% mitigation + 1500 shield for 8s; the shield heals
  // when it breaks or runs out. Recasting refreshes the mitigation and the shield only replaces a weaker one.
  {
    id: 'pld_holy_sheltron',
    name: '圣盾阵',
    vfx: { element: 'holy' },
    icon: icon('skill_icons/19_PLD', 2950),
    type: 'ability',
    castTime: 0,
    cooldown: 20000,
    charges: 2,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'apply_buff', buffId: 'pld_holy_sheltron' },
      { type: 'apply_buff', buffId: 'pld_sheltron_shield', stacks: 1500 },
    ],
  },
  // 4: Clemency — self-heal, cast 1.5s, MP 3500
  {
    id: 'pld_clemency',
    name: '深仁厚泽',
    icon: icon('skill_icons/19_PLD', 2509),
    type: 'spell',
    castTime: 1500,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 3500,
    effects: [{ type: 'heal', potency: 5.0 }],
  },
  // 5: Hallowed Ground — oGCD, 420s CD, 10s invulnerability
  {
    id: 'pld_hallowed_ground',
    name: '神圣领域',
    vfx: { element: 'holy' },
    icon: icon('skill_icons/19_PLD', 2502),
    type: 'ability',
    castTime: 0,
    cooldown: 420000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'pld_hallowed' }],
  },
]
