import { describe, it, expect } from 'vitest'
import { TOWER_BLUEPRINT_CURRENT, TOWER_BLUEPRINT_MIN_SUPPORTED } from './version'

describe('tower blueprint version', () => {
  it('initializes CURRENT to 1', () => {
    expect(TOWER_BLUEPRINT_CURRENT).toBe(1)
  })

  it('initializes MIN_SUPPORTED to 1', () => {
    expect(TOWER_BLUEPRINT_MIN_SUPPORTED).toBe(1)
  })

  it('MIN_SUPPORTED <= CURRENT invariant', () => {
    expect(TOWER_BLUEPRINT_MIN_SUPPORTED).toBeLessThanOrEqual(TOWER_BLUEPRINT_CURRENT)
  })
})
