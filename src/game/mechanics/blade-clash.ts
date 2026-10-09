// src/game/mechanics/blade-clash.ts
// 拼刀 prompt: during a tankbuster's windup the player may press the action key (Space) once to
// enter a parry stance (game/parry.ts). The tankbuster resolves the outcome when it lands; this
// mechanic only offers the press, draws the ring and shows the verdict.
import type { FlurryGuard } from '@/core/types'
import { PARRY_BUFFS, PARRY_ENTRY, PARRY_WINDOWS } from '../parry'
import type { MechanicFactory } from './mechanic-host'

export interface BladeClashParams {
  /** Entity delivering the strike (default: boss) */
  source?: string
  /** ms from start until the strike lands */
  windup: number
}

export type ClashGrade = 'just' | 'perfect' | 'good' | 'early' | 'late'

const LABEL: Record<ClashGrade, string> = { just: 'JUST!', perfect: 'PERFECT', good: 'GOOD', early: 'EARLY', late: 'LATE' }
const GRADE: Record<FlurryGuard, ClashGrade> = { perfect: 'just', deflect: 'perfect', block: 'good', none: 'late' }

/** Verdict stays on screen this long */
const SHOW_MS = 800
/** Give up quietly if the strike never lands (boss died, timeline moved on) */
const ABANDON_AFTER_MS = 2000

export const bladeClash: MechanicFactory = (ctx, raw, id) => {
  const p = raw as BladeClashParams
  const source = ctx.entities.get(p.source ?? 'boss')
  const player = ctx.player
  const startPresses = ctx.input.actionPresses
  let t = 0
  let pressed = false
  let grade: ClashGrade | null = null
  let shownUntil = 0
  ctx.bus.emit('mechanic:clash_start', { id, sourceId: source?.id ?? null, targetId: player.id, windup: p.windup })

  const onParry = (e: { targetId: string; guard: FlurryGuard }) => {
    if (e.targetId !== player.id || grade) return
    // A press that ran out before the strike is "early"; no press at all is "late"
    grade = e.guard === 'none' && pressed ? 'early' : GRADE[e.guard]
    shownUntil = t + SHOW_MS
    ctx.bus.emit('mechanic:clash_result', { id, grade, sourceId: source?.id ?? null, targetId: player.id })
  }
  ctx.bus.on('combat:parry', onParry)
  const finish = () => {
    ctx.bus.off('combat:parry', onParry)
    ctx.setQte(null)
    return true
  }

  return {
    update(dt) {
      t += dt
      // One press per strike; presses made before the prompt opened never count
      if (!pressed && !grade && player.alive && ctx.input.actionPresses > startPresses) {
        pressed = true
        ctx.buffs.applyBuff(player, PARRY_BUFFS[PARRY_ENTRY], player.id)
      }
      if (grade) {
        if (t >= shownUntil) return finish()
        ctx.setQte({ elapsed: t, windup: p.windup, windows: PARRY_WINDOWS, grade: LABEL[grade] })
        return false
      }
      if (t > p.windup + ABANDON_AFTER_MS) return finish()
      ctx.setQte({ elapsed: t, windup: p.windup, windows: PARRY_WINDOWS, grade: null })
      return false
    },
  }
}
