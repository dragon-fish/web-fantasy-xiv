import { describe, expect, it } from 'vitest'
import { COMMON_BUFFS } from './buffs'

describe('COMMON_BUFFS.echo', () => {
  const echo = COMMON_BUFFS.echo

  it('has preserveOnDeath: true', () => {
    expect(echo.preserveOnDeath).toBe(true)
  })

  it('has three effect types in expected order', () => {
    expect(echo.effects.map(e => e.type)).toEqual([
      'attack_modifier', 'mitigation', 'max_hp_modifier',
    ])
    expect(echo.effects.every(e => (e as any).value === 0.25)).toBe(true)
  })

  it('is permanent (tied to scene lifetime)', () => {
    expect(echo.duration).toBe(Infinity)
  })

  it('id = "echo"', () => {
    expect(echo.id).toBe('echo')
  })
})
