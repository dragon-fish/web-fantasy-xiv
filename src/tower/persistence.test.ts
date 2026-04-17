// src/tower/persistence.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { saveTowerRun, loadTowerRun, clearTowerRun } from '@/tower/persistence'
import type { TowerRun } from '@/tower/types'

function makeRun(overrides: Partial<TowerRun> = {}): TowerRun {
  return {
    runId: 'test-run-1',
    seed: 'abc',
    graphSource: { kind: 'random' },
    startedAt: 1_700_000_000_000,
    baseJobId: 'swordsman',
    towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
    currentNodeId: 0,
    determination: 5,
    maxDetermination: 5,
    level: 1,
    crystals: 0,
    currentWeapon: null,
    advancedJobId: null,
    materia: [],
    activatedMateria: [],
    relics: [],
    scoutedNodes: {},
    completedNodes: [],
    ...overrides,
  }
}

describe('persistence', () => {
  beforeEach(async () => {
    await clearTowerRun()
  })

  it('loadTowerRun returns null when no run saved', async () => {
    expect(await loadTowerRun()).toBeNull()
  })

  it('save + load roundtrips a TowerRun object', async () => {
    const run = makeRun({ crystals: 42, level: 7 })
    await saveTowerRun(run)
    const loaded = await loadTowerRun()
    expect(loaded).toEqual(run)
  })

  it('save overwrites previous run', async () => {
    await saveTowerRun(makeRun({ crystals: 10 }))
    await saveTowerRun(makeRun({ crystals: 99 }))
    const loaded = await loadTowerRun()
    expect(loaded?.crystals).toBe(99)
  })

  it('clearTowerRun removes the persisted run', async () => {
    await saveTowerRun(makeRun())
    await clearTowerRun()
    expect(await loadTowerRun()).toBeNull()
  })
})
