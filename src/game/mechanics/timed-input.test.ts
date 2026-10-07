import { gradeTiming } from './timed-input'

describe('gradeTiming', () => {
  it('grades by distance from the target moment, inclusive edges', () => {
    expect(gradeTiming(0)).toBe('just')
    expect(gradeTiming(-40)).toBe('just')
    expect(gradeTiming(41)).toBe('perfect')
    expect(gradeTiming(-90)).toBe('perfect')
    expect(gradeTiming(180)).toBe('good')
  })
  it('splits misses into early and late, and a missing press is late', () => {
    expect(gradeTiming(-181)).toBe('early')
    expect(gradeTiming(181)).toBe('late')
    expect(gradeTiming(null)).toBe('late')
  })
})
