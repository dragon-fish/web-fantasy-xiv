// src/game/mechanics/move-along.ts
// Scripted flight: moves an entity along waypoints (or an orbit arc) at constant speed,
// ignoring arena clamping so bosses can leave and re-enter the stage.
import type { Vec2 } from '@/core/types'
import type { MechanicFactory } from './mechanic-host'

export interface MoveAlongParams {
  entity?: string
  /** Explicit waypoints; the entity's current position is prepended */
  path?: Vec2[]
  /** Or an arc around `center` (deg: 0 = north, clockwise positive) */
  orbit?: { center?: Vec2; radius: number; fromDeg: number; sweepDeg: number }
  duration: number
  /** Face the travel direction (default true) */
  faceTravel?: boolean
}

export function orbitPoints(o: NonNullable<MoveAlongParams['orbit']>): Vec2[] {
  const c = o.center ?? { x: 0, y: 0 }
  const steps = Math.max(2, Math.ceil(Math.abs(o.sweepDeg) / 8))
  const pts: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((o.fromDeg + (o.sweepDeg * i) / steps) * Math.PI) / 180
    pts.push({ x: c.x + Math.sin(a) * o.radius, y: c.y + Math.cos(a) * o.radius })
  }
  return pts
}

/** Point at fraction `t` (0..1) of the polyline's total length. */
export function pointAlong(pts: Vec2[], t: number): { pos: Vec2; heading: number } {
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d }
  let want = Math.min(1, Math.max(0, t)) * total
  for (let i = 0; i < seg.length; i++) {
    const a = pts[i], b = pts[i + 1]
    const heading = ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360
    if (want <= seg[i] || i === seg.length - 1) {
      const k = seg[i] > 0 ? Math.min(1, want / seg[i]) : 1
      return { pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, heading }
    }
    want -= seg[i]
  }
  return { pos: { ...pts[pts.length - 1] }, heading: 0 }
}

export const moveAlong: MechanicFactory = (ctx, raw) => {
  const p = raw as MoveAlongParams
  const entity = ctx.entities.get(p.entity ?? 'boss')
  if (!entity) return { update: () => true }
  const pts = [{ x: entity.position.x, y: entity.position.y }, ...(p.orbit ? orbitPoints(p.orbit) : p.path ?? [])]
  let t = 0
  return {
    update(dt) {
      t += dt
      const { pos, heading } = pointAlong(pts, t / p.duration)
      entity.position.x = pos.x
      entity.position.y = pos.y
      if (p.faceTravel !== false) entity.facing = heading
      return t >= p.duration
    },
  }
}
