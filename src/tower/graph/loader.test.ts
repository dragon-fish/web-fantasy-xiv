// src/tower/graph/loader.test.ts
import { describe, it, expect } from 'vitest'
import {
  loadTowerGraphFromYaml,
  TowerGraphLoaderError,
} from '@/tower/graph/loader'

const VALID_YAML = `
startNodeId: 0
bossNodeId: 3
nodes:
  - id: 0
    step: 0
    slot: 0
    kind: start
    next: [1]
  - id: 1
    step: 1
    slot: 0
    kind: mob
    next: [2]
  - id: 2
    step: 2
    slot: 0
    kind: campfire
    next: [3]
  - id: 3
    step: 3
    slot: 0
    kind: boss
    next: []
`

describe('loadTowerGraphFromYaml — happy path', () => {
  it('parses a minimal valid graph', () => {
    const g = loadTowerGraphFromYaml(VALID_YAML)
    expect(g.startNodeId).toBe(0)
    expect(g.bossNodeId).toBe(3)
    expect(Object.keys(g.nodes).length).toBe(4)
    expect(g.nodes[0].kind).toBe('start')
    expect(g.nodes[3].kind).toBe('boss')
    expect(g.nodes[0].next).toEqual([1])
  })
})

describe('loadTowerGraphFromYaml — error cases', () => {
  it('throws TowerGraphLoaderError on invalid YAML syntax', () => {
    expect(() => loadTowerGraphFromYaml('this is [[ not valid yaml ::'))
      .toThrow(TowerGraphLoaderError)
  })

  it('throws when root lacks startNodeId', () => {
    const yaml = `
bossNodeId: 0
nodes:
  - { id: 0, step: 0, slot: 0, kind: start, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/startNodeId/)
  })

  it('throws when a node has invalid kind', () => {
    const yaml = `
startNodeId: 0
bossNodeId: 0
nodes:
  - { id: 0, step: 0, slot: 0, kind: dragon, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/kind/)
  })

  it('throws when node ids are not unique', () => {
    const yaml = `
startNodeId: 0
bossNodeId: 0
nodes:
  - { id: 0, step: 0, slot: 0, kind: start, next: [0] }
  - { id: 0, step: 1, slot: 0, kind: boss, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/duplicate/i)
  })

  it('throws when next references an unknown id', () => {
    const yaml = `
startNodeId: 0
bossNodeId: 1
nodes:
  - { id: 0, step: 0, slot: 0, kind: start, next: [99] }
  - { id: 1, step: 1, slot: 0, kind: boss, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/unknown/i)
  })

  it('throws when startNodeId is not in nodes', () => {
    const yaml = `
startNodeId: 99
bossNodeId: 0
nodes:
  - { id: 0, step: 0, slot: 0, kind: boss, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/startNodeId/)
  })

  it('throws when bossNodeId is unreachable from startNodeId', () => {
    const yaml = `
startNodeId: 0
bossNodeId: 2
nodes:
  - { id: 0, step: 0, slot: 0, kind: start, next: [1] }
  - { id: 1, step: 1, slot: 0, kind: boss, next: [] }
  - { id: 2, step: 2, slot: 0, kind: boss, next: [] }
`
    expect(() => loadTowerGraphFromYaml(yaml)).toThrow(/reachable/i)
  })
})
