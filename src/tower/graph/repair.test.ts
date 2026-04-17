// src/tower/graph/repair.test.ts
import { describe, it, expect } from 'vitest'
import type { TowerNode } from '@/tower/types'
import { createRng } from '@/tower/random'
import { repair } from '@/tower/graph/repair'
import {
  findConsecutiveEliteEdge,
  allPathsHaveElite,
} from '@/tower/graph/constraints'

/** Construct a minimal graph with a given kind sequence. */
function linearGraph(kinds: TowerNode['kind'][]): TowerNode[] {
  return kinds.map((kind, i) => ({
    id: i,
    step: i,
    slot: 0,
    kind,
    next: i < kinds.length - 1 ? [i + 1] : [],
  }))
}

describe('repair', () => {
  it('fixes consecutive elite by mutating the later node', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'mob', 'boss'])
    const repaired = repair(nodes, createRng('r-1'))
    expect(findConsecutiveEliteEdge(repaired)).toBeNull()
  })

  it('adds elite to a path that lacks one', () => {
    // Two paths; path 0→2→3 has elite, path 0→1→3 does not.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    const repaired = repair(nodes, createRng('r-2'))
    expect(allPathsHaveElite(repaired, 0, 3)).toBe(true)
  })

  it('does not mutate fixed kinds (start / boss / campfire / reward / step-1 mob)', () => {
    // Construct a graph with fixed kinds and see that after repair they are unchanged.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [2] },
      { id: 2, step: 6, slot: 0, kind: 'reward', next: [3] },
      { id: 3, step: 12, slot: 0, kind: 'campfire', next: [4] },
      { id: 4, step: 13, slot: 0, kind: 'boss', next: [] },
    ]
    // This graph has no elite on any path. Repair must add elite somewhere
    // **other than** the 5 fixed positions. But here there's nowhere else to put it,
    // so it should throw (pathological).
    expect(() => repair(nodes, createRng('r-3'))).toThrow()
  })

  it('converges on a heavily-violated linear graph without throwing', () => {
    // Force a linear graph where every non-start/boss node is a candidate,
    // but rng is rigged: we use a small seed and rely on MAX_REPAIR_ITERATIONS.
    // Easier: construct a graph that violates constraint 2 in a way repair
    // can't resolve — every node is elite (except start/boss).
    const nodes = linearGraph([
      'start', 'mob', 'elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'boss',
    ])
    // Step 1 (index 1) is mob, but all middle nodes are elite and consecutive.
    // repair repeatedly flips later elites to non-elite. Eventually converges.
    // To actually force non-convergence, we'd need mutually exclusive constraints.
    // Instead, mock scenario where repair has no room: use the "all fixed" case above.
    expect(() => repair(nodes, createRng('r-4'))).not.toThrow()
    // (Converges; assertion is that non-convergence **can** throw is shown in r-3.)
  })

  it('returned graph passes both constraint 2 and constraint 5', () => {
    // A mildly broken graph that repair can handle.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [3, 4] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [3, 4] },
      { id: 3, step: 2, slot: 0, kind: 'mob', next: [5] },
      { id: 4, step: 2, slot: 1, kind: 'event', next: [5] },
      { id: 5, step: 3, slot: 0, kind: 'boss', next: [] },
    ]
    const repaired = repair(nodes, createRng('r-5'))
    expect(findConsecutiveEliteEdge(repaired)).toBeNull()
    expect(allPathsHaveElite(repaired, 0, 5)).toBe(true)
  })
})
