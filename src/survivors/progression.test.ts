import { Progression } from './progression'

describe('survivor progression', () => {
  it('preserves surplus XP and requires one selection per earned level', () => {
    const p = new Progression(() => 0.3)
    p.gainXp(100)
    const earned = p.pending
    expect(earned).toBeGreaterThan(1)
    const xp = p.xp
    p.choose(p.offers[0]!.id)
    expect(p.pending).toBe(earned - 1)
    expect(p.xp).toBe(xp)
    expect(p.offers).toHaveLength(3)
  })
  it('rejects unoffered cards and excludes maxed upgrades', () => {
    const p = new Progression(() => 0.3)
    expect(() => p.choose('fire')).toThrow()
    p.ranks.fire = 5
    p.gainXp(100)
    expect(p.offers.some(c => c.id === 'fire')).toBe(false)
    expect(new Set(p.offers.map(c => c.id)).size).toBe(3)
  })
})
