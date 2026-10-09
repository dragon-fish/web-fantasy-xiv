// src/game/parry.ts
// Parry (拼刀): an encounter grants `parry_ready` ahead of a tankbuster (a boss skill applying it, lasting
// until the strike). While it is up, pressing the action key (game/parry-prompt.ts) enters a stance that steps down
// perfect → block → guard as each stage expires. A tankbuster landing during a stance is spent on it
// (CombatResolver); its outcome depends on the stage. Any penalty for not parrying belongs to the
// tankbuster itself (`onUnparried`), never to this system.
import type { BuffDef } from '@/core/types'
import { icon } from '@/jobs/commons/icon-paths'

/** Stage lengths. Exact: the stances opt out of the hidden buff grace (`durationGrace: 0`). */
export const PARRY_STAGE_MS = { perfect: 200, block: 250, guard: 450 } as const

/** Granted by the encounter ahead of a tankbuster; the press is only accepted while it is up */
export const PARRY_READY = 'parry_ready'

/** First stage entered by the parry press */
export const PARRY_ENTRY = 'parry_perfect'

/** How long before the strike each outcome still applies (for the HUD ring) */
export const PARRY_WINDOWS = {
  perfect: PARRY_STAGE_MS.perfect,
  block: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block,
  guard: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block + PARRY_STAGE_MS.guard,
}

const stance = (id: string, name: string, image: string, description: string, duration: number, effect: Extract<BuffDef['effects'][number], { type: 'parry' }>, next?: string): BuffDef => ({
  id, name, icon: image, description, type: 'buff', duration, durationGrace: 0, stackable: false, maxStacks: 1,
  effects: [effect], expiresInto: next,
})

export const PARRY_BUFFS: Record<string, BuffDef> = {
  // Its duration is set by the granting skill to end exactly on the strike
  parry_ready: {
    id: 'parry_ready', name: '拼刀预备', icon: icon('effects', 15944),
    description: '死刑来袭：光圈转满前按 空格 拼刀，每次死刑只能按一次。',
    type: 'buff', duration: 5000, durationGrace: 0, stackable: false, maxStacks: 1, effects: [],
  },
  parry_perfect: stance('parry_perfect', '完美格挡', icon('player_skill_effects', 13307), '此时被死刑命中：无伤并获得见切。结束后转为格挡。',
    PARRY_STAGE_MS.perfect, { type: 'parry', guard: 'perfect', damageTaken: 0, grantBuff: 'parry_keen_eye' }, 'parry_block'),
  parry_block: stance('parry_block', '格挡', icon('effects', 15046), '此时被死刑命中：无伤。结束后转为防御。',
    PARRY_STAGE_MS.block, { type: 'parry', guard: 'deflect', damageTaken: 0 }, 'parry_guard'),
  parry_guard: stance('parry_guard', '防御', icon('effects', 15047), '此时被死刑命中：伤害降低 75%。',
    PARRY_STAGE_MS.guard, { type: 'parry', guard: 'block', damageTaken: 0.25 }),
  parry_keen_eye: {
    id: 'parry_keen_eye', name: '见切', description: '完美格挡后看破敌人破绽，伤害提高 20%。',
    type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.2 }],
  },
}
