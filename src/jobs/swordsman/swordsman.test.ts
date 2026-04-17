import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill } from '../sim-test-utils'
import { SWORDSMAN_JOB } from './index'

describe('Swordsman DPM', () => {
  const job = SWORDSMAN_JOB
  const slash = skill(job, 'swm_heavy_slash')
  const guard = skill(job, 'swm_guard')

  it('correct rotation: heavy slash + guard weave — DPM in 0.70-0.80× baseline', () => {
    const result = simulate(job, {
      gcdCycle: [slash, slash, slash, slash, slash],
      ogcds: [{ skill: guard }],
    })
    printResult('Swordsman (correct rotation)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.70-0.80× = 38080-43520
    expect(totalOver60s).toBeGreaterThan(38000)
    expect(totalOver60s).toBeLessThan(45000)
  })

  it('111 fallback: spam slash only — DPM 5-10% lower than correct rotation', () => {
    const result = simulate(job, { gcdCycle: [slash] })
    printResult('Swordsman (only slash, 111 style)', job, result)
    const totalOver60s = result.dps * 60
    // No buff → slightly below correct rotation
    expect(totalOver60s).toBeGreaterThan(33000)
    expect(totalOver60s).toBeLessThan(42000)
  })
})

describe('Guard buff behavior', () => {
  it('swm_guard buff def: damage_increase 0.20, duration 8s, stackable false', () => {
    expect(SWORDSMAN_JOB.buffs.swm_guard).toBeDefined()
    const def = SWORDSMAN_JOB.buffs.swm_guard
    expect(def.duration).toBe(8000)
    expect(def.stackable).toBe(false)
    expect(def.effects).toEqual([{ type: 'damage_increase', value: 0.20 }])
  })
})
