import type { SkillDef, BuffDef } from '@/core/types'
import { icon, stackIcons } from './icon-paths'

export const PLD_SKILLS: SkillDef[] = [
  // 1: Vanguard Blade — melee, stacks Requiescat, consumes Fight or Flight for +25% damage + 2000 MP
  {
    id: 'pld_vanguard',
    name: '先锋剑',
    icon: icon('skill_icons/19_PLD', 2516),
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
      { type: 'damage', potency: 2.0 },
      { type: 'apply_buff', buffId: 'pld_requiescat' },
    ],
  },
  // 2: Holy Spirit — ranged magic, MP 2250, heals self, stacks Fight or Flight, instant with Requiescat
  {
    id: 'pld_holy_spirit',
    name: '圣灵',
    icon: icon('skill_icons/19_PLD', 2528),
    type: 'spell',
    castTime: 2500,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 25,
    mpCost: 2250,
    castTimeWithBuff: { buffId: 'pld_requiescat', castTime: 0, consumeStack: true },
    effects: [
      { type: 'damage', potency: 3.0, dmgType: 'magical' },
      { type: 'heal', potency: 0.5 },
      { type: 'apply_buff', buffId: 'pld_fof' },
    ],
  },
  // 3: Shield Lob — ranged physical, stop-loss filler
  {
    id: 'pld_shield_lob',
    name: '投盾',
    icon: icon('skill_icons/19_PLD', 2518),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 0.5 }],
  },
  // 4: Clemency — self-heal, cast 1.8s, MP 3500
  {
    id: 'pld_clemency',
    name: '深仁厚泽',
    icon: icon('skill_icons/19_PLD', 2515),
    type: 'spell',
    castTime: 1800,
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

// --- Paladin buffs ---

export const PLD_BUFFS: Record<string, BuffDef> = {
  pld_requiescat: {
    id: 'pld_requiescat',
    name: '安魂祈祷',
    description: '释放圣灵时消耗1层使其即时咏唱。',
    iconPerStack: stackIcons('player_skill_effects', 12857, 4),
    type: 'buff',
    duration: 21000,
    stackable: true,
    maxStacks: 4,
    effects: [],
  },
  pld_fof: {
    id: 'pld_fof',
    name: '战逃反应',
    description: '释放先锋剑时消耗1层使其威力提高25%，并回复2000MP。',
    iconPerStack: stackIcons('player_skill_effects', 12801, 4),
    type: 'buff',
    duration: 21000,
    stackable: true,
    maxStacks: 4,
    effects: [],
  },
  pld_hallowed: {
    id: 'pld_hallowed',
    name: '神圣领域',
    description: '特殊攻击之外其他所有攻击均无效。',
    icon: icon('player_skill_effects', 12540),
    type: 'buff',
    duration: 10000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'invulnerable' }],
  },
}
