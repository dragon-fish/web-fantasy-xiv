import { it, expect } from 'vitest'
import { DRK_JOB } from './player-job'
import { simulate, printResult, skill } from './dps-sim'

it('Dark Knight DPS — spam Shadow Bolt + Dark Mind on CD', () => {
  const job = DRK_JOB
  const result = simulate(job, {
    gcdCycle: [skill(job, 'drk_shadow_bolt')],
    ogcds: [
      { skill: skill(job, 'drk_dark_mind') },
    ],
  })
  printResult('Dark Knight', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})
