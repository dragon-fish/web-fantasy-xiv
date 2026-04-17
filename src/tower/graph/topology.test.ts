// src/tower/graph/topology.test.ts
import { describe, it, expect } from 'vitest'
import { createRng } from '@/tower/random'
import { buildTopology, type PartialTowerNode } from '@/tower/graph/topology'
import { K_SCHEDULE, TOTAL_NODES, TOTAL_STEPS } from '@/tower/graph/k-schedule'

describe('buildTopology', () => {
  it('returns exactly TOTAL_NODES nodes', () => {
    const nodes = buildTopology(createRng('t-1'))
    expect(nodes.length).toBe(TOTAL_NODES)
  })

  it('each step has exactly K(step) nodes', () => {
    const nodes = buildTopology(createRng('t-2'))
    for (let step = 0; step < TOTAL_STEPS; step++) {
      const count = nodes.filter((n) => n.step === step).length
      expect(count).toBe(K_SCHEDULE[step])
    }
  })

  it('slot is in [0, K(step)) for every node', () => {
    const nodes = buildTopology(createRng('t-3'))
    for (const n of nodes) {
      expect(n.slot).toBeGreaterThanOrEqual(0)
      expect(n.slot).toBeLessThan(K_SCHEDULE[n.step])
    }
  })

  it('node ids are 0..TOTAL_NODES-1 with no gaps', () => {
    const nodes = buildTopology(createRng('t-4'))
    const ids = nodes.map((n) => n.id).sort((a, b) => a - b)
    expect(ids).toEqual(Array.from({ length: TOTAL_NODES }, (_, i) => i))
  })

  it('every edge (u → v) satisfies v.step === u.step + 1', () => {
    const nodes = buildTopology(createRng('t-5'))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const u of nodes) {
      for (const vid of u.next) {
        const v = byId.get(vid)!
        expect(v.step).toBe(u.step + 1)
      }
    }
  })

  it('every non-start node has at least one incoming edge', () => {
    const nodes = buildTopology(createRng('t-6'))
    for (const n of nodes) {
      if (n.step === 0) continue
      const hasIn = nodes.some((u) => u.next.includes(n.id))
      expect(hasIn).toBe(true)
    }
  })

  it('every non-boss node has at least one outgoing edge', () => {
    const nodes = buildTopology(createRng('t-7'))
    for (const n of nodes) {
      if (n.step === TOTAL_STEPS - 1) continue
      expect(n.next.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('K=1 fixed layers have exactly 1 node', () => {
    const nodes = buildTopology(createRng('t-8'))
    for (const step of [0, 6, 12, 13]) {
      expect(nodes.filter((n) => n.step === step).length).toBe(1)
    }
  })

  it('is deterministic: same seed produces equal topology', () => {
    const a = buildTopology(createRng('same'))
    const b = buildTopology(createRng('same'))
    // Normalize: sort next lists and compare
    const normalize = (ns: PartialTowerNode[]) =>
      ns.map((n) => ({ ...n, next: [...n.next].sort((x, y) => x - y) }))
    expect(normalize(a)).toEqual(normalize(b))
  })

  it('different seeds produce different topology', () => {
    const a = buildTopology(createRng('seed-A'))
    const b = buildTopology(createRng('seed-B'))
    // Edges should differ; collect and diff
    const edges = (ns: PartialTowerNode[]) =>
      ns.flatMap((n) => n.next.map((v) => `${n.id}->${v}`)).sort()
    expect(edges(a)).not.toEqual(edges(b))
  })
})
