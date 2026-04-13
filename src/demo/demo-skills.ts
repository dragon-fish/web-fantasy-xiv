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
  // 1: 单体战技（需要目标）
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
  // 2: 单体魔法（需要目标，有咏唱）
  {
    id: 'fire1',
    name: '火炎',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    effects: [{ type: 'damage', potency: 4 }],
  },
  // 3: 扇形战技（需要目标，朝向目标释放）
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
  // 4: 以自身为圆心的圆形能力技（不需要目标）
  {
    id: 'rage_burst',
    name: '战嚎',
    type: 'ability',
    castTime: 0,
    cooldown: 15000,
    gcd: false,
    targetType: 'aoe',
    requiresTarget: false,
    range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'none' },
      shape: { type: 'circle', radius: 6 },
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 5 }],
    }],
  },
  // 5: 矩形魔法（需要目标，朝向目标释放，有咏唱）
  {
    id: 'piercing_ray',
    name: '穿透射线',
    type: 'spell',
    castTime: 1500,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    requiresTarget: true,
    range: 25,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'toward_target' },
      shape: { type: 'rect', length: 20, width: 3 },
      resolveDelay: 1500, // matches castTime — damage on cast complete
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 3 }],
    }],
  },
  // 6: 长 CD 能力技（不需要目标，自身增强）
  {
    id: 'berserk',
    name: '狂暴',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    effects: [{ type: 'damage', potency: 10 }],
  },
]

/** Q key: dash to target (15m range, needs target) */
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

/** E key: backstep away from target (5m range, 10m jump, needs target) */
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
