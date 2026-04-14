import type { SkillDef, BuffDef } from '@/core/types'
import { icon, stackIcons } from './icon-paths'

export const BLM_SKILLS: SkillDef[] = [
  // 1: Fire — long cast, high MP cost, stacks Astral Fire, consumes all Umbral Ice
  {
    id: 'blm_fire',
    name: '火炎',
    type: 'spell',
    castTime: 2500,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    mpCost: 2500,
    mpCostAbsorbBuff: 'blm_umbral_ice',
    potencyPerStack: { buffId: 'blm_astral', bonus: 0.35 },
    effects: [
      { type: 'damage', potency: 3.5 },
      { type: 'apply_buff', buffId: 'blm_astral' },
    ],
  },
  // 2: Blizzard — 1.8s cast (consumes 1 Astral Fire stack for instant cast), low potency,
  //    restores 35% MP, stacks Umbral Ice
  {
    id: 'blm_ice',
    name: '冰结',
    type: 'spell',
    castTime: 1800,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    mpCost: 0,
    castTimeWithBuff: { buffId: 'blm_astral', castTime: 0, consumeStack: true },
    effects: [
      { type: 'damage', potency: 0.5 },
      { type: 'restore_mp', percent: 0.35 },
      { type: 'apply_buff', buffId: 'blm_umbral_ice' },
    ],
  },
  // 3: Flare (Nuclear) — instant oGCD ability, requires 50 Enochian stacks, circle AOE at target
  {
    id: 'blm_flare',
    name: '核爆',
    type: 'ability',
    castTime: 0,
    cooldown: 0,
    gcd: false,
    targetType: 'aoe',
    requiresTarget: true,
    range: 20,
    mpCost: 0,
    requiresBuffStacks: { buffId: 'blm_enochian', stacks: 50 },
    zones: [{
      anchor: { type: 'target' },
      direction: { type: 'none' },
      shape: { type: 'circle', radius: 5 },
      resolveDelay: 0,
      hitEffectDuration: 500,
      effects: [{ type: 'damage', potency: 6.0 }],
    }],
    effects: [
      { type: 'consume_buff_stacks', buffId: 'blm_enochian', stacks: 50 },
    ],
  },
  // 4: Ley Lines — place a 3m zone at feet, 15s duration, grants haste when inside
  {
    id: 'blm_leylines',
    name: '黑魔纹',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [
      { type: 'apply_buff', buffId: 'blm_leylines_active' },
    ],
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'none' },
      shape: { type: 'circle', radius: 3 },
      resolveDelay: 15000,
      hitEffectDuration: 0,
      effects: [],
    }],
  },
  // 5: Cure — same cost as samurai
  {
    id: 'blm_cure',
    name: '治疗',
    type: 'spell',
    castTime: 1800,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 2400,
    effects: [{ type: 'heal', potency: 6 }],
  },
]

/** E key: Ley Lines dash — dash to ley lines center (requires active Ley Lines) */
export const BLM_LEYLINE_STEP: SkillDef = {
  id: 'blm_leyline_step',
  name: '魔纹步',
  type: 'ability',
  castTime: 0,
  cooldown: 10000,
  gcd: false,
  targetType: 'single',
  requiresTarget: false,
  range: 0,
  mpCost: 0,
  requiresBuffs: ['blm_leylines_active'],
  effects: [{ type: 'dash_to_ley_lines' }],
}

// --- BLM buffs ---

export const BLM_BUFFS: Record<string, BuffDef> = {
  blm_astral: {
    id: 'blm_astral',
    name: '星极火',
    description: '火炎每层额外增加35%威力。释放冰结时消耗1层使其即时咏唱。',
    iconPerStack: stackIcons('player_skill_effects',10463, 3),
    type: 'buff',
    duration: 0,
    stackable: true,
    maxStacks: 3,
    effects: [],
  },
  blm_umbral_ice: {
    id: 'blm_umbral_ice',
    name: '灵极冰',
    description: '释放火炎时消耗1层代替MP消耗。',
    iconPerStack: stackIcons('player_skill_effects',10466, 3),
    type: 'buff',
    duration: 0,
    stackable: true,
    maxStacks: 3,
    effects: [],
  },
  blm_enochian: {
    id: 'blm_enochian',
    name: '天语',
    description: '战斗中每秒自动获得2层。消耗50层可释放核爆。',
    icon: icon('player_skill_effects',10461),
    type: 'buff',
    duration: 0,
    stackable: true,
    maxStacks: 100,
    effects: [],
  },
  blm_leylines_active: {
    id: 'blm_leylines_active',
    name: '黑魔纹',
    icon: icon('player_skill_effects',12653),
    type: 'buff',
    duration: 15000,
    stackable: false,
    maxStacks: 1,
    effects: [],
  },
  blm_leylines_buff: {
    id: 'blm_leylines_buff',
    name: '黑魔纹效果',
    icon: icon('player_skill_effects',12654),
    type: 'buff',
    duration: 3000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'haste', value: 0.15 }],
  },
}

export const BLM_BUFF_MAP = new Map(Object.entries(BLM_BUFFS))
