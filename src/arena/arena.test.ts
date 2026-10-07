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

