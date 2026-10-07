// src/renderer/vfx/zone-sampling.ts
import type { AoeShapeDef, Vec2 } from '@/core/types'

/**
 * Uniformly sample points inside an AOE shape (area-uniform, not radius-uniform).
 * Facing convention matches the hit tests: 0° = +Y, direction (sin f, cos f).
 */
export function sampleZonePoints(shape: AoeShapeDef, center: Vec2, facingDeg: number, count: number, rand: () => number = Math.random): Vec2[] {
  const out: Vec2[] = []
  const f = (facingDeg * Math.PI) / 180
  for (let i = 0; i < count; i++) {
    switch (shape.type) {
      case 'circle':
      case 'fan':
      case 'ring': {
        const outer = shape.type === 'ring' ? shape.outerRadius : shape.radius
        const inner = shape.type === 'ring' ? shape.innerRadius : 0
        const raw = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner))
        const r = Math.min(outer * 0.99, Math.max(inner * 1.01, raw))
        const span = shape.type === 'fan' ? (shape.angle * Math.PI) / 180 : Math.PI * 2
        const a = f + (rand() - 0.5) * span * 0.98
        out.push({ x: center.x + Math.sin(a) * r, y: center.y + Math.cos(a) * r })
        break
      }
      case 'rect': {
        const along = rand() * shape.length
        const side = (rand() - 0.5) * shape.width * 0.98
        out.push({
          x: center.x + Math.sin(f) * along + Math.cos(f) * side,
          y: center.y + Math.cos(f) * along - Math.sin(f) * side,
        })
        break
      }
    }
  }
  return out
}
