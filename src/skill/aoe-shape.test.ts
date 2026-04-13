// src/skill/aoe-shape.test.ts
import { describe, it, expect } from 'vitest'
import { isPointInAoeShape } from '@/skill/aoe-shape'
import type { AoeShapeDef, Vec2 } from '@/core/types'

describe('isPointInAoeShape', () => {
  const origin: Vec2 = { x: 0, y: 0 }

  it('circle: inside', () => {
    const shape: AoeShapeDef = { type: 'circle', radius: 5 }
    expect(isPointInAoeShape({ x: 3, y: 0 }, origin, shape, 0)).toBe(true)
  })

  it('circle: outside', () => {
    const shape: AoeShapeDef = { type: 'circle', radius: 5 }
    expect(isPointInAoeShape({ x: 6, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('fan: inside', () => {
    const shape: AoeShapeDef = { type: 'fan', radius: 10, angle: 90 }
    expect(isPointInAoeShape({ x: 0, y: 5 }, origin, shape, 0)).toBe(true)
  })

  it('fan: outside angle', () => {
    const shape: AoeShapeDef = { type: 'fan', radius: 10, angle: 90 }
    expect(isPointInAoeShape({ x: 10, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('ring: inside ring', () => {
    const shape: AoeShapeDef = { type: 'ring', innerRadius: 5, outerRadius: 10 }
    expect(isPointInAoeShape({ x: 7, y: 0 }, origin, shape, 0)).toBe(true)
  })

  it('ring: inside hole', () => {
    const shape: AoeShapeDef = { type: 'ring', innerRadius: 5, outerRadius: 10 }
    expect(isPointInAoeShape({ x: 3, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('rect: inside', () => {
    const shape: AoeShapeDef = { type: 'rect', length: 10, width: 4 }
    expect(isPointInAoeShape({ x: 0, y: 5 }, origin, shape, 0)).toBe(true)
  })

  it('rect: outside', () => {
    const shape: AoeShapeDef = { type: 'rect', length: 10, width: 4 }
    expect(isPointInAoeShape({ x: 5, y: 5 }, origin, shape, 0)).toBe(false)
  })
})
