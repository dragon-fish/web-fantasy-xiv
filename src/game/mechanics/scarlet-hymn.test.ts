import { hymnIconAngles, hymnSequence } from './scarlet-hymn'

describe('hymnSequence', () => {
  it('rotate steps clockwise from the start quadrant', () => {
    expect(hymnSequence('rotate', 1, 8)).toEqual([1, 2, 3, 0, 1, 2, 3, 0])
  })
  it('diagonal-8 matches the documented palindrome (blue start)', () => {
    expect(hymnSequence('diagonal', 2, 8)).toEqual([2, 0, 1, 3, 3, 1, 0, 2])
  })
  it('diagonal-4 is A, opposite, clockwise, counter-clockwise', () => {
    expect(hymnSequence('diagonal', 0, 4)).toEqual([0, 2, 1, 3])
  })
})

describe('hymnIconAngles', () => {
  it('lays the first half on the west arc and the rest on the east, in flight order', () => {
    const a = hymnIconAngles(8)
    expect(a.slice(0, 4).every(x => x > 180 && x < 360)).toBe(true)
    expect(a.slice(4).every(x => x > 360 && x < 540)).toBe(true)
    expect([...a].sort((x, y) => x - y)).toEqual(a)
  })
})
