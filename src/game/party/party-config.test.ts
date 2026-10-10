import { mistakeRateFor } from './party-config'

describe('mistakeRateFor', () => {
  it('tanks and healers fumble mechanics less often than DPS', () => {
    const config = { mistakeRate: 0.03 }
    expect(mistakeRateFor(config, 'dps')).toBe(0.03)
    expect(mistakeRateFor(config, 'tank')).toBeLessThan(0.03)
    expect(mistakeRateFor(config, 'healer')).toBeLessThan(0.03)
  })
})
