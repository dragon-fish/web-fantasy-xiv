import type { SkillDef, BuffDef } from '@/core/types'
import { icon } from './icon-paths'

export const BRD_SKILLS: SkillDef[] = [
  // 1: Straight Shot — 10m ranged single-target weaponskill
  {
    id: 'brd_straight_shot',
    name: '直线射击',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 10,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.2 }],
  },
  // 2: Mage's Ballad — ATK +10% for 18s, replaces other songs
  {
    id: 'brd_ballad',
    name: '贤者的叙事谣',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'consume_buffs', buffIds: ['brd_paeon', 'brd_minuet', 'brd_pitch'] },
      { type: 'apply_buff', buffId: 'brd_ballad' },
    ],
  },
  // 3: Army's Paeon — haste 16% for 18s, replaces other songs
  {
    id: 'brd_paeon',
    name: '军神的赞美歌',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'consume_buffs', buffIds: ['brd_ballad', 'brd_minuet', 'brd_pitch'] },
      { type: 'apply_buff', buffId: 'brd_paeon' },
    ],
  },
  // 4: Wanderer's Minuet — passive 诗心 stacking for 18s, replaces other songs
  {
    id: 'brd_minuet',
    name: '放浪神的小步舞曲',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'consume_buffs', buffIds: ['brd_ballad', 'brd_paeon', 'brd_pitch'] },
      { type: 'apply_buff', buffId: 'brd_minuet' },
    ],
  },
  // 5: Pitch Perfect — consumes all 诗心 stacks, damage scales with stacks
  {
    id: 'brd_pitch_perfect',
    name: '完美音调',
    type: 'ability',
    castTime: 0,
    cooldown: 0,
    gcd: false,
    targetType: 'single',
    requiresTarget: true,
    range: 10,
    mpCost: 0,
    requiresBuffStacks: { buffId: 'brd_pitch', stacks: 1 },
    potencyPerStack: { buffId: 'brd_pitch', bonus: 1.5 },
    effects: [
      { type: 'damage', potency: 0 },
      { type: 'consume_all_buff_stacks', buffId: 'brd_pitch' },
    ],
  },
]

// --- Bard buffs ---

export const BRD_BUFFS: Record<string, BuffDef> = {
  brd_ballad: {
    id: 'brd_ballad',
    name: '贤者的叙事谣',
    description: '攻击力提高10%。',
    icon: icon('player_skill_effects',12612),
    type: 'buff',
    duration: 18000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.1 }],
  },
  brd_paeon: {
    id: 'brd_paeon',
    name: '军神的赞美歌',
    description: '自动攻击间隔、战技与魔法的咏唱及复唱时间缩短16%。',
    icon: icon('player_skill_effects',12614),
    type: 'buff',
    duration: 18000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'haste', value: 0.16 }],
  },
  brd_minuet: {
    id: 'brd_minuet',
    name: '放浪神的小步舞曲',
    description: '每秒获得1层诗心，最多6层。拥有诗心时可释放完美音调。',
    icon: icon('player_skill_effects',12615),
    type: 'buff',
    duration: 18000,
    stackable: false,
    maxStacks: 1,
    effects: [],
  },
  brd_pitch: {
    id: 'brd_pitch',
    name: '诗心',
    description: '放浪神的小步舞曲期间每秒获得。消耗所有层数释放完美音调，伤害随层数增加。',
    icon: icon('player_skill_effects',12610),
    type: 'buff',
    duration: 3000,
    stackable: true,
    maxStacks: 6,
    effects: [],
  },
}

export const BRD_BUFF_MAP = new Map(Object.entries(BRD_BUFFS))
