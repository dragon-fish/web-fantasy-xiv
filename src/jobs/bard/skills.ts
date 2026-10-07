import type { SkillDef } from '@/core/types'
import { icon } from '../commons/icon-paths'

export const BARD_SKILLS: SkillDef[] = [
  // 1: Straight Shot — 10m ranged single-target weaponskill
  {
    id: 'brd_straight_shot',
    name: '直线射击',
    icon: icon('skill_icons/23_BRD', 359),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 10,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.0 }],
  },
  // 2: Mage's Ballad — ATK +10% for 18s, replaces other songs
  {
    id: 'brd_ballad',
    name: '贤者的叙事谣',
    vfx: { element: 'wind' },
    icon: icon('skill_icons/23_BRD', 2602),
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
    vfx: { element: 'wind' },
    icon: icon('skill_icons/23_BRD', 2603),
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
    vfx: { element: 'wind' },
    icon: icon('skill_icons/23_BRD', 2607),
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
    vfx: { element: 'wind' },
    icon: icon('skill_icons/23_BRD', 2611),
    type: 'ability',
    castTime: 0,
    cooldown: 0,
    gcd: false,
    targetType: 'single',
    requiresTarget: true,
    range: 10,
    mpCost: 0,
    requiresBuffStacks: { buffId: 'brd_pitch', stacks: 1 },
    potencyPerStack: { buffId: 'brd_pitch', bonus: 1.36 },
    effects: [
      { type: 'damage', potency: 0 },
      { type: 'consume_all_buff_stacks', buffId: 'brd_pitch' },
    ],
  },
]
