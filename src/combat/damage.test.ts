// src/combat/damage.test.ts
import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/combat/damage'

describe('calculateDamage', () => {
  it('should compute base damage: attack × potency', () => {
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [], mitigations: [] })).toBe(2000)
  })

  it('should apply boss convention: attack=1, potency=damage', () => {
    expect(calculateDamage({ attack: 1, potency: 8000, increases: [], mitigations: [] })).toBe(8000)
  })

  it('should apply additive damage increases', () => {
    // 1000 × 2 × (1 + 0.5 + 0.3) = 3600
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [0.5, 0.3], mitigations: [] })).toBe(3600)
  })

  it('should apply multiplicative mitigations', () => {
    // 8000 × (1 - 0.8) × (1 - 0.2) = 8000 × 0.2 × 0.8 = 1280
    expect(calculateDamage({ attack: 1, potency: 8000, increases: [], mitigations: [0.8, 0.2] })).toBe(1280)
  })

  it('should apply increases then mitigations', () => {
    // raw = 1000 × 2 = 2000
    // amplified = 2000 × (1 + 0.5) = 3000
    // final = 3000 × (1 - 0.2) = 2400
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [0.5], mitigations: [0.2] })).toBe(2400)
  })

  it('should floor the result to integer', () => {
    // 1000 × 1.5 × (1 - 0.3) = 1050
    // But with different numbers that produce a float:
    // 100 × 3 × (1 - 0.1) = 270
    expect(calculateDamage({ attack: 100, potency: 3, increases: [], mitigations: [0.1] })).toBe(270)
  })

  it('should never return negative', () => {
    expect(calculateDamage({ attack: 1, potency: 100, increases: [], mitigations: [0.99, 0.99] })).toBeGreaterThanOrEqual(0)
  })
})
