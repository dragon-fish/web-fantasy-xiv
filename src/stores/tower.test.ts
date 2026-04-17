// src/stores/tower.test.ts
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTowerStore } from '@/stores/tower'
import * as persistence from '@/tower/persistence'

describe('useTowerStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await persistence.clearTowerRun()
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await persistence.clearTowerRun()
  })

  it('initial phase is "no-run"', () => {
    const store = useTowerStore()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('savedRunExists starts false', () => {
    const store = useTowerStore()
    expect(store.savedRunExists).toBe(false)
  })

  it('startNewRun mutates phase to "selecting-job" and creates a run', () => {
    const store = useTowerStore()
    store.startNewRun('swordsman', 'seed-xyz')
    expect(store.phase).toBe('selecting-job')
    expect(store.run).not.toBeNull()
    expect(store.run?.baseJobId).toBe('swordsman')
    expect(store.run?.seed).toBe('seed-xyz')
    expect(store.run?.determination).toBe(5)
    expect(store.run?.maxDetermination).toBe(5)
    expect(store.run?.level).toBe(1)
  })

  it('startNewRun without seed generates a seed string', () => {
    const store = useTowerStore()
    store.startNewRun('archer')
    expect(typeof store.run?.seed).toBe('string')
    expect(store.run?.seed.length).toBeGreaterThan(0)
  })

  it('resetRun clears run and returns phase to "no-run"', () => {
    const store = useTowerStore()
    store.startNewRun('thaumaturge')
    store.resetRun()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('setPhase updates phase discriminator', () => {
    const store = useTowerStore()
    store.startNewRun('swordsman')
    store.setPhase('in-path')
    expect(store.phase).toBe('in-path')
  })

  it('persists run via saveTowerRun when phase changes', async () => {
    // Use vi.mock fallback pattern to handle potential ESM read-only binding issues
    const spy = vi.spyOn(persistence, 'saveTowerRun')
    const store = useTowerStore()
    store.startNewRun('swordsman', 'persist-seed')
    // flush: 'post' means watch fires after Vue's flush cycle — wait for it
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(spy).toHaveBeenCalled()
    const lastCall = spy.mock.calls.at(-1)
    expect(lastCall?.[0].seed).toBe('persist-seed')
  })

  it('resetRun calls clearTowerRun', async () => {
    const spy = vi.spyOn(persistence, 'clearTowerRun')
    const store = useTowerStore()
    store.startNewRun('swordsman')
    store.resetRun()
    expect(spy).toHaveBeenCalled()
  })

  it('continueLastRun loads persisted run and sets phase to "in-path"', async () => {
    // Seed IndexedDB with a run
    await persistence.saveTowerRun({
      runId: 'persisted-run',
      seed: 'old-seed',
      graphSource: { kind: 'random' },
      startedAt: 1_700_000_000_000,
      baseJobId: 'archer',
      towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
      currentNodeId: 3,
      determination: 4,
      maxDetermination: 5,
      level: 5,
      crystals: 42,
      currentWeapon: null,
      advancedJobId: null,
      materia: [],
      activatedMateria: [],
      relics: [],
      scoutedNodes: {},
      completedNodes: [0, 1, 2],
    })
    const store = useTowerStore()
    await store.continueLastRun()
    expect(store.run?.runId).toBe('persisted-run')
    expect(store.run?.crystals).toBe(42)
    expect(store.phase).toBe('in-path')
  })

  it('continueLastRun is a no-op when no saved run exists', async () => {
    const store = useTowerStore()
    await store.continueLastRun()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('hydrate() updates savedRunExists from IndexedDB', async () => {
    await persistence.saveTowerRun({
      runId: 'hydrate-check',
      seed: 's',
      graphSource: { kind: 'random' },
      startedAt: 0,
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
    })
    const store = useTowerStore()
    await store.hydrate()
    expect(store.savedRunExists).toBe(true)
  })
})
