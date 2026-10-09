import { splitHits } from './hit-split'

describe('splitHits', () => {
  it('shows the requested number of hits that add up to the dealt total', () => {
    const parts = splitHits(9000, 17)
    expect(parts).toHaveLength(17)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(9000)
    expect(Math.min(...parts)).toBeGreaterThan(0)
  })

  it('never shows more hits than damage points', () => {
    expect(splitHits(3, 17)).toEqual([1, 1, 1])
  })
})
