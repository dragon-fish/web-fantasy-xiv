// src/game/parry.ts
// Parry (拼刀): pressing the action key ahead of a tankbuster enters a stance that steps down
// perfect → block → guard as each stage expires. A tankbuster landing during a stance is spent on it
// (CombatResolver); its outcome depends on the stage. Any penalty for not parrying belongs to the
// tankbuster itself (`onUnparried`), never to this system.
import type { BuffDef } from '@/core/types'

/** Stage lengths. Exact: the stances opt out of the hidden buff grace (`durationGrace: 0`). */
export const PARRY_STAGE_MS = { perfect: 200, block: 250, guard: 450 } as const

/** First stage entered by the parry press */
export const PARRY_ENTRY = 'parry_perfect'

/** How long before the strike each outcome still applies (for the HUD ring) */
export const PARRY_WINDOWS = {
  perfect: PARRY_STAGE_MS.perfect,
  block: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block,
  guard: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block + PARRY_STAGE_MS.guard,
}

const stance = (id: string, name: string, duration: number, effect: Extract<BuffDef['effects'][number], { type: 'parry' }>, next?: string): BuffDef => ({
  id, name, type: 'buff', duration, durationGrace: 0, stackable: false, maxStacks: 1, hidden: true,
  effects: [effect], expiresInto: next,
})

export const PARRY_BUFFS: Record<string, BuffDef> = {
  parry_perfect: stance('parry_perfect', '完美格挡', PARRY_STAGE_MS.perfect, { type: 'parry', guard: 'perfect', damageTaken: 0, grantBuff: 'parry_keen_eye' }, 'parry_block'),
  parry_block: stance('parry_block', '格挡', PARRY_STAGE_MS.block, { type: 'parry', guard: 'deflect', damageTaken: 0 }, 'parry_guard'),
  parry_guard: stance('parry_guard', '防御', PARRY_STAGE_MS.guard, { type: 'parry', guard: 'block', damageTaken: 0.25 }),
  parry_keen_eye: {
    id: 'parry_keen_eye', name: '见切', description: '完美格挡后看破敌人破绽，伤害提高 20%。',
    type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.2 }],
  },
}
