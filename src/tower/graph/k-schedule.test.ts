// src/tower/graph/k-schedule.test.ts
import { describe, it, expect } from 'vitest'
import {
  K_SCHEDULE,
  TOTAL_STEPS,
  TOTAL_NODES,
  BOSS_STEP,
  REWARD_STEP,
  CAMPFIRE_STEP,
  START_STEP,
  MOB_STEP,
} from '@/tower/graph/k-schedule'

describe('K_SCHEDULE', () => {
  it('has exactly 14 entries (step 0 through step 13)', () => {
    expect(K_SCHEDULE.length).toBe(14)
    expect(TOTAL_STEPS).toBe(14)
  })

  it('totals 26 nodes', () => {
    const sum = K_SCHEDULE.reduce((a, b) => a + b, 0)
    expect(sum).toBe(26)
    expect(TOTAL_NODES).toBe(26)
  })

  it('fixed layers have K=1', () => {
    expect(K_SCHEDULE[0]).toBe(1)   // start
    expect(K_SCHEDULE[6]).toBe(1)   // reward
    expect(K_SCHEDULE[12]).toBe(1)  // campfire
    expect(K_SCHEDULE[13]).toBe(1)  // boss
  })

  it('key decision steps (4 and 8) have K=3', () => {
    expect(K_SCHEDULE[4]).toBe(3)
    expect(K_SCHEDULE[8]).toBe(3)
  })

  it('default non-fixed layers have K=2', () => {
    for (const step of [1, 2, 3, 5, 7, 9, 10, 11]) {
      expect(K_SCHEDULE[step]).toBe(2)
    }
  })

  it('exports step-role constants', () => {
    expect(START_STEP).toBe(0)
    expect(MOB_STEP).toBe(1)
    expect(REWARD_STEP).toBe(6)
    expect(CAMPFIRE_STEP).toBe(12)
    expect(BOSS_STEP).toBe(13)
  })
})
