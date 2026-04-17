// src/tower/graph/type-assignment.test.ts
import { describe, it, expect } from 'vitest'
import { createRng } from '@/tower/random'
import { buildTopology } from '@/tower/graph/topology'
import { assignKinds } from '@/tower/graph/type-assignment'
import {
  BOSS_STEP,
  CAMPFIRE_STEP,
  MOB_STEP,
  REWARD_STEP,
  START_STEP,
} from '@/tower/graph/k-schedule'

describe('assignKinds', () => {
  it('fixes step-0 node kind = start', () => {
    const topo = buildTopology(createRng('a-1'))
    const nodes = assignKinds(topo, createRng('a-1'))
    const step0 = nodes.filter((n) => n.step === START_STEP)
    expect(step0.every((n) => n.kind === 'start')).toBe(true)
  })

  it('fixes all step-1 nodes kind = mob', () => {
    const topo = buildTopology(createRng('a-2'))
    const nodes = assignKinds(topo, createRng('a-2'))
    const step1 = nodes.filter((n) => n.step === MOB_STEP)
    expect(step1.every((n) => n.kind === 'mob')).toBe(true)
  })

  it('fixes step-6 node kind = reward', () => {
    const topo = buildTopology(createRng('a-3'))
    const nodes = assignKinds(topo, createRng('a-3'))
    const step6 = nodes.filter((n) => n.step === REWARD_STEP)
    expect(step6.every((n) => n.kind === 'reward')).toBe(true)
  })

  it('fixes step-12 node kind = campfire', () => {
    const topo = buildTopology(createRng('a-4'))
    const nodes = assignKinds(topo, createRng('a-4'))
    const s12 = nodes.filter((n) => n.step === CAMPFIRE_STEP)
    expect(s12.every((n) => n.kind === 'campfire')).toBe(true)
  })

  it('fixes step-13 node kind = boss', () => {
    const topo = buildTopology(createRng('a-5'))
    const nodes = assignKinds(topo, createRng('a-5'))
    const s13 = nodes.filter((n) => n.step === BOSS_STEP)
    expect(s13.every((n) => n.kind === 'boss')).toBe(true)
  })

  it('step-11 never produces campfire (constraint 3 inline-enforced)', () => {
    for (let s = 0; s < 30; s++) {
      const topo = buildTopology(createRng(`c3-${s}`))
      const nodes = assignKinds(topo, createRng(`c3-${s}`))
      const s11 = nodes.filter((n) => n.step === 11)
      for (const n of s11) expect(n.kind).not.toBe('campfire')
    }
  })

  it('step-5 and step-7 never produce reward (constraint 4 inline-enforced)', () => {
    for (let s = 0; s < 30; s++) {
      const topo = buildTopology(createRng(`c4-${s}`))
      const nodes = assignKinds(topo, createRng(`c4-${s}`))
      const s5 = nodes.filter((n) => n.step === 5)
      const s7 = nodes.filter((n) => n.step === 7)
      for (const n of s5) expect(n.kind).not.toBe('reward')
      for (const n of s7) expect(n.kind).not.toBe('reward')
    }
  })

  it('non-fixed nodes have kind in {mob, elite, event, reward, campfire}', () => {
    const topo = buildTopology(createRng('a-8'))
    const nodes = assignKinds(topo, createRng('a-8'))
    const nonFixedSteps = [2, 3, 4, 5, 7, 8, 9, 10, 11]
    for (const n of nodes) {
      if (!nonFixedSteps.includes(n.step)) continue
      expect(['mob', 'elite', 'event', 'reward', 'campfire']).toContain(n.kind)
    }
  })

  it('is deterministic: same seed → same kinds', () => {
    const topoA = buildTopology(createRng('det'))
    const topoB = buildTopology(createRng('det'))
    const a = assignKinds(topoA, createRng('det-k'))
    const b = assignKinds(topoB, createRng('det-k'))
    expect(a.map((n) => n.kind)).toEqual(b.map((n) => n.kind))
  })
})
