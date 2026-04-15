import { it, expect } from 'vitest'
import { DEFAULT_JOB } from './player-job'
import { simulate, printResult, skill } from './dps-sim'

it('Warrior DPS — Embolden on CD + spam Slash', () => {
  const job = DEFAULT_JOB
  const result = simulate(job, {
    gcdCycle: [skill(job, 'slash')],
    ogcds: [{ skill: skill(job, 'embolden') }],
  })
  printResult('Warrior', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})
