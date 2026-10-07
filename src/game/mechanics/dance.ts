// src/game/mechanics/dance.ts
// 跳舞机 (Eternal Flame): at each beat the player must stand inside the ring AND face the
// arrow's direction. No key press — facing comes from the last movement direction.
// Success stacks a damage buff on the player; failure stacks one on the boss.
import type { Vec2 } from '@/core/types'
import type { MechanicFactory } from './mechanic-host'

/** Arrow directions: world facing in degrees (0 = north/+Y, 90 = east/+X) */
export const DANCE_DIRECTIONS = [0, 90, 180, 270] as const

/** Facing tolerance either side of the arrow */
export const DANCE_FACING_TOLERANCE = 45

export function judgeDanceNote(pos: Vec2, facing: number, center: Vec2, radius: number, arrow: number): boolean {
  if (Math.hypot(pos.x - center.x, pos.y - center.y) > radius) return false
  const diff = Math.abs((((facing - arrow) % 360) + 540) % 360 - 180)
  return diff <= DANCE_FACING_TOLERANCE
}

export interface DanceParams {
  /** Beat times in ms from mechanic start */
  beats: number[]
  center: Vec2
  radius: number
  /** How long before each beat its arrow appears (and its orb starts flying) */
  lead?: number
  successBuff: string
  failBuff: string
  /** Entity receiving fail stacks (default boss) */
  boss?: string
}

export const dance: MechanicFactory = (ctx, raw, id) => {
  const p = raw as DanceParams
  const lead = p.lead ?? 1800
  const notes = p.beats.map(at => ({ at, dir: DANCE_DIRECTIONS[Math.floor(Math.random() * 4)], shown: false, judged: false }))
  let t = 0
  ctx.bus.emit('mechanic:dance_start', { id, center: p.center, radius: p.radius, total: notes.length })

  return {
    update(dt) {
      t += dt
      notes.forEach((note, index) => {
        if (!note.shown && t >= note.at - lead) {
          note.shown = true
          ctx.bus.emit('mechanic:dance_note', { id, index, dir: note.dir, lead: Math.max(0, note.at - t) })
        }
        if (!note.judged && t >= note.at) {
          note.judged = true
          const player = ctx.player
          const success = player.alive && judgeDanceNote(player.position, player.facing, p.center, p.radius, note.dir)
          ctx.bus.emit('mechanic:dance_judge', { id, index, success })
          const buffId = success ? p.successBuff : p.failBuff
          const target = success ? player : ctx.entities.get(p.boss ?? 'boss')
          const def = ctx.buffDef(buffId)
          if (def && target) ctx.buffs.applyBuff(target, def, target.id)
        }
      })
      if (notes.every(n => n.judged)) {
        ctx.bus.emit('mechanic:dance_end', { id })
        return true
      }
      return false
    },
  }
}
