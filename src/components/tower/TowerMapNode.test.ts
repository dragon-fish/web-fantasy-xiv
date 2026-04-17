// src/components/tower/TowerMapNode.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TowerMapNode from '@/components/tower/TowerMapNode.vue'
import type { TowerNode } from '@/tower/types'

function mkNode(overrides: Partial<TowerNode> = {}): TowerNode {
  return { id: 0, step: 0, slot: 0, kind: 'mob', next: [], ...overrides }
}

describe('TowerMapNode', () => {
  it('renders the correct icon for each kind', () => {
    const cases: Array<[TowerNode['kind'], string]> = [
      ['start', '🚩'],
      ['mob', '⚔️'],
      ['elite', '💀'],
      ['boss', '👑'],
      ['campfire', '🔥'],
      ['reward', '🎁'],
      ['event', '❓'],
    ]
    for (const [kind, icon] of cases) {
      const w = mount(TowerMapNode, {
        props: { node: mkNode({ kind }), state: 'unreachable' },
      })
      expect(w.text()).toContain(icon)
    }
  })

  it('applies state classes', () => {
    const states = ['current', 'completed', 'reachable', 'unreachable'] as const
    for (const state of states) {
      const w = mount(TowerMapNode, {
        props: { node: mkNode(), state },
      })
      expect(w.classes()).toContain(state)
    }
  })

  it('applies kind class', () => {
    const w = mount(TowerMapNode, {
      props: { node: mkNode({ kind: 'elite' }), state: 'unreachable' },
    })
    expect(w.classes()).toContain('kind-elite')
  })

  it('emits select event when clicked in reachable state', async () => {
    const w = mount(TowerMapNode, {
      props: { node: mkNode({ id: 42 }), state: 'reachable' },
    })
    await w.trigger('click')
    expect(w.emitted('select')).toBeTruthy()
    expect(w.emitted('select')![0]).toEqual([42])
  })

  it('does not emit select when disabled (not reachable)', async () => {
    const w = mount(TowerMapNode, {
      props: { node: mkNode({ id: 42 }), state: 'completed' },
    })
    await w.trigger('click')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('sets disabled attribute when not reachable', () => {
    const w = mount(TowerMapNode, {
      props: { node: mkNode(), state: 'current' },
    })
    expect(w.attributes('disabled')).toBeDefined()
  })
})
