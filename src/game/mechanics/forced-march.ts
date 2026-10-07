// src/game/mechanics/forced-march.ts
// 傀儡旋律 / 傀儡诗: the player is tethered to a fireball in one compass direction. When the
// debuff runs out they are forced to walk that way (no control) — position first, or fall.
import type { MechanicFactory } from './mechanic-host'

export const MARCH_DIRECTIONS = [0, 90, 180, 270] as const
const DIR_SUFFIX: Record<number, string> = { 0: 'n', 90: 'e', 180: 's', 270: 'w' }

export interface ForcedMarchParams {
  /** Countdown before the march (debuff duration) */
  delay: number
  /** Length of the forced walk */
  duration: number
  /** Compass direction; random when omitted */
  dir?: 0 | 90 | 180 | 270
  /** Buff id prefix; the debuff is `${prefix}_n|e|s|w` (one def per direction for the tooltip) */
  debuffPrefix: string
  /** Stun-type buff applied while marching */
  marchBuff: string
  /** Walking speed (m/s) */
  speed?: number
}

export function marchStep(dir: number, speed: number, dt: number): { dx: number; dy: number } {
  const r = (dir * Math.PI) / 180
  return { dx: Math.sin(r) * speed * (dt / 1000), dy: Math.cos(r) * speed * (dt / 1000) }
}

export const forcedMarch: MechanicFactory = (ctx, raw, id) => {
  const p = raw as ForcedMarchParams
  const dir = p.dir ?? MARCH_DIRECTIONS[Math.floor(Math.random() * 4)]
  const player = ctx.player
  const debuff = ctx.buffDef(`${p.debuffPrefix}_${DIR_SUFFIX[dir]}`)
  if (debuff) ctx.buffs.applyBuff(player, debuff, 'boss', 1, p.delay)
  ctx.bus.emit('mechanic:march_start', { id, dir, delay: p.delay, targetId: player.id })
  let t = 0
  let marching = false
  return {
    update(dt) {
      t += dt
      if (!player.alive) {
        ctx.bus.emit('mechanic:march_end', { id })
        return true
      }
      if (!marching && t >= p.delay) {
        marching = true
        const stun = ctx.buffDef(p.marchBuff)
        if (stun) ctx.buffs.applyBuff(player, stun, 'boss', 1, p.duration)
        ctx.bus.emit('mechanic:march_go', { id, dir })
      }
      if (marching) {
        const { dx, dy } = marchStep(dir, p.speed ?? player.speed, dt)
        const next = ctx.arena.clampPosition({ x: player.position.x + dx, y: player.position.y + dy })
        player.position.x = next.x
        player.position.y = next.y
        player.facing = dir
        if (t >= p.delay + p.duration) {
          ctx.bus.emit('mechanic:march_end', { id })
          return true
        }
      }
      return false
    },
  }
}
