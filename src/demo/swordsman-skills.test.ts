import { it, expect } from 'vitest'
import { SAMURAI_JOB } from './player-job'
import { simulate, printResult, skill } from './dps-sim'

it('Samurai DPS — Setsu→Getsu→Ka→Midare cycle', () => {
  const job = SAMURAI_JOB
  const result = simulate(job, {
    gcdCycle: [
      skill(job, 'sam_setsu'),
      skill(job, 'sam_getsu'),
      skill(job, 'sam_ka'),
      skill(job, 'sam_midare'),
    ],
  })
  printResult('Samurai', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})
