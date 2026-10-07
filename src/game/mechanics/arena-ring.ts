// src/game/mechanics/arena-ring.ts
// The floor breaks: outer guard rail falls away (edge becomes lethal) and a pit opens at the centre.
import type { MechanicFactory } from './mechanic-host'

export interface ArenaRingParams {
  /** Radius of the central pit */
  inner: number
}

export const ARENA_HOLE_ID = 'arena_hole'

export const arenaRing: MechanicFactory = (ctx, raw) => {
  const p = raw as ArenaRingParams
  ctx.arena.def.boundary = 'lethal'
  ctx.deathZones.add({ id: ARENA_HOLE_ID, center: { x: 0, y: 0 }, facing: 0, shape: { type: 'circle', radius: p.inner }, behavior: 'lethal' })
  ctx.bus.emit('arena:morphed', { boundary: 'lethal', hole: p.inner })
  return { update: () => true }
}
