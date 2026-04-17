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
import { ref, computed, watch, toRaw, nextTick, type Ref } from 'vue'
import type { TowerRun, TowerRunPhase, BaseJobId } from '@/tower/types'
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'
import { saveTowerRun, loadTowerRun, clearTowerRun } from '@/tower/persistence'
import { generateTowerGraph } from '@/tower/graph/generator'

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
    schemaVersion: TOWER_RUN_SCHEMA_VERSION,
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

  /**
   * Ephemeral flag; set when loaded run's schemaVersion mismatches the current
   * constant. Consumed by UI (Task 16) to show a dismissable banner. Not persisted.
   */
  const schemaResetNotice = ref(false)

  /**
   * Flag to suppress persistence writes triggered by continueLastRun loading
   * state back from IndexedDB. Set before loading to prevent write-back; cleared
   * after nextTick() to allow persistence for subsequent phase changes. Avoids
   * redundant save cycles on load.
   */
  let suppressPersist = false

  // ---- derived ----
  // NOTE: Phase 3 contract surface — consumed by the job-selection flow.
  // Exported now so pages/composables can bind without further store churn.
  const currentBaseJobId = computed(() => run.value?.baseJobId ?? null)

  // ---- actions ----
  function startNewRun(baseJobId: BaseJobId, seed?: string): void {
    run.value = createInitialRun(baseJobId, seed ?? generateSeed())
    phase.value = 'ready-to-descend'
    savedRunExists.value = true
    schemaResetNotice.value = false // 开新局时清掉遗留横条
  }

  async function continueLastRun(): Promise<void> {
    const loaded = await loadTowerRun()
    if (!loaded) return
    if (loaded.schemaVersion !== TOWER_RUN_SCHEMA_VERSION) {
      // TODO(post-MVP): 金币系统上线后，在此处调 forcedSettlement(loaded)
      // 按 loaded.crystals / loaded.level / loaded.currentNodeId 给出补偿金币
      // 参见 spec §3.6 / §12 "强制结算补偿金币"
      console.warn(
        `[tower] saved run schemaVersion ${loaded.schemaVersion} ` +
          `!= current ${TOWER_RUN_SCHEMA_VERSION}, resetting`,
      )
      resetRun()
      schemaResetNotice.value = true
      return
    }
    suppressPersist = true
    run.value = loaded
    // Infer phase from run state: empty graph.nodes → ready-to-descend; otherwise in-path
    const nodesCount = Object.keys(loaded.towerGraph.nodes).length
    phase.value = nodesCount === 0 ? 'ready-to-descend' : 'in-path'
    savedRunExists.value = true
    // Restore persistence after Vue's flush cycle so the phase watch doesn't
    // fire a spurious save for the load itself. nextTick() waits for all
    // pending post-flush watchers (including our persistence hook) to run.
    await nextTick()
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

  function startDescent(): void {
    if (!run.value) {
      console.warn('[tower] startDescent called without active run')
      return
    }
    if (phase.value !== 'ready-to-descend') {
      console.warn(`[tower] startDescent called in wrong phase: ${phase.value}`)
      return
    }
    const graph = generateTowerGraph(run.value.seed)
    run.value.towerGraph = graph
    run.value.currentNodeId = graph.startNodeId
    phase.value = 'in-path'
  }

  function advanceTo(nodeId: number): void {
    if (!run.value) {
      console.warn('[tower] advanceTo called without active run')
      return
    }
    if (phase.value !== 'in-path') {
      console.warn(`[tower] advanceTo called in wrong phase: ${phase.value}`)
      return
    }
    const current = run.value.towerGraph.nodes[run.value.currentNodeId]
    if (!current) {
      console.warn(
        `[tower] advanceTo: currentNodeId ${run.value.currentNodeId} not in graph`,
      )
      return
    }
    if (!current.next.includes(nodeId)) {
      console.warn(
        `[tower] advanceTo: illegal move ${run.value.currentNodeId} -> ${nodeId}`,
      )
      return
    }
    if (!run.value.completedNodes.includes(current.id)) {
      run.value.completedNodes.push(current.id)
    }
    run.value.currentNodeId = nodeId
    // advanceTo 不改 phase，不会触发 watchPhaseForPersistence；
    // 手动 fire-and-forget 写盘，失败不回滚
    void saveTowerRun(toRaw(run.value))
  }

  function enterJobPicker(): void {
    if (run.value !== null) {
      console.warn('[tower] enterJobPicker called while run exists; ignoring')
      return
    }
    phase.value = 'selecting-job'
  }

  function dismissSchemaNotice(): void {
    schemaResetNotice.value = false
  }

  async function hydrate(): Promise<void> {
    suppressPersist = true
    const loaded = await loadTowerRun()
    savedRunExists.value = loaded !== null
    // Always land on the no-run UI when entering /tower — the save-aware branch
    // will show the save summary if one exists. Resetting here prevents stale
    // in-path phase from a prior session bypassing the summary screen.
    phase.value = 'no-run'
    if (loaded && loaded.schemaVersion === TOWER_RUN_SCHEMA_VERSION) {
      run.value = loaded
    }
    await nextTick()
    suppressPersist = false
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
    startDescent,
    advanceTo,
    enterJobPicker,
    schemaResetNotice,
    dismissSchemaNotice,
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
