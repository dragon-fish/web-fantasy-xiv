// src/game/control-status.ts
// Which debuff explains "my keys do nothing": the player-facing summary of crowd control.
import type { BuffDef } from '@/core/types'
import type { BuffInstance } from '@/entity/entity'

export interface ControlStatus {
  defId: string
  name: string
  icon?: string
  remaining: number
  /** Full length of the effect, for a countdown bar */
  total: number
}

/** Effects that swallow player input */
const CONTROL_EFFECTS = new Set(['stun', 'silence'])

/** Matches BuffSystem.applyBuff's default grace on timed buffs */
const DEFAULT_GRACE = 500

/** The input-blocking debuff with the most time left, or null. Permanent ones are ignored (no countdown). */
export function pickControlStatus(buffs: BuffInstance[], defOf: (id: string) => BuffDef | undefined): ControlStatus | null {
  let best: ControlStatus | null = null
  for (const inst of buffs) {
    const def = defOf(inst.defId)
    if (!def || inst.remaining <= 0 || !def.effects.some(e => CONTROL_EFFECTS.has(e.type))) continue
    if (best && best.remaining >= inst.remaining) continue
    // Applied durations can be overridden; never let the bar start above full
    const total = Math.max(inst.remaining, def.duration > 0 ? def.duration + (def.durationGrace ?? DEFAULT_GRACE) : 0)
    best = { defId: def.id, name: def.name, icon: def.icon, remaining: inst.remaining, total }
  }
  return best
}
