// src/game/parry.ts
// Parry (拼刀): an encounter grants `parry_ready` ahead of a tankbuster (a skill applying it, lasting
// until the strike). While it is up, pressing the action key (game/parry-prompt.ts) enters the
// 防御 stance at 3 stacks, which run down one at a time: 3 = perfect, 2 = block, 1 = guard. A tankbuster
// landing during the stance is spent on it (CombatResolver); its outcome depends on the stacks left.
// Any penalty for not parrying belongs to the tankbuster itself (`onUnparried`), never to this system.
import type { BuffDef } from '@/core/types'
import type { BuffSystem } from '@/combat/buff'
import type { Entity } from '@/entity/entity'
import { icon } from '@/jobs/commons/icon-paths'

/** Stage lengths. Exact: the stance opts out of the hidden buff grace (`durationGrace: 0`). */
export const PARRY_STAGE_MS = { perfect: 200, block: 250, guard: 450 } as const

/** Granted by the encounter ahead of a tankbuster; the press is only accepted while it is up */
export const PARRY_READY = 'parry_ready'
export const PARRY_STANCE = 'parry_stance'

/** How long before the strike each outcome still applies (for the HUD ring) */
export const PARRY_WINDOWS = {
  perfect: PARRY_STAGE_MS.perfect,
  block: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block,
  guard: PARRY_STAGE_MS.perfect + PARRY_STAGE_MS.block + PARRY_STAGE_MS.guard,
}

export const PARRY_BUFFS: Record<string, BuffDef> = {
  // Its duration is set by the granting skill to end exactly on the strike
  parry_ready: {
    id: PARRY_READY, name: '拼刀预备', icon: icon('effects', 15944),
    description: '死刑来袭：光圈转满前按 空格 拼刀，每次死刑只能按一次。',
    type: 'buff', duration: 5000, durationGrace: 0, stackable: false, maxStacks: 1, effects: [],
  },
  parry_stance: {
    id: PARRY_STANCE, name: '防御',
    description: '每层持续时间结束掉 1 层。此时被死刑命中 —— 3 层：完美格挡，无伤并获得见切；2 层：格挡，无伤；1 层：伤害降低 75%。',
    icon: icon('effects', 15047),
    iconPerStack: { 3: icon('player_skill_effects', 13307), 2: icon('effects', 15046), 1: icon('effects', 15047) },
    type: 'buff', stackable: true, maxStacks: 3, durationGrace: 0,
    // Entered at 3 stacks; index = stacks - 1
    duration: PARRY_STAGE_MS.perfect,
    stackDurations: [PARRY_STAGE_MS.guard, PARRY_STAGE_MS.block, PARRY_STAGE_MS.perfect],
    effects: [{
      type: 'parry',
      byStacks: [
        { guard: 'block', damageTaken: 0.25 },
        { guard: 'deflect', damageTaken: 0 },
        { guard: 'perfect', damageTaken: 0, grantBuff: 'parry_keen_eye' },
      ],
    }],
  },
  parry_keen_eye: {
    id: 'parry_keen_eye', name: '见切', description: '完美格挡后看破敌人破绽，伤害提高 20%。',
    type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.2 }],
  },
}

/** The parry press: enter the stance at full stacks */
export function enterParryStance(buffs: BuffSystem, player: Entity): void {
  buffs.applyBuff(player, PARRY_BUFFS[PARRY_STANCE], player.id, 3)
}
