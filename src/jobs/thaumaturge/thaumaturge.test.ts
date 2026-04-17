import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill } from '../sim-test-utils'
import { THAUMATURGE_JOB } from './index'

describe('Thaumaturge DPM', () => {
  const job = THAUMATURGE_JOB
  const stone = skill(job, 'thm_stone')
  const swiftcast = skill(job, 'thm_swiftcast')

  it('stone spam + swiftcast — DPM in 0.80-0.92× baseline', () => {
    const result = simulate(job, {
      gcdCycle: [stone],
      ogcds: [{ skill: swiftcast }],
    })
    printResult('Thaumaturge (stone spam + swiftcast)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.80-0.92× = 43520-50048
    expect(totalOver60s).toBeGreaterThan(42000)
    expect(totalOver60s).toBeLessThan(52000)
  })
})

describe('Swiftcast and Lucid Dreaming buff defs', () => {
  it('thm_swiftcast_ready: next_cast_instant consumeOnCast=true, duration 10s', () => {
    const def = THAUMATURGE_JOB.buffs.thm_swiftcast_ready
    expect(def.duration).toBe(10000)
    expect(def.effects).toEqual([{ type: 'next_cast_instant', consumeOnCast: true }])
  })

  it('lucid_dreaming (from COMMON_BUFFS): mp_regen 0.05 / interval 3000 / 21s', () => {
    const def = THAUMATURGE_JOB.buffs.lucid_dreaming
    expect(def.duration).toBe(21000)
    expect(def.effects).toEqual([{ type: 'mp_regen', potency: 0.05, interval: 3000 }])
  })
})
