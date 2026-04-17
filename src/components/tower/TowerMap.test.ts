// src/components/tower/TowerMap.test.ts
//
// Note: Vue Flow renders SVG + uses ResizeObserver / window APIs that are
// flaky in jsdom. Per phase2 addendum, we no longer attempt DOM assertions
// on the map structure — instead we smoke-test that TowerMap mounts without
// throwing given a minimal store state. Richer interaction tests live at
// the store layer (`src/stores/tower.test.ts`).
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import TowerMap from '@/components/tower/TowerMap.vue'
import { useTowerStore } from '@/stores/tower'
import type { TowerGraph } from '@/tower/types'

// Stub ResizeObserver for jsdom (Vue Flow depends on it).
beforeEach(() => {
  setActivePinia(createPinia())
  // @ts-expect-error — jsdom lacks ResizeObserver
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const SIMPLE_GRAPH: TowerGraph = {
  startNodeId: 0,
  bossNodeId: 2,
  nodes: {
    0: { id: 0, step: 0, slot: 0, kind: 'start', next: [1] },
    1: { id: 1, step: 1, slot: 0, kind: 'mob', next: [2] },
    2: { id: 2, step: 2, slot: 0, kind: 'boss', next: [] },
  },
}

describe('TowerMap', () => {
  it('renders without throwing for a minimal graph', () => {
    const store = useTowerStore()
    store.startNewRun('swordsman', 'test-seed')
    store.run!.towerGraph = SIMPLE_GRAPH
    store.run!.currentNodeId = 0
    store.setPhase('in-path')
    expect(() => mount(TowerMap)).not.toThrow()
  })

  it('renders nothing when store has no active run', () => {
    const w = mount(TowerMap)
    expect(w.find('.tower-map-wrapper').exists()).toBe(false)
  })
})
