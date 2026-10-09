import { DamageDirector, npcBaseline, defaultTargetTime, BUDGET_CEILING, BUDGET_FLOOR, NPC_PARTY_OUTPUT } from './damage-director'

const P = 1000

describe('DamageDirector', () => {
  it('baseline: the NPCs make up the rest of a 30%-slower ordinary party', () => {
    expect(npcBaseline('dps', P)).toBeCloseTo((3.2 / 1.3 - 1) * P)
    expect(npcBaseline('healer', P)).toBeCloseTo((3.2 / 1.3 - 0.5) * P)
  })

  it('an ordinary player on the default target time keeps the NPCs at baseline', () => {
    const bossHp = 600000
    const target = defaultTargetTime(bossHp, P)
    const d = new DamageDirector('dps', target, P)
    // 60s in, the boss lost exactly the ordinary party's output
    const elapsed = 60000
    for (let t = 0; t < elapsed; t += 1000) d.recordPlayerDamage(t, P)
    d.recompute(elapsed, bossHp - NPC_PARTY_OUTPUT * P * 60)
    expect(d.teamDps()).toBeCloseTo(d.baseline, -1)
  })

  it('a weak player gets carried up to the ceiling, a strong one is held down to the floor', () => {
    const weak = new DamageDirector('dps', 300000, P)
    for (let i = 0; i < 20; i++) weak.recompute(30000, 500000)
    expect(weak.teamDps()).toBeCloseTo(BUDGET_CEILING * weak.baseline)

    const strong = new DamageDirector('dps', 300000, P)
    for (let t = 0; t < 30000; t += 1000) strong.recordPlayerDamage(t, 10 * P)
    for (let i = 0; i < 20; i++) strong.recompute(30000, 100000)
    expect(strong.teamDps()).toBeCloseTo(BUDGET_FLOOR * strong.baseline)
  })

  it('moves towards its goal a bounded step at a time', () => {
    const d = new DamageDirector('dps', 300000, P)
    d.recompute(30000, 1e9)
    expect(d.teamDps()).toBeCloseTo(1.15 * d.baseline)
  })

  it('splits the budget by role weight', () => {
    const d = new DamageDirector('dps', 300000, P)
    const roles = ['tank', 'healer', 'dps'] as const
    const shares = roles.map(r => d.shareOf(r, [...roles]))
    expect(shares[2]! / shares[0]!).toBeCloseTo(1 / 0.7)
    expect(shares.reduce((a, b) => a + b)).toBeCloseTo(d.teamDps())
  })
})
