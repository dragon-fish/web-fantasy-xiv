import type { SkillDef } from '@/core/types'

/** Auto-attack: ability type, no GCD, used by auto-attack timer only */
export const AUTO_ATTACK: SkillDef = {
  id: 'auto_attack',
  name: '自动攻击',
  type: 'ability',
  castTime: 0,
  cooldown: 0,
  gcd: false,
  targetType: 'single',
  requiresTarget: true,
  range: 5,
  effects: [{ type: 'damage', potency: 1 }],
}

export const DEMO_SKILLS: SkillDef[] = [
  // 1: 单体战技
  {
    id: 'slash',
    name: '斩击',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 5,
    effects: [{ type: 'damage', potency: 2 }],
  },
  // 2: 直线射击（矩形魔法，有咏唱）
  {
    id: 'line_shot',
    name: '直线射击',
    type: 'spell',
    castTime: 1500,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    requiresTarget: true,
    range: 15,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'toward_target' },
      shape: { type: 'rect', length: 12, width: 3 },
      resolveDelay: 1500,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 3 }],
    }],
  },
  // 3: 扇形战技
  {
    id: 'overpower',
    name: '超压斧',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    requiresTarget: true,
    range: 8,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'toward_target' },
      shape: { type: 'fan', radius: 8, angle: 90 },
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 1.5 }],
    }],
  },
  // 4: 强化（增伤20%，8s）
  {
    id: 'embolden',
    name: '强化',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    effects: [{ type: 'apply_buff', buffId: 'embolden' }],
  },
  // 5: 铁壁（减伤40%，8s）
  {
    id: 'rampart',
    name: '铁壁',
    type: 'ability',
    castTime: 0,
    cooldown: 25000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    effects: [{ type: 'apply_buff', buffId: 'rampart' }],
  },
  // 6: 治疗魔法（1.8s咏唱，自身回血）
  {
    id: 'cure',
    name: '治疗',
    type: 'spell',
    castTime: 1800,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    effects: [{ type: 'heal', potency: 5 }],
  },
]

/** Q key: dash to target */
export const SKILL_DASH: SkillDef = {
  id: 'dash',
  name: '突进',
  type: 'ability',
  castTime: 0,
  cooldown: 10000,
  gcd: false,
  targetType: 'single',
  requiresTarget: true,
  range: 15,
  effects: [{ type: 'dash' }],
}

/** E key: backstep away from target */
export const SKILL_BACKSTEP: SkillDef = {
  id: 'backstep',
  name: '后跳',
  type: 'ability',
  castTime: 0,
  cooldown: 10000,
  gcd: false,
  targetType: 'single',
  requiresTarget: true,
  range: 5,
  effects: [{ type: 'backstep', distance: 10 }],
}
