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
    range: 5,
    effects: [{ type: 'damage', potency: 2 }],
  },
  // 2: 单体魔法（有咏唱）
  {
    id: 'fire1',
    name: '火炎',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    range: 20,
    effects: [{ type: 'damage', potency: 4 }],
  },
  // 3: 扇形战技（正面 120°）
  {
    id: 'overpower',
    name: '超压斧',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'caster_facing' },
      shape: { type: 'fan', radius: 8, angle: 120 },
      telegraphDuration: 0,
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 1.5 }],
    }],
  },
  // 4: 以自身为圆心的圆形能力技
  {
    id: 'rage_burst',
    name: '战嚎',
    type: 'ability',
    castTime: 0,
    cooldown: 15000,
    gcd: false,
    targetType: 'aoe',
    range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'none' },
      shape: { type: 'circle', radius: 6 },
      telegraphDuration: 0,
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 5 }],
    }],
  },
  // 5: 锁定目标释放的矩形魔法（有咏唱）
  {
    id: 'piercing_ray',
    name: '穿透射线',
    type: 'spell',
    castTime: 1500,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    range: 25,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'toward_target' },
      shape: { type: 'rect', length: 20, width: 3 },
      telegraphDuration: 1500,
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 3 }],
    }],
  },
  // 6: 长 CD 能力技（测试独立 CD 倒计时）
  {
    id: 'berserk',
    name: '狂暴',
    type: 'ability',
    castTime: 0,
    cooldown: 60000,
    gcd: false,
    targetType: 'single',
    range: 0,
    effects: [{ type: 'damage', potency: 10 }],
  },
]
