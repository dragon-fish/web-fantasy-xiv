import type { BuffDef } from '@/core/types'

export const SWORDSMAN_BUFFS: Record<string, BuffDef> = {
  swm_guard: {
    id: 'swm_guard',
    name: '架式',
    description: '攻击力提升 20%。',
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.20 }],
  },
}
