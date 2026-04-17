// src/stores/tower.ts
//
// Tower mode runtime state center.
// - state: TowerRun (or null) + phase discriminator.
// - actions: startNewRun / continueLastRun / resetRun / setPhase / hydrate.
// - persistence: saveTowerRun is called on phase change via Vue watch.
//
// **Phase 1 only**: no graph generation or combat logic. All graph/combat
// related calls are deferred to Phase 2+.
import { defineStore } from 'pinia'
import { ref, computed, watch, toRaw, type Ref } from 'vue'
import type { TowerRun, TowerRunPhase, BaseJobId } from '@/tower/types'
import { saveTowerRun, loadTowerRun, clearTowerRun } from '@/tower/persistence'

/**
 * Generate a run id. Uses crypto.randomUUID when available; falls back to
 * timestamp + random string.
 */
function generateRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * Generate a default seed. Independent from runId to allow fixed-seed runs
 * in the future without changing runId generation.
 */
function generateSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `seed-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * Build the initial TowerRun state for a fresh run.
 * Phase 1: towerGraph is an empty placeholder; Phase 2 will populate it.
 */
function createInitialRun(baseJobId: BaseJobId, seed: string): TowerRun {
  return {
    runId: generateRunId(),
    seed,
    graphSource: { kind: 'random' },
    startedAt: Date.now(),
    baseJobId,
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
  }
}

export const useTowerStore = defineStore('tower', () => {
  // ---- state ----
  const phase = ref<TowerRunPhase>('no-run')
  const run = ref<TowerRun | null>(null)
  const savedRunExists = ref(false)

  // Flag to suppress persistence writes triggered by continueLastRun loading
  // state back from IndexedDB (avoids a redundant write-back cycle).
  let suppressPersist = false

  // ---- derived ----
  const currentBaseJobId = computed(() => run.value?.baseJobId ?? null)

  // ---- actions ----
  function startNewRun(baseJobId: BaseJobId, seed?: string): void {
    run.value = createInitialRun(baseJobId, seed ?? generateSeed())
    phase.value = 'selecting-job'
    savedRunExists.value = true
  }

  async function continueLastRun(): Promise<void> {
    const loaded = await loadTowerRun()
    if (!loaded) return
    suppressPersist = true
    run.value = loaded
    phase.value = 'in-path'
    savedRunExists.value = true
    // Restore persistence after Vue's flush cycle so the phase watch doesn't
    // fire a spurious save for the load itself.
    await Promise.resolve()
    suppressPersist = false
  }

  function resetRun(): void {
    run.value = null
    phase.value = 'no-run'
    savedRunExists.value = false
    // fire-and-forget; a failed clear does not block state transition
    void clearTowerRun()
  }

  function setPhase(next: TowerRunPhase): void {
    phase.value = next
  }

  async function hydrate(): Promise<void> {
    const loaded = await loadTowerRun()
    savedRunExists.value = loaded !== null
  }

  // ---- persistence hook ----
  // Persist to IndexedDB whenever phase changes.
  // We use Vue's watch instead of Pinia's $subscribe because $subscribe is not
  // available during the setup store's setup function execution — the store
  // instance doesn't exist yet when we need to install the hook.
  let lastPersistedPhase: TowerRunPhase = phase.value

  function maybePersist(): void {
    if (suppressPersist) return
    if (phase.value === lastPersistedPhase) return
    lastPersistedPhase = phase.value
    if (run.value) {
      // Strip Vue reactive Proxy wrappers before passing to IndexedDB —
      // structuredClone (used by fake-indexeddb and real IDB) cannot clone Proxy
      // objects. toRaw recursively unwraps all reactive wrappers.
      void saveTowerRun(toRaw(run.value))
    }
  }

  watchPhaseForPersistence(phase, maybePersist)

  return {
    phase,
    run,
    savedRunExists,
    currentBaseJobId,
    startNewRun,
    continueLastRun,
    resetRun,
    setPhase,
    hydrate,
  }
})

/**
 * Install a watcher on the phase ref that triggers persistence after Vue's
 * flush cycle. flush: 'post' ensures DOM / reactive effects settle before
 * the write, which keeps persistence timing predictable.
 */
function watchPhaseForPersistence(phaseRef: Ref<TowerRunPhase>, cb: () => void): void {
  watch(phaseRef, () => cb(), { flush: 'post' })
}
