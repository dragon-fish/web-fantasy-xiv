import type { BuffDef } from '@/core/types'

export const ARCHER_BUFFS: Record<string, BuffDef> = {
  arc_venom: {
    id: 'arc_venom',
    name: '中毒',
    description: '持续受到物理伤害。',
    type: 'debuff',
    duration: 18000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'dot', potency: 0.3, interval: 3000 }],
  },
  arc_barrage: {
    id: 'arc_barrage',
    name: '强化',
    description: '攻击力提升 30%。',
    type: 'buff',
    duration: 6000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.30 }],
  },
}
