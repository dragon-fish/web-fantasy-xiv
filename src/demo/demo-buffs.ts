import type { BuffDef } from '@/core/types'

export const DEMO_BUFFS: Record<string, BuffDef> = {
  embolden: {
    id: 'embolden',
    name: '强化',
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.2 }],
  },
  rampart: {
    id: 'rampart',
    name: '铁壁',
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'mitigation', value: 0.4 }],
  },
}
