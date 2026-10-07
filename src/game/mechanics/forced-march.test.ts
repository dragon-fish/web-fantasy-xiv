import { marchStep } from './forced-march'

describe('marchStep', () => {
  it('walks along the compass direction (0 = north/+Y, 90 = east/+X)', () => {
    const n = marchStep(0, 5, 1000)
    expect(n.dx).toBeCloseTo(0); expect(n.dy).toBeCloseTo(5)
    const e = marchStep(90, 5, 500)
    expect(e.dx).toBeCloseTo(2.5); expect(e.dy).toBeCloseTo(0)
  })
})
