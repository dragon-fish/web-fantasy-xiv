// src/game/mechanics/blade-clash.ts
// 拼刀: the player parries a heavy strike with the action key (Space) at the moment it lands.
// Damage resolves once, at the strike moment (or at the press, if pressed late inside the window).
import type { MechanicFactory } from './mechanic-host'
import { DEFAULT_WINDOWS, gradeTiming, type TimingGrade } from './timed-input'

export interface BladeClashParams {
  /** Entity delivering the strike (default: boss) */
  source?: string
  /** ms from start until the strike lands */
  windup: number
  skillName?: string
  /** Damage (potency × source attack) on a good parry / on a miss */
  goodPotency: number
  missPotency: number
  /** Buff ids applied to the player on just / on a miss */
  justBuff?: string
  missBuff?: string
}

const LABEL: Record<TimingGrade, string> = { just: 'JUST!', perfect: 'PERFECT', good: 'GOOD', early: 'EARLY', late: 'LATE' }

export const bladeClash: MechanicFactory = (ctx, raw, id) => {
  const p = raw as BladeClashParams
  const source = ctx.entities.get(p.source ?? 'boss')
  const player = ctx.player
  const startPresses = ctx.input.actionPresses
  let t = 0
  let pressAt: number | null = null
  ctx.bus.emit('mechanic:clash_start', { id, sourceId: source?.id ?? null, targetId: player.id, windup: p.windup })

  let shownUntil = -1
  const resolve = (grade: TimingGrade) => {
    ctx.bus.emit('mechanic:clash_result', { id, grade, sourceId: source?.id ?? null, targetId: player.id })
    ctx.setQte({ elapsed: t, windup: p.windup, windows: DEFAULT_WINDOWS, grade: LABEL[grade] })
    shownUntil = t + 800
    if (!player.alive || !source) return
    const buff = (buffId?: string) => {
      const def = buffId ? ctx.buffDef(buffId) : undefined
      if (def) ctx.buffs.applyBuff(player, def, source.id)
    }
    switch (grade) {
      case 'just': buff(p.justBuff); break
      case 'perfect': break
      case 'good': ctx.combat.applyDamage(source, player, p.goodPotency, p.skillName); break
      default:
        ctx.combat.applyDamage(source, player, p.missPotency, p.skillName)
        buff(p.missBuff)
    }
  }

  return {
    update(dt) {
      t += dt
      // Keep the judged prompt on screen briefly, then clear it
      if (shownUntil >= 0) {
        if (t < shownUntil) return false
        ctx.setQte(null)
        return true
      }
      ctx.setQte({ elapsed: t, windup: p.windup, windows: DEFAULT_WINDOWS, grade: null })
      if (pressAt === null && ctx.input.actionPresses > startPresses) pressAt = t
      if (pressAt !== null) {
        const grade = gradeTiming(pressAt - p.windup, DEFAULT_WINDOWS)
        // An early press is final, but the strike still lands on schedule
        if (grade === 'early' && t < p.windup) return false
        resolve(grade)
        return false
      }
      if (t > p.windup + DEFAULT_WINDOWS.good) {
        resolve('late')
        return false
      }
      return false
    },
  }
}
