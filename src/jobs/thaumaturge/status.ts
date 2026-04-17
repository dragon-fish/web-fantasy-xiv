import type { BuffDef } from '@/core/types'

export const THAUMATURGE_BUFFS: Record<string, BuffDef> = {
  thm_swiftcast_ready: {
    id: 'thm_swiftcast_ready',
    name: '即刻咏唱',
    description: '下一次咏唱立即完成。',
    type: 'buff',
    duration: 10000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'next_cast_instant', consumeOnCast: true }],
  },
}
