import type { BuffDef } from '@/core/types'
import { effectIcon, skillEffectIcon, stackIcons } from './icon-paths'

export const DEMO_BUFFS: Record<string, BuffDef> = {
  vulnerability: {
    id: 'vulnerability',
    name: '易伤',
    iconPerStack: stackIcons(effectIcon, 17101, 16),
    type: 'debuff',
    duration: 8000,
    stackable: true,
    maxStacks: 16,
    effects: [{ type: 'vulnerability', value: 0.1 }], // 10% per stack
  },
  embolden: {
    id: 'embolden',
    name: '攻击力提升',
    icon: effectIcon(15021),
    type: 'buff',
    duration: 15000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.1 }],
  },
  rampart: {
    id: 'rampart',
    name: '铁壁',
    icon: skillEffectIcon(10152),
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'mitigation', value: 0.4 }],
  },
  junze: {
    id: 'junze',
    name: '润泽',
    icon: effectIcon(15021),
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
    icon: effectIcon(16676),
    type: 'buff',
    duration: 0,
    stackable: true,
    maxStacks: Infinity,
    shield: true,
    effects: [],
  },
}

// Map version for tooltip lookups
export const DEMO_BUFF_MAP = new Map(Object.entries(DEMO_BUFFS))
