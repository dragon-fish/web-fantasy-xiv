// src/arena/arena.ts
import type { ArenaDef, DeathZoneDef, Vec2 } from '@/core/types'
import { isPointInAoeShape } from '@/skill/aoe-shape'

export class Arena {
  private wallZoneProvider: () => DeathZoneDef[] = () => []

  constructor(readonly def: ArenaDef) {}

  setWallZoneProvider(fn: () => DeathZoneDef[]): void {
    this.wallZoneProvider = fn
  }

  isInBounds(point: Vec2): boolean {
    const { shape } = this.def
    if (shape.type === 'circle') {
      return point.x * point.x + point.y * point.y <= shape.radius * shape.radius
    }
    // rect: centered at origin
    const hw = shape.width / 2
    const hh = shape.height / 2
    return Math.abs(point.x) <= hw && Math.abs(point.y) <= hh
  }

  /** Check if a point is inside any death zone (inner zones OR outside lethal boundary) */
  isInDeathZone(point: Vec2): boolean {
    // Outside lethal boundary
    if (this.def.boundary === 'lethal' && !this.isInBounds(point)) return true

    // Inner death zones
    if (this.def.deathZones) {
      for (const zone of this.def.deathZones) {
        if (isPointInAoeShape(point, zone.center, zone.shape, zone.facing)) return true
      }
    }

    return false
  }

  /**
   * Push a point out of any wall zone it's inside.
   * Per-shape push-out to nearest edge.
   */
  clampToWallZones(point: Vec2, wallZones?: DeathZoneDef[]): Vec2 {
    const zones = wallZones ?? this.wallZoneProvider()
    let result = { ...point }
    for (const zone of zones) {
      if (!isPointInAoeShape(result, zone.center, zone.shape, zone.facing)) continue
      result = this.pushOutOfZone(result, zone)
    }
    return result
  }

  private pushOutOfZone(point: Vec2, zone: DeathZoneDef): Vec2 {
    const { shape, center, facing } = zone

    if (shape.type === 'circle') {
      const dx = point.x - center.x
      const dy = point.y - center.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 0.001) return { x: center.x, y: center.y + shape.radius + 0.05 }
      const scale = (shape.radius + 0.05) / dist
      return { x: center.x + dx * scale, y: center.y + dy * scale }
    }

    if (shape.type === 'rect') {
      // Transform to local coords (same as pointInRect in geometry.ts)
      const rad = facing * Math.PI / 180
      const sin = Math.sin(rad)
      const cos = Math.cos(rad)
      const dx = point.x - center.x
      const dy = point.y - center.y
      const localX = dx * cos - dy * sin   // perpendicular to facing
      const localY = dx * sin + dy * cos   // along facing (0..length)

      const hw = shape.width / 2
      // Distances to each edge
      const dLeft = localX + hw        // distance to localX = -hw
      const dRight = hw - localX       // distance to localX = +hw
      const dBottom = localY            // distance to localY = 0
      const dTop = shape.length - localY // distance to localY = length

      const minDist = Math.min(dLeft, dRight, dBottom, dTop)
      let outX = localX
      let outY = localY
      const EPS = 0.05

      if (minDist === dLeft)       outX = -hw - EPS
      else if (minDist === dRight) outX = hw + EPS
      else if (minDist === dBottom) outY = -EPS
      else                         outY = shape.length + EPS

      // Transform back to world coords
      return {
        x: center.x + outX * cos + outY * sin,
        y: center.y - outX * sin + outY * cos,
      }
    }

    // Fallback for fan/ring: push from center
    const dx = point.x - center.x
    const dy = point.y - center.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const r = shape.type === 'ring' ? shape.outerRadius : (shape as any).radius ?? 1
    if (dist < 0.001) return { x: center.x, y: center.y + r + 0.05 }
    const scale = (r + 0.05) / dist
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

  clampPosition(point: Vec2): Vec2 {
    // Lethal boundary: no clamping, player can walk outside
    if (this.def.boundary === 'lethal') return point

    const { shape } = this.def
    if (shape.type === 'circle') {
      const dist = Math.sqrt(point.x * point.x + point.y * point.y)
      if (dist <= shape.radius) return point
      const scale = shape.radius / dist
      return { x: point.x * scale, y: point.y * scale }
    }
    const hw = shape.width / 2
    const hh = shape.height / 2
    return {
      x: Math.max(-hw, Math.min(hw, point.x)),
      y: Math.max(-hh, Math.min(hh, point.y)),
    }
  }
}
