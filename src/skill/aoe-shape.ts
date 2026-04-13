// src/skill/aoe-shape.ts
import type { AoeShapeDef, Vec2 } from '@/core/types'
import { pointInCircle, pointInFan, pointInRing, pointInRect } from '@/arena/geometry'

export function isPointInAoeShape(
  point: Vec2,
  center: Vec2,
  shape: AoeShapeDef,
  facingDeg: number,
): boolean {
  switch (shape.type) {
    case 'circle':
      return pointInCircle(point, center, shape.radius)
    case 'fan':
      return pointInFan(point, center, shape.radius, shape.angle, facingDeg)
    case 'ring':
      return pointInRing(point, center, shape.innerRadius, shape.outerRadius)
    case 'rect':
      return pointInRect(point, center, shape.length, shape.width, facingDeg)
  }
}
