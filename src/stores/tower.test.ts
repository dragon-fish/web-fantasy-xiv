// src/stores/tower.test.ts
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useTowerStore } from '@/stores/tower'
import * as persistence from '@/tower/persistence'
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'

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
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
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

  it('continueLastRun does not trigger a redundant save after load', async () => {
    // Seed IndexedDB with a run first
    await persistence.saveTowerRun({
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
      runId: 'no-redundant-save',
      seed: 'seed',
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
    const spy = vi.spyOn(persistence, 'saveTowerRun')
    await store.continueLastRun()
    // Let Vue's flush:post watchers fire
    await nextTick()
    await nextTick()
    // The 'no-run' → 'in-path' transition caused by load must NOT trigger
    // a write-back — suppressPersist should cover the whole flush cycle.
    expect(spy).not.toHaveBeenCalled()
  })

  it('hydrate() updates savedRunExists from IndexedDB', async () => {
    await persistence.saveTowerRun({
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
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

  // ------------------------------------------------------------
  // Phase 2: startDescent
  // ------------------------------------------------------------
  describe('startDescent', () => {
    it('generates graph and transitions to in-path when in selecting-job', () => {
      const store = useTowerStore()
      store.startNewRun('swordsman', 'descent-seed-1')
      expect(store.phase).toBe('selecting-job')
      store.startDescent()
      expect(store.phase).toBe('in-path')
      expect(Object.keys(store.run!.towerGraph.nodes).length).toBeGreaterThan(0)
      expect(store.run!.currentNodeId).toBe(store.run!.towerGraph.startNodeId)
    })

    it('is deterministic: two runs with same seed produce equal graphs', () => {
      setActivePinia(createPinia())
      const a = useTowerStore()
      a.startNewRun('swordsman', 'equal-seed')
      a.startDescent()
      const graphA = a.run!.towerGraph

      setActivePinia(createPinia())
      const b = useTowerStore()
      b.startNewRun('archer', 'equal-seed') // 不同 job, 同 seed
      b.startDescent()
      const graphB = b.run!.towerGraph

      expect(graphA).toEqual(graphB)
    })

    it('no-op + warn when called without active run', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startDescent()
      expect(store.phase).toBe('no-run')
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn when called in wrong phase', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman')
      store.setPhase('in-path')
      store.startDescent()
      expect(warn).toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------
  // Phase 2: advanceTo
  // ------------------------------------------------------------
  describe('advanceTo', () => {
    it('advances currentNodeId to a legal next node and marks prev completed', () => {
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-1')
      store.startDescent()
      const start = store.run!.towerGraph.nodes[store.run!.currentNodeId]
      const legalNext = start.next[0]
      store.advanceTo(legalNext)
      expect(store.run!.currentNodeId).toBe(legalNext)
      expect(store.run!.completedNodes).toContain(start.id)
    })

    it('no-op + warn on illegal next node id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-2')
      store.startDescent()
      const prevId = store.run!.currentNodeId
      store.advanceTo(99999) // 不在 next 列表中
      expect(store.run!.currentNodeId).toBe(prevId)
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn without active run', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.advanceTo(0)
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn in wrong phase', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman')
      // phase 此时 = 'selecting-job'
      store.advanceTo(0)
      expect(warn).toHaveBeenCalled()
    })

    it('triggers a persistence save', async () => {
      const spy = vi.spyOn(persistence, 'saveTowerRun')
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-3')
      store.startDescent()
      spy.mockClear() // 清掉 phase 变更引发的 save
      const start = store.run!.towerGraph.nodes[store.run!.currentNodeId]
      const legalNext = start.next[0]
      store.advanceTo(legalNext)
      expect(spy).toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------
  // Phase 2: schema version check + schemaResetNotice
  // ------------------------------------------------------------
  describe('schema version', () => {
    it('continueLastRun resets run + sets notice when schemaVersion mismatches', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // Save an "old" run with schemaVersion 0
      await persistence.saveTowerRun({
        schemaVersion: 0, // 不等于 TOWER_RUN_SCHEMA_VERSION (=1)
        runId: 'old-run',
        seed: 'x',
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
      await store.continueLastRun()
      expect(store.phase).toBe('no-run')
      expect(store.run).toBeNull()
      expect(store.schemaResetNotice).toBe(true)
      expect(warn).toHaveBeenCalled()
    })

    it('continueLastRun hydrates normally when schemaVersion matches', async () => {
      await persistence.saveTowerRun({
        schemaVersion: TOWER_RUN_SCHEMA_VERSION,
        runId: 'current-run',
        seed: 'x',
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
      await store.continueLastRun()
      expect(store.phase).toBe('in-path')
      expect(store.run?.runId).toBe('current-run')
      expect(store.schemaResetNotice).toBe(false)
    })

    it('dismissSchemaNotice clears the notice flag', () => {
      const store = useTowerStore()
      // Manually raise notice by direct ref access is not possible; use continueLastRun path
      // or a simpler approach: just call dismiss after it's set.
      // Here we rely on the previous test's state semantics, so we set it manually:
      ;(store as unknown as { schemaResetNotice: { value: boolean } })
        // ignore; test pattern below is cleaner
      store.schemaResetNotice = true // Pinia setup stores expose refs as writable
      expect(store.schemaResetNotice).toBe(true)
      store.dismissSchemaNotice()
      expect(store.schemaResetNotice).toBe(false)
    })

    it('startNewRun clears schemaResetNotice', () => {
      const store = useTowerStore()
      // simulate notice being set
      store.schemaResetNotice = true
      expect(store.schemaResetNotice).toBe(true)
      store.startNewRun('swordsman')
      expect(store.schemaResetNotice).toBe(false)
    })
  })
})
