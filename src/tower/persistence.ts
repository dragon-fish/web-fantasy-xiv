// src/tower/persistence.ts
//
// IndexedDB persistence (spec §7.4).
// Wraps localspace (a modern localforage alternative).
// Phase 1: stores only the current run — single key 'current-run'.
import localspace from 'localspace'
import type { TowerRun } from './types'

// Isolated IndexedDB instance to avoid polluting other app storage.
const store = localspace.createInstance({
  name: 'xiv-tower',
  storeName: 'tower-runs',
})

const CURRENT_RUN_KEY = 'current-run'

/** Persist the current TowerRun. Overwrites any existing entry. */
export async function saveTowerRun(run: TowerRun): Promise<void> {
  await store.setItem(CURRENT_RUN_KEY, run)
}

/** Load the current TowerRun. Returns null if no run is saved. */
export async function loadTowerRun(): Promise<TowerRun | null> {
  const raw = await store.getItem<TowerRun>(CURRENT_RUN_KEY)
  return raw ?? null
}

/** Remove the current TowerRun. Irreversible. */
export async function clearTowerRun(): Promise<void> {
  await store.removeItem(CURRENT_RUN_KEY)
}
