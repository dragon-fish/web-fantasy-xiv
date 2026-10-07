import { gradeTiming } from './timed-input'

const w = { just: 70, perfect: 150, good: 300 }

describe('gradeTiming', () => {
  it('grades by distance from the target moment, inclusive edges', () => {
    expect(gradeTiming(0, w)).toBe('just')
    expect(gradeTiming(-70, w)).toBe('just')
    expect(gradeTiming(71, w)).toBe('perfect')
    expect(gradeTiming(-150, w)).toBe('perfect')
    expect(gradeTiming(300, w)).toBe('good')
  })
  it('splits misses into early and late, and a missing press is late', () => {
    expect(gradeTiming(-301, w)).toBe('early')
    expect(gradeTiming(301, w)).toBe('late')
    expect(gradeTiming(null, w)).toBe('late')
  })
})
