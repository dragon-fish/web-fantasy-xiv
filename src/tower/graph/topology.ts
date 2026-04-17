// src/tower/graph/topology.ts
//
// 阶段 A：拓扑生成。产出带 id/step/slot/next 的节点骨架，**不含 kind**.
// spec §5.2.
import type { Rng } from '@/tower/random'
import { K_SCHEDULE, TOTAL_STEPS } from './k-schedule'

/**
 * 生成 M 条路径的数量.
 * M = max(K_SCHEDULE)，保证在最宽的层上也能覆盖每个 slot.
 */
const PATH_COUNT = Math.max(...K_SCHEDULE)

/** 拓扑阶段的节点：比 TowerNode 少 kind 字段. */
export interface PartialTowerNode {
  id: number
  step: number
  slot: number
  next: number[]
}

/** 从 [0, max) 均匀抽取一个整数 */
function pickInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max)
}

/** 均匀选一个元素 */
function pickOne<T>(rng: Rng, arr: readonly T[]): T {
  return arr[pickInt(rng, arr.length)]
}

/**
 * 已知 prevSlot ∈ [0, K(prevStep))，返回 step=nextStep 层的合法 next slot 集合.
 * - K(nextStep) === 1 → 只能去 slot 0
 * - 否则 → {prevSlot-1, prevSlot, prevSlot+1} ∩ [0, K(nextStep))
 */
function candidateNextSlots(prevSlot: number, nextStep: number): number[] {
  const k = K_SCHEDULE[nextStep]
  if (k === 1) return [0]
  const set = new Set<number>()
  for (const s of [prevSlot - 1, prevSlot, prevSlot + 1]) {
    if (s >= 0 && s < k) set.add(s)
  }
  return [...set]
}

/** 反向：已知 nextStep/nextSlot，找出 prevStep 上能到达它的 prev slot 集合. */
function candidatePrevSlots(nextSlot: number, prevStep: number): number[] {
  const kPrev = K_SCHEDULE[prevStep]
  if (kPrev === 1) return [0]
  const set = new Set<number>()
  for (const s of [nextSlot - 1, nextSlot, nextSlot + 1]) {
    if (s >= 0 && s < kPrev) set.add(s)
  }
  return [...set]
}

export function buildTopology(rng: Rng): PartialTowerNode[] {
  // (1) 分配节点 id（按 step × slot lex 顺序递增）
  const nodes: PartialTowerNode[] = []
  let nextId = 0
  for (let step = 0; step < TOTAL_STEPS; step++) {
    for (let slot = 0; slot < K_SCHEDULE[step]; slot++) {
      nodes.push({ id: nextId++, step, slot, next: [] })
    }
  }

  // 用于高效查询（step, slot）→ node.
  const grid: PartialTowerNode[][] = []
  for (let step = 0; step < TOTAL_STEPS; step++) {
    grid.push(nodes.filter((n) => n.step === step))
  }
  const at = (step: number, slot: number): PartialTowerNode => {
    const row = grid[step]
    const found = row.find((n) => n.slot === slot)
    if (!found) {
      throw new Error(`topology: no node at step=${step} slot=${slot}`)
    }
    return found
  }

  // (2) 生成 M 条路径
  const paths: number[][] = [] // 每条路径是 step → slot 的数组（长度 = TOTAL_STEPS）
  for (let i = 0; i < PATH_COUNT; i++) {
    const path: number[] = [0] // step 0 只有 slot 0
    for (let step = 1; step < TOTAL_STEPS; step++) {
      const prevSlot = path[step - 1]
      const candidates = candidateNextSlots(prevSlot, step)
      path.push(pickOne(rng, candidates))
    }
    paths.push(path)
  }

  // (3) 把路径展开为边，写入 node.next（去重）
  for (const path of paths) {
    for (let step = 0; step < TOTAL_STEPS - 1; step++) {
      const u = at(step, path[step])
      const v = at(step + 1, path[step + 1])
      if (!u.next.includes(v.id)) u.next.push(v.id)
    }
  }

  // (4a) 修复：保证 step > 0 的每个节点至少 1 条入边
  for (let step = 1; step < TOTAL_STEPS; step++) {
    for (const v of grid[step]) {
      const hasIn = nodes.some((u) => u.next.includes(v.id))
      if (!hasIn) {
        const prevSlots = candidatePrevSlots(v.slot, step - 1)
        const chosenSlot = pickOne(rng, prevSlots)
        const u = at(step - 1, chosenSlot)
        u.next.push(v.id)
      }
    }
  }

  // (4b) 修复：保证 step < TOTAL_STEPS-1 的每个节点至少 1 条出边
  for (let step = 0; step < TOTAL_STEPS - 1; step++) {
    for (const u of grid[step]) {
      if (u.next.length === 0) {
        const nextSlots = candidateNextSlots(u.slot, step + 1)
        const chosenSlot = pickOne(rng, nextSlots)
        const v = at(step + 1, chosenSlot)
        u.next.push(v.id)
      }
    }
  }

  // next 列表内部排序稳定（避免 set iteration 差异）
  for (const n of nodes) n.next.sort((a, b) => a - b)

  return nodes
}
