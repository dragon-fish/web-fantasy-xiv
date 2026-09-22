import { InputManager } from './input-manager'
// src/input/input-manager.test.ts
import { describe, it, expect } from 'vitest'
import { InputState, computeMoveDirection, computeDirectionAngle } from '@/input/input-manager'

describe('computeMoveDirection', () => {
  it('should return (0,1) for W only', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: false, d: false })
    expect(dir.x).toBeCloseTo(0)
    expect(dir.y).toBeCloseTo(1)
  })

  it('should return normalized diagonal for W+D', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: false, d: true })
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
    expect(len).toBeCloseTo(1)
    expect(dir.x).toBeGreaterThan(0)
    expect(dir.y).toBeGreaterThan(0)
  })

  it('should return (0,0) when no keys', () => {
    const dir = computeMoveDirection({ w: false, a: false, s: false, d: false })
    expect(dir.x).toBe(0)
    expect(dir.y).toBe(0)
  })

  it('should cancel out opposing keys', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: true, d: false })
    expect(dir.x).toBe(0)
    expect(dir.y).toBe(0)
  })
})
describe('computeDirectionAngle', () => {
  it('should return 0° for north (+Y)', () => {
    expect(computeDirectionAngle({ x: 0, y: 1 })).toBeCloseTo(0, 0)
  })

  it('should return 90° for east (+X)', () => {
    expect(computeDirectionAngle({ x: 1, y: 0 })).toBeCloseTo(90, 0)
  })

  it('should return 180° for south (-Y)', () => {
    expect(computeDirectionAngle({ x: 0, y: -1 })).toBeCloseTo(180, 0)
  })

  it('should return 270° for west (-X)', () => {
    expect(computeDirectionAngle({ x: -1, y: 0 })).toBeCloseTo(270, 0)
  })

  it('should return correct angle for diagonal (NE)', () => {
    const angle = computeDirectionAngle({ x: 1, y: 1 })
    expect(angle).toBeCloseTo(45, 0)
  })
})


describe('input lifecycle', () => {
  it('removes listeners on disposal and clears held keys on blur', () => {
    const input = new InputManager(document.createElement('canvas'))
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    expect(input.keys.w).toBe(true)
    window.dispatchEvent(new Event('blur'))
    expect(input.keys.w).toBe(false)
    input.dispose()
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))
    expect(input.keys.w).toBe(false)
  })
})
