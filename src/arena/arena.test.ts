// src/arena/arena.test.ts
import { describe, it, expect } from 'vitest'
import { Arena } from '@/arena/arena'
import type { ArenaDef } from '@/core/types'

describe('Arena', () => {
  it('should detect point inside circle arena', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'circle', radius: 20 }, boundary: 'lethal' }
    const arena = new Arena(def)
    expect(arena.isInBounds({ x: 0, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 19, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 21, y: 0 })).toBe(false)
  })

  it('should detect point inside rect arena', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'rect', width: 40, height: 30 }, boundary: 'wall' }
    const arena = new Arena(def)
    expect(arena.isInBounds({ x: 0, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 19, y: 14 })).toBe(true)
    expect(arena.isInBounds({ x: 21, y: 0 })).toBe(false)
  })

  it('should clamp position for wall boundary', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'circle', radius: 10 }, boundary: 'wall' }
    const arena = new Arena(def)
    const clamped = arena.clampPosition({ x: 20, y: 0 })
    expect(clamped.x).toBeCloseTo(10)
    expect(clamped.y).toBeCloseTo(0)
  })

  it('should clamp position for rect wall boundary', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'rect', width: 20, height: 10 }, boundary: 'wall' }
    const arena = new Arena(def)
    const clamped = arena.clampPosition({ x: 15, y: 8 })
    expect(clamped.x).toBeCloseTo(10)
    expect(clamped.y).toBeCloseTo(5)
  })
})

describe('safe self-moves', () => {
  it('backs a dash off a lethal pit to the first safe spot with margin', () => {
    const arena = new Arena({ name: 't', shape: { type: 'circle', radius: 20 }, boundary: 'lethal' })
    arena.setLethalZoneProvider(() => [{ id: 'hole', center: { x: 0, y: 0 }, facing: 0, shape: { type: 'circle', radius: 5 }, behavior: 'lethal' }])
    const to = arena.safeAlong({ x: 0, y: -15 }, { x: 0, y: -2 })
    expect(arena.isLethal(to)).toBe(false)
    expect(to.y).toBeCloseTo(-5.75, 1)
  })
  it('leaves safe destinations untouched and never walks off the outer edge', () => {
    const arena = new Arena({ name: 't', shape: { type: 'circle', radius: 20 }, boundary: 'lethal' })
    expect(arena.safeAlong({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 0, y: 10 })
    expect(arena.isLethal(arena.safeAlong({ x: 0, y: 15 }, { x: 0, y: 26 }))).toBe(false)
  })
})
