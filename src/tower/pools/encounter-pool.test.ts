// src/tower/pools/encounter-pool.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadEncounterPool,
  resolveEncounter,
  pickEncounterIdFromActivePool,
  _resetEncounterPoolCache,
  FALLBACK_ENCOUNTER_ID,
  type EncounterPoolEntry,
} from './encounter-pool'

const mockManifest = {
  manifestVersion: 1,
  entries: [
    { id: 'mob-a', yamlPath: 'encounters/tower/mob-a.yaml', kind: 'mob', scoutSummary: 'A', rewards: { crystals: 10 } },
    { id: 'mob-b', yamlPath: 'encounters/tower/mob-b.yaml', kind: 'mob', scoutSummary: 'B', rewards: { crystals: 10 } },
    { id: 'mob-c', yamlPath: 'encounters/tower/mob-c.yaml', kind: 'mob', scoutSummary: 'C', rewards: { crystals: 10 } },
    { id: 'mob-retired', yamlPath: 'encounters/tower/archive/mob-retired.yaml', kind: 'mob', scoutSummary: 'R', rewards: { crystals: 5 }, deprecated: '2026-05-01' },
    { id: 'mob-fallback', yamlPath: 'encounters/tower/mob-fallback.yaml', kind: 'mob', scoutSummary: 'fallback', rewards: { crystals: 10 }, deprecated: 'never-in-pool' },
  ] satisfies EncounterPoolEntry[],
}

beforeEach(() => {
  _resetEncounterPoolCache()
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockManifest,
  }) as any
})

describe('encounter-pool', () => {
  it('loadEncounterPool fetches and caches manifest', async () => {
    const first = await loadEncounterPool()
    const second = await loadEncounterPool()
    expect(first).toBe(second)
    expect((globalThis.fetch as any).mock.calls.length).toBe(1)
  })

  it('resolveEncounter returns found entry for live id', async () => {
    const entry = await resolveEncounter('mob-a')
    expect(entry.id).toBe('mob-a')
    expect(entry.scoutSummary).toBe('A')
  })

  it('resolveEncounter returns found entry for deprecated id (Registry walk)', async () => {
    const entry = await resolveEncounter('mob-retired')
    expect(entry.id).toBe('mob-retired')
    expect(entry.deprecated).toBe('2026-05-01')
  })

  it('resolveEncounter falls back to mob-fallback when id missing, and logs error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entry = await resolveEncounter('mob-nonexistent')
    expect(entry.id).toBe(FALLBACK_ENCOUNTER_ID)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('pickEncounterIdFromActivePool excludes deprecated entries', async () => {
    const picked = new Set<string>()
    for (let nodeId = 0; nodeId < 100; nodeId++) {
      const id = await pickEncounterIdFromActivePool('seed-1', nodeId, 'mob')
      picked.add(id)
    }
    expect(picked.has('mob-retired')).toBe(false)
    expect(picked.has('mob-fallback')).toBe(false)
    expect(picked.has('mob-a')).toBe(true)
  })

  it('pickEncounterIdFromActivePool is deterministic for same (seed, nodeId)', async () => {
    const a = await pickEncounterIdFromActivePool('seed-X', 42, 'mob')
    const b = await pickEncounterIdFromActivePool('seed-X', 42, 'mob')
    expect(a).toBe(b)
  })

  it('pickEncounterIdFromActivePool varies by nodeId', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      ids.add(await pickEncounterIdFromActivePool('seed-vary', i, 'mob'))
    }
    expect(ids.size).toBeGreaterThan(1)
  })

  it('pickEncounterIdFromActivePool throws when kind has no active entries', async () => {
    await expect(pickEncounterIdFromActivePool('seed-1', 0, 'boss')).rejects.toThrow(/active pool/i)
  })
})
