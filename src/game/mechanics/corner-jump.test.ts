import { cardinalPoints, pickCorner } from './corner-jump'

describe('pickCorner', () => {
  it('only lands on cardinal points that are not blocked', () => {
    const blocked = (p: { x: number; y: number }) => p.x === 10 || p.y === 10 // east and north taken
    const picks = new Set([0, 0.3, 0.6, 0.99].map(r => JSON.stringify(pickCorner(cardinalPoints(10), blocked, () => r))))
    expect([...picks].map(s => JSON.parse(s))).toEqual(expect.arrayContaining([{ x: 0, y: -10 }, { x: -10, y: 0 }]))
    expect(picks.size).toBe(2)
  })

  it('fails loudly when no corner is left', () => {
    expect(() => pickCorner(cardinalPoints(10), () => true, () => 0)).toThrow()
  })
})
