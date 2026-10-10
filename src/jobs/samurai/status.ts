import type { BuffDef } from '@/core/types'
import { icon } from '../commons/icon-paths'

export const SAMURAI_BUFFS: Record<string, BuffDef> = {
  sam_setsu: {
    id: 'sam_setsu',
    name: '雪',
    description: '集齐雪、月、花后可释放纷乱雪月花。',
    icon: icon('player_skill_effects', 13310),
    type: 'buff',
    duration: Infinity,
    stackable: false,
    maxStacks: 1,
    effects: [],
  },
  sam_getsu: {
    id: 'sam_getsu',
    name: '月',
    description: '集齐雪、月、花后可释放纷乱雪月花。',
    icon: icon('player_skill_effects', 13301),
    type: 'buff',
    duration: Infinity,
    stackable: false,
    maxStacks: 1,
    effects: [],
  },
  sam_ka: {
    id: 'sam_ka',
    name: '花',
    description: '集齐雪、月、花后可释放纷乱雪月花。',
    icon: icon('player_skill_effects', 13302),
    type: 'buff',
    duration: Infinity,
    stackable: false,
    maxStacks: 1,
    effects: [],
  },
}
