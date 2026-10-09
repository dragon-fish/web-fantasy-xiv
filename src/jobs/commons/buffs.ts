import type { BuffDef } from '@/core/types'
import { icon, stackIcons } from './icon-paths'

export const COMMON_BUFFS: Record<string, BuffDef> = {
  vulnerability: {
    id: 'vulnerability',
    name: '易伤',
    iconPerStack: stackIcons('effects', 17101, 16),
    type: 'debuff',
    duration: 8000,
    stackable: true,
    maxStacks: 16,
    effects: [{ type: 'vulnerability', value: 0.1 }], // 10% per stack
  },
  embolden: {
    id: 'embolden',
    name: '攻击力提升',
    icon: icon('effects', 15021),
    type: 'buff',
    duration: 15000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.1 }],
  },
  rampart: {
    id: 'rampart',
    name: '铁壁',
    icon: icon('player_skill_effects', 10152),
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'mitigation', value: 0.4 }],
  },
  junze: {
    id: 'junze',
    name: '润泽',
    icon: icon('effects', 15021),
    type: 'buff',
    duration: 30000,
    stackable: true,
    maxStacks: 4,
    effects: [{ type: 'damage_increase', value: 0.1 }],
  },
  shield: {
    id: 'shield',
    name: '护盾',
    description: '吸收伤害的护盾。',
    icon: icon('effects', 16676),
    type: 'buff',
    duration: 0,
    stackable: true,
    maxStacks: Infinity,
    shield: true,
    effects: [],
  },
  damage_immunity: {
    id: 'damage_immunity',
    name: '无敌',
    description: '除少数情况，其他所有攻击均无效。',
    icon: icon('effects', 15024),
    type: 'buff',
    duration: 0,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_immunity' }],
  },
  practice_immunity: {
    id: 'practice_immunity',
    name: '练习模式',
    description: '光之战士在脑海中预想战斗。除少数情况，其他所有攻击均无效。',
    icon: icon('effects', 15024),
    type: 'buff',
    duration: 0,
    stackable: false,
    maxStacks: 1,
    // Falling off the arena still kills (fall damage ignores immunity); practice must survive the revive
    preserveOnDeath: true,
    effects: [{ type: 'damage_immunity' }],
  },
  lucid_dreaming: {
    id: 'lucid_dreaming',
    name: '醒梦',
    description: '持续恢复 MP。',
    type: 'buff',
    duration: 21000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'mp_regen', potency: 0.05, interval: 3000 }],
  },
  // Healer role trait: in combat, a Lucid Dreaming that never ends and survives death
  healer_lucid_dreaming: {
    id: 'healer_lucid_dreaming',
    name: '醒梦',
    description: '治疗职能特性：战斗中持续恢复 MP。',
    icon: icon('player_skill_effects', 13909),
    type: 'buff',
    duration: 0,
    stackable: false,
    maxStacks: 1,
    preserveOnDeath: true,
    effects: [{ type: 'mp_regen', potency: 0.05, interval: 3000 }],
  },
  one_punch_man: {
    id: 'one_punch_man',
    name: '一拳超人',
    description: '攻击力提升 999%。仅限开发模式调试使用。',
    type: 'buff',
    duration: 0,
    stackable: false,
    maxStacks: 1,
    preserveOnDeath: true,
    effects: [{ type: 'damage_increase', value: 9.99 }],
  },
  /**
   * Echo (超越之力) — phase 5 battlefield condition buff.
   * - Activates on boss combat when determination <= 2 (threshold configurable via condition pool).
   * - Three modifier effects: +25% base attack / +25% mitigation / +25% base maxHp.
   * - preserveOnDeath: true — reserved for future raise / in-combat respawn systems
   *   (phase 5 has no visible consumer scenario since echo is scene-bound).
   * - duration: 0 — permanent (tied to scene lifetime, no buff-system expiration).
   */
  echo: {
    id: 'echo',
    name: '超越之力',
    description: '攻击 +25% / 减伤 +25% / 最大生命 +25%',
    type: 'buff',
    duration: 0,
    stackable: false,
    maxStacks: 1,
    preserveOnDeath: true,
    effects: [
      { type: 'attack_modifier', value: 0.25 },
      { type: 'mitigation', value: 0.25 },
      { type: 'max_hp_modifier', value: 0.25 },
    ],
  },
  vitality_down: {
    id: 'vitality_down',
    name: '体力衰减',
    description: '最大生命降低 10%。最多 10 层，叠满即死。',
    type: 'debuff',
    duration: 0,
    stackable: true,
    maxStacks: 10,
    effects: [{ type: 'max_hp_modifier', value: -0.10 }],
  },
}

// Map version for tooltip lookups
export const COMMON_BUFF_MAP = new Map(Object.entries(COMMON_BUFFS))
