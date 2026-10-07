import { gradeTiming } from './timed-input'

describe('gradeTiming', () => {
  it('grades by distance from the target moment, inclusive edges', () => {
    expect(gradeTiming(0)).toBe('just')
    expect(gradeTiming(-70)).toBe('just')
    expect(gradeTiming(71)).toBe('perfect')
    expect(gradeTiming(-150)).toBe('perfect')
    expect(gradeTiming(300)).toBe('good')
  })
  it('splits misses into early and late, and a missing press is late', () => {
    expect(gradeTiming(-301)).toBe('early')
    expect(gradeTiming(301)).toBe('late')
    expect(gradeTiming(null)).toBe('late')
  })
})
