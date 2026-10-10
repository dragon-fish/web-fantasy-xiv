// src/game/mechanics/corner-jump.ts
// The boss leaps to one of the four cardinal points near the rim and turns to face the centre
// (Titan's Upheaval). Points taken by an entity of `avoidGroup` or lying in a death zone (lava a
// dead add left) are skipped. Its follow-up casts aim from there: zones `offset` in its frame.
import type { Vec2 } from '@/core/types'
import type { MechanicFactory } from './mechanic-host'

export interface CornerJumpParams {
  /** Who jumps (default the boss) */
  entity?: string
  /** Distance of the cardinal points from the arena centre */
  radius: number
  /** Entities of this group block the cardinal point they stand near */
  avoidGroup?: string
  /** How near an `avoidGroup` entity must be to block a point (default 4) */
  avoidRange?: number
}

/** North, east, south, west at `radius` */
export function cardinalPoints(radius: number): Vec2[] {
  return [{ x: 0, y: radius }, { x: radius, y: 0 }, { x: 0, y: -radius }, { x: -radius, y: 0 }]
}

/** A random point not blocked; throws when every one is (the encounter left no safe corner) */
export function pickCorner(points: Vec2[], blocked: (p: Vec2) => boolean, rng: () => number): Vec2 {
  const open = points.filter(p => !blocked(p))
  if (!open.length) throw new Error('[corner_jump] every cardinal point is blocked')
  return open[Math.floor(rng() * open.length)]!
}

export const cornerJump: MechanicFactory = (ctx, raw) => {
  const p = raw as CornerJumpParams
  const who = ctx.entities.get(p.entity ?? 'boss')
  if (!who) throw new Error(`[corner_jump] no entity '${p.entity ?? 'boss'}'`)
  const range = p.avoidRange ?? 4
  const blockers = ctx.entities.getAll().filter(e => e.alive && p.avoidGroup != null && e.group === p.avoidGroup)
  const corner = pickCorner(cardinalPoints(p.radius), (c) =>
    ctx.deathZones.isInAnyZone(c) || blockers.some(b => Math.hypot(b.position.x - c.x, b.position.y - c.y) <= range), Math.random)
  who.position.x = corner.x
  who.position.y = corner.y
  // Face the centre (0 = north / +y, clockwise)
  who.facing = ((Math.atan2(-corner.x, -corner.y) * 180) / Math.PI + 360) % 360
  ctx.bus.emit('entity:teleported', { entity: who, position: corner })
  return { update: () => true }
}
