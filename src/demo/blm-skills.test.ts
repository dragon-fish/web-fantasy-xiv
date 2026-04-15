import { it, expect } from 'vitest'
import { BLM_JOB } from './player-job'
import { simulate, printResult, skill } from './dps-sim'

it('Black Mage DPS — Ice×3 → Fire×7 cycle + Flare at 50 Enochian', () => {
  const job = BLM_JOB
  const result = simulate(job, {
    gcdCycle: [
      // Ice phase: 1 instant (consumes AF) + 2 cast, all restore MP + gain UI
      skill(job, 'blm_ice'),
      skill(job, 'blm_ice'),
      skill(job, 'blm_ice'),
      // Fire phase: 3 free (consume UI) + 4 paid, all gain AF
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
      skill(job, 'blm_fire'),
    ],
    ogcds: [
      { skill: skill(job, 'blm_flare'), whenStacks: { buffId: 'blm_enochian', stacks: 50 } },
    ],
  })
  printResult('Black Mage', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})
