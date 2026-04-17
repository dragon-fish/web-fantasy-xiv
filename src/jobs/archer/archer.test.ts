import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill } from '../sim-test-utils'
import { ARCHER_JOB } from './index'

describe('Archer DPM', () => {
  const job = ARCHER_JOB
  const heavyShot = skill(job, 'arc_heavy_shot')
  const venomShot = skill(job, 'arc_venom_shot')
  const barrage = skill(job, 'arc_barrage')

  it('correct rotation: heavy shot + 18s venom + barrage — DPM in 0.78-0.88× baseline', () => {
    // cycle: 6 heavy + 1 venom = 7 GCDs ≈ 17.5s
    const result = simulate(job, {
      gcdCycle: [heavyShot, heavyShot, heavyShot, heavyShot, heavyShot, heavyShot, venomShot],
      ogcds: [{ skill: barrage }],
    })
    printResult('Archer (correct rotation)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.78-0.88× = 42432-47872
    expect(totalOver60s).toBeGreaterThan(41000)
    expect(totalOver60s).toBeLessThan(49000)
  })
})

describe('Venom and Barrage buff defs', () => {
  it('arc_venom: dot potency 0.3 / interval 3000 / duration 18000', () => {
    const def = ARCHER_JOB.buffs.arc_venom
    expect(def.duration).toBe(18000)
    expect(def.type).toBe('debuff')
    expect(def.effects).toEqual([{ type: 'dot', potency: 0.3, interval: 3000 }])
  })

  it('arc_barrage: damage_increase 0.30 / duration 6000', () => {
    const def = ARCHER_JOB.buffs.arc_barrage
    expect(def.duration).toBe(6000)
    expect(def.type).toBe('buff')
    expect(def.effects).toEqual([{ type: 'damage_increase', value: 0.30 }])
  })
})
