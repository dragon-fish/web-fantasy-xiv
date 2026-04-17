// src/tower/graph/constraints.test.ts
import { describe, it, expect } from 'vitest'
import type { TowerNode } from '@/tower/types'
import {
  isStep1AllMob,
  hasConsecutiveElite,
  findConsecutiveEliteEdge,
  hasCampfireAdjacentToStep12,
  hasRewardAdjacentToStep6,
  findPathsWithoutElite,
  allPathsHaveElite,
} from '@/tower/graph/constraints'

/** Build a minimal linear graph for constraint tests. */
function linearGraph(kinds: TowerNode['kind'][]): TowerNode[] {
  return kinds.map((kind, i) => ({
    id: i,
    step: i,
    slot: 0,
    kind,
    next: i < kinds.length - 1 ? [i + 1] : [],
  }))
}

describe('constraint 1: step-1 all mob', () => {
  it('passes when all step-1 nodes are mob', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [] },
    ]
    expect(isStep1AllMob(nodes)).toBe(true)
  })

  it('fails when any step-1 node is not mob', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [] },
    ]
    expect(isStep1AllMob(nodes)).toBe(false)
  })
})

describe('constraint 2: no consecutive elite steps', () => {
  it('passes on a graph without elite', () => {
    const nodes = linearGraph(['start', 'mob', 'mob', 'mob', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(false)
  })

  it('passes on isolated elite', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'mob', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(false)
  })

  it('fails on two elite in consecutive steps via edge', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(true)
  })

  it('findConsecutiveEliteEdge returns [from, to] pair', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'boss'])
    const pair = findConsecutiveEliteEdge(nodes)
    expect(pair).not.toBeNull()
    expect(pair![0].kind).toBe('elite')
    expect(pair![1].kind).toBe('elite')
    expect(pair![1].step).toBe(pair![0].step + 1)
  })
})

describe('constraint 3: campfire not at step 11', () => {
  it('passes when no step-11 node is campfire', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 11, slot: 0, kind: 'mob', next: [1] },
      { id: 1, step: 12, slot: 0, kind: 'campfire', next: [] },
    ]
    expect(hasCampfireAdjacentToStep12(nodes)).toBe(false)
  })

  it('fails when step-11 node is campfire', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 11, slot: 0, kind: 'campfire', next: [1] },
      { id: 1, step: 12, slot: 0, kind: 'campfire', next: [] },
    ]
    expect(hasCampfireAdjacentToStep12(nodes)).toBe(true)
  })
})

describe('constraint 4: reward not at step 5 or 7', () => {
  it('passes when step 5 and 7 have no reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 5, slot: 0, kind: 'mob', next: [1] },
      { id: 1, step: 6, slot: 0, kind: 'reward', next: [2] },
      { id: 2, step: 7, slot: 0, kind: 'mob', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(false)
  })

  it('fails when step 5 has reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 5, slot: 0, kind: 'reward', next: [1] },
      { id: 1, step: 6, slot: 0, kind: 'reward', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(true)
  })

  it('fails when step 7 has reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 6, slot: 0, kind: 'reward', next: [1] },
      { id: 1, step: 7, slot: 0, kind: 'reward', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(true)
  })
})

describe('constraint 5: every path has at least 1 elite', () => {
  it('passes on a graph where all paths contain elite', () => {
    // Two paths: 0 → 1 → 3 and 0 → 2 → 3; both must include elite.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'elite', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    expect(findPathsWithoutElite(nodes, 0, 3)).toEqual([])
    expect(allPathsHaveElite(nodes, 0, 3)).toBe(true)
  })

  it('fails on a graph where some path lacks elite', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'elite', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    const missing = findPathsWithoutElite(nodes, 0, 3)
    expect(missing.length).toBe(1)
    expect(missing[0]).toEqual([0, 2, 3])
    expect(allPathsHaveElite(nodes, 0, 3)).toBe(false)
  })
})
