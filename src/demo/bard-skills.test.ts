import { it, expect } from 'vitest'
import { BRD_JOB } from './player-job'
import { simulate, printResult, skill } from './dps-sim'

it('Bard DPS — Straight Shot + song rotation + Pitch Perfect', () => {
  const job = BRD_JOB
  const result = simulate(job, {
    gcdCycle: [skill(job, 'brd_straight_shot')],
    ogcds: [
      // Song rotation: Ballad → Paeon → Minuet, each 60s CD, staggered by 20s
      { skill: skill(job, 'brd_ballad'), startAt: 0 },
      { skill: skill(job, 'brd_paeon'), startAt: 20000 },
      { skill: skill(job, 'brd_minuet'), startAt: 40000 },
      // Pitch Perfect: use whenever stacks available (linear scaling, no DPS loss)
      { skill: skill(job, 'brd_pitch_perfect'), whenStacks: { buffId: 'brd_pitch', stacks: 1 } },
    ],
  })
  printResult('Bard', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})
