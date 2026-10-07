import type { SkillDef } from '@/core/types'
import { icon } from '../commons/icon-paths'

export const SAMURAI_SKILLS: SkillDef[] = [
  // 1: Setsu (Snow) — melee GCD, grants Snow buff
  {
    id: 'sam_setsu',
    name: '雪风',
    vfx: { element: 'ice' },
    icon: icon('skill_icons/34_SAM', 3166),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 0.8 },
      { type: 'apply_buff', buffId: 'sam_setsu' },
    ],
  },
  // 2: Getsu (Moon) — melee GCD, grants Moon buff
  {
    id: 'sam_getsu',
    name: '月光',
    vfx: { element: 'aether' },
    icon: icon('skill_icons/34_SAM', 3158),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 0.8 },
      { type: 'apply_buff', buffId: 'sam_getsu' },
    ],
  },
  // 3: Ka (Flower) — melee GCD, grants Flower buff
  {
    id: 'sam_ka',
    name: '花车',
    vfx: { element: 'fire' },
    icon: icon('skill_icons/34_SAM', 3164),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 0.8 },
      { type: 'apply_buff', buffId: 'sam_ka' },
    ],
  },
  // 4: Midare Setsugekka — powerful fan AOE, requires all 3 buffs, 0.8s cast
  {
    id: 'sam_midare',
    name: '纷乱雪月花',
    vfx: { element: 'holy' },
    icon: icon('skill_icons/34_SAM', 3162),
    type: 'spell',
    castTime: 800,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    requiresTarget: true,
    range: 8,
    mpCost: 0,
    requiresBuffs: ['sam_setsu', 'sam_getsu', 'sam_ka'],
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'toward_target' },
      shape: { type: 'fan', radius: 8, angle: 120 },
      resolveDelay: 800, // match castTime: telegraph during cast, resolve on completion
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 4.8 }],
    }],
    effects: [
      { type: 'consume_buffs', buffIds: ['sam_setsu', 'sam_getsu', 'sam_ka'] },
    ],
  },
  // 5: Enpi — ranged single-target, low potency (stop-loss when away from boss)
  {
    id: 'sam_enpi',
    name: '燕飞',
    vfx: { element: 'wind' },
    icon: icon('skill_icons/34_SAM', 3155),
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 15,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 0.5 }],
  },
]
