// src/tower/graph/loader.ts
//
// Hand-crafted tower graph loader. phase2 仅以 unit test 验证；
// phase7 教程塔会消费它. spec §6.
import { parse as parseYaml } from 'yaml'
import type { TowerGraph, TowerNode, TowerNodeKind } from '@/tower/types'

const VALID_KINDS: readonly TowerNodeKind[] = [
  'start',
  'mob',
  'elite',
  'boss',
  'campfire',
  'reward',
  'event',
]

export class TowerGraphLoaderError extends Error {
  constructor(message: string, public readonly path: string = '$') {
    super(`[TowerGraphLoader] ${message} (at ${path})`)
    this.name = 'TowerGraphLoaderError'
  }
}

function fail(msg: string, path: string = '$'): never {
  throw new TowerGraphLoaderError(msg, path)
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`expected number, got ${JSON.stringify(value)}`, path)
  }
  return value as number
}

function expectKind(value: unknown, path: string): TowerNodeKind {
  if (typeof value !== 'string' || !VALID_KINDS.includes(value as TowerNodeKind)) {
    fail(`invalid kind: ${JSON.stringify(value)}`, path)
  }
  return value as TowerNodeKind
}

function expectArrayOfNumbers(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) fail(`expected array, got ${typeof value}`, path)
  return value.map((v, i) => expectNumber(v, `${path}[${i}]`))
}

function validateRootShape(raw: unknown): {
  startNodeId: number
  bossNodeId: number
  rawNodes: unknown[]
} {
  if (!raw || typeof raw !== 'object') {
    fail('root must be an object')
  }
  const root = raw as Record<string, unknown>
  if (!('startNodeId' in root)) fail('missing startNodeId')
  if (!('bossNodeId' in root)) fail('missing bossNodeId')
  if (!('nodes' in root)) fail('missing nodes')
  const startNodeId = expectNumber(root.startNodeId, '$.startNodeId')
  const bossNodeId = expectNumber(root.bossNodeId, '$.bossNodeId')
  if (!Array.isArray(root.nodes)) {
    fail('nodes must be an array', '$.nodes')
  }
  return { startNodeId, bossNodeId, rawNodes: root.nodes }
}

function parseNode(raw: unknown, index: number): TowerNode {
  const path = `$.nodes[${index}]`
  if (!raw || typeof raw !== 'object') fail('node must be an object', path)
  const o = raw as Record<string, unknown>
  const id = expectNumber(o.id, `${path}.id`)
  const step = expectNumber(o.step, `${path}.step`)
  const slot = expectNumber(o.slot, `${path}.slot`)
  const kind = expectKind(o.kind, `${path}.kind`)
  const next = expectArrayOfNumbers(o.next, `${path}.next`)
  return { id, step, slot, kind, next }
}

function assertBfsReachability(
  startId: number,
  bossId: number,
  nodes: Record<number, TowerNode>,
): void {
  const visited = new Set<number>([startId])
  const queue = [startId]
  while (queue.length) {
    const u = queue.shift()!
    const node = nodes[u]
    if (!node) continue
    for (const v of node.next) {
      if (!visited.has(v)) {
        visited.add(v)
        queue.push(v)
      }
    }
  }
  if (!visited.has(bossId)) {
    fail(
      `bossNodeId ${bossId} is not reachable from startNodeId ${startId}`,
      '$.bossNodeId',
    )
  }
}

export function loadTowerGraphFromYaml(yamlText: string): TowerGraph {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (err) {
    throw new TowerGraphLoaderError(
      `invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const { startNodeId, bossNodeId, rawNodes } = validateRootShape(raw)

  const nodes: Record<number, TowerNode> = {}
  for (let i = 0; i < rawNodes.length; i++) {
    const node = parseNode(rawNodes[i], i)
    if (nodes[node.id]) {
      fail(`duplicate node id ${node.id}`, `$.nodes[${i}].id`)
    }
    nodes[node.id] = node
  }

  if (!nodes[startNodeId]) {
    fail(`startNodeId ${startNodeId} not found in nodes`, '$.startNodeId')
  }
  if (!nodes[bossNodeId]) {
    fail(`bossNodeId ${bossNodeId} not found in nodes`, '$.bossNodeId')
  }

  for (const node of Object.values(nodes)) {
    for (const nextId of node.next) {
      if (!nodes[nextId]) {
        fail(
          `unknown next id ${nextId} referenced by node ${node.id}`,
          `$.nodes[${node.id}].next`,
        )
      }
    }
  }

  assertBfsReachability(startNodeId, bossNodeId, nodes)

  return { startNodeId, bossNodeId, nodes }
}
