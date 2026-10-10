// src/game/mechanics/arena-ring.ts
// The floor breaks: the outer guard rail falls away (edge becomes lethal); optionally the platform
// shrinks to a smaller radius and/or a pit opens at the centre.
import type { MechanicFactory } from './mechanic-host'

export interface ArenaRingParams {
  /** Radius of the central pit (none when absent) */
  inner?: number
  /** New outer radius: the rim beyond it breaks off (circle arenas) */
  radius?: number
}

export const ARENA_HOLE_ID = 'arena_hole'

export const arenaRing: MechanicFactory = (ctx, raw) => {
  const p = raw as ArenaRingParams
  ctx.arena.def.boundary = 'lethal'
  if (p.radius != null && ctx.arena.def.shape.type === 'circle') ctx.arena.def.shape.radius = p.radius
  if (p.inner) ctx.deathZones.add({ id: ARENA_HOLE_ID, center: { x: 0, y: 0 }, facing: 0, shape: { type: 'circle', radius: p.inner }, behavior: 'lethal' })
  ctx.bus.emit('arena:morphed', { boundary: 'lethal', hole: p.inner ?? 0 })
  return { update: () => true }
}
