// src/tower/pools/encounter-pool.ts
//
// Encounter pool resolver.
// - Registry: all entries in manifest (including deprecated) — existing-save references
// - Active Pool: !deprecated entries — new-run rng picks from here
// - Fallback: resolveEncounter returns FALLBACK_ENCOUNTER_ID entry on miss + console.error
//
// 详见 docs/tower-engineering-principles.md §2 Pool Registry / Active Pool 分离。

import { createRng } from '@/tower/random'

export interface EncounterPoolEntry {
  id: string
  yamlPath: string
  kind: 'mob' | 'elite' | 'boss'
  scoutSummary: string
  rewards: { crystals: number }
  /** ISO date string or sentinel ('never-in-pool' for fallback entries). Non-undefined = excluded from Active Pool. */
  deprecated?: string
}

interface EncounterPoolManifest {
  manifestVersion: number
  entries: EncounterPoolEntry[]
}

export const FALLBACK_ENCOUNTER_ID = 'mob-fallback'
const MANIFEST_URL = `${import.meta.env.BASE_URL}tower/pools/encounter-pool.json`

let poolCache: EncounterPoolManifest | null = null
let inflight: Promise<EncounterPoolManifest> | null = null

/** Test-only: reset module-level cache. */
export function _resetEncounterPoolCache(): void {
  poolCache = null
  inflight = null
}

export async function loadEncounterPool(): Promise<EncounterPoolManifest> {
  if (poolCache) return poolCache
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch(MANIFEST_URL)
    if (!res.ok) {
      throw new Error(`[encounter-pool] manifest fetch failed: ${res.status}`)
    }
    const manifest = (await res.json()) as EncounterPoolManifest
    poolCache = manifest
    inflight = null
    return manifest
  })()
  return inflight
}

/**
 * Resolve an encounter id to its manifest entry. Walks the full Registry
 * (including deprecated entries). Falls back to FALLBACK_ENCOUNTER_ID
 * + console.error when id is missing.
 *
 * Normal operation (per append-only contract) should never hit the fallback;
 * only triggered by misconfiguration (deleted YAML / manifest entry).
 */
export async function resolveEncounter(id: string): Promise<EncounterPoolEntry> {
  const manifest = await loadEncounterPool()
  const found = manifest.entries.find((e) => e.id === id)
  if (found) return found
  console.error(
    `[encounter-pool] resolveEncounter('${id}') miss — Registry contract violated. ` +
      `Falling back to '${FALLBACK_ENCOUNTER_ID}'. Check manifest entry not deleted.`,
  )
  const fallback = manifest.entries.find((e) => e.id === FALLBACK_ENCOUNTER_ID)
  if (!fallback) {
    throw new Error(
      `[encounter-pool] FALLBACK entry '${FALLBACK_ENCOUNTER_ID}' missing from manifest — ` +
        `this is a hard project invariant violation.`,
    )
  }
  return fallback
}

/**
 * Pick an encounter id from Active Pool (!deprecated) deterministically by seed.
 * Used at startDescent() to crystallize encounterId into each battle node.
 */
export async function pickEncounterIdFromActivePool(
  seed: string,
  nodeId: number,
  kind: 'mob' | 'elite' | 'boss',
): Promise<string> {
  const manifest = await loadEncounterPool()
  const active = manifest.entries.filter((e) => !e.deprecated && e.kind === kind)
  if (active.length === 0) {
    throw new Error(
      `[encounter-pool] active pool for kind='${kind}' is empty — check manifest`,
    )
  }
  const rng = createRng(`${seed}::encounter::${nodeId}`)
  const idx = Math.floor(rng() * active.length)
  return active[idx].id
}
