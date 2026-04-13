import { describe, it, expect } from 'vitest'
import { calcDash, calcBackstep, calcKnockback, calcPull } from '@/combat/displacement'
import type { Vec2 } from '@/core/types'

describe('calcDash', () => {
  it('should move to 1m from target', () => {
    const result = calcDash({ x: 0, y: 0 }, { x: 10, y: 0 })
    expect(result.x).toBeCloseTo(9)
    expect(result.y).toBeCloseTo(0)
  })

  it('should not move if already within 1m', () => {
    const result = calcDash({ x: 0, y: 0 }, { x: 0.5, y: 0 })
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
  })

  it('should work diagonally', () => {
    const result = calcDash({ x: 0, y: 0 }, { x: 10, y: 10 })
    const dist = Math.sqrt((result.x - 10) ** 2 + (result.y - 10) ** 2)
    expect(dist).toBeCloseTo(1)
  })
})

describe('calcBackstep', () => {
  it('should move backward from target by distance', () => {
    // Entity at (5,0), target at (10,0), backstep 3m → entity moves to (2,0)
    const result = calcBackstep({ x: 5, y: 0 }, { x: 10, y: 0 }, 3)
    expect(result.x).toBeCloseTo(2)
    expect(result.y).toBeCloseTo(0)
  })

  it('should work when target is behind', () => {
    const result = calcBackstep({ x: 5, y: 0 }, { x: 0, y: 0 }, 3)
    expect(result.x).toBeCloseTo(8)
    expect(result.y).toBeCloseTo(0)
  })
})

describe('calcKnockback', () => {
  it('should push entity away from source', () => {
    // Entity at (5,0), source at (0,0), knockback 3m → entity moves to (8,0)
    const result = calcKnockback({ x: 5, y: 0 }, { x: 0, y: 0 }, 3)
    expect(result.x).toBeCloseTo(8)
    expect(result.y).toBeCloseTo(0)
  })

  it('should work diagonally', () => {
    const result = calcKnockback({ x: 3, y: 4 }, { x: 0, y: 0 }, 5)
    // Direction is (3,4) normalized = (0.6, 0.8), push 5m
    expect(result.x).toBeCloseTo(6)
    expect(result.y).toBeCloseTo(8)
  })

  it('should handle entity on top of source (no movement)', () => {
    const result = calcKnockback({ x: 0, y: 0 }, { x: 0, y: 0 }, 5)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })
})

describe('calcPull', () => {
  it('should pull entity toward source', () => {
    // Entity at (10,0), source at (0,0), pull 5m → entity moves to (5,0)
    const result = calcPull({ x: 10, y: 0 }, { x: 0, y: 0 }, 5)
    expect(result.x).toBeCloseTo(5)
    expect(result.y).toBeCloseTo(0)
  })

  it('should not pull past source (cap at source position)', () => {
    // Entity at (3,0), source at (0,0), pull 5m → cap at (0,0)
    const result = calcPull({ x: 3, y: 0 }, { x: 0, y: 0 }, 5)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
  })

  it('should pull exactly to source when distance equals gap', () => {
    const result = calcPull({ x: 5, y: 0 }, { x: 0, y: 0 }, 5)
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
  })

  it('should work diagonally', () => {
    // Entity at (6,8) = 10m from origin, pull 5m toward origin → (3,4)
    const result = calcPull({ x: 6, y: 8 }, { x: 0, y: 0 }, 5)
    expect(result.x).toBeCloseTo(3)
    expect(result.y).toBeCloseTo(4)
  })
})
