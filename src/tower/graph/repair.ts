// src/tower/graph/repair.ts
//
// 阶段 C：修复约束 2（精英不连续）与约束 5（每路径至少 1 精英）.
// 迭代最多 MAX_REPAIR_ITERATIONS 轮；超限 throw.
// spec §5.4.
import type { TowerNode, TowerNodeKind } from '@/tower/types'
import type { Rng } from '@/tower/random'
import {
  findPathsWithoutElite,
} from './constraints'
import {
  BOSS_STEP,
  CAMPFIRE_STEP,
  MOB_STEP,
  REWARD_STEP,
  START_STEP,
} from './k-schedule'
import { NONFIXED_WEIGHTS } from './type-assignment'

/**
 * 修复迭代上限.
 * 每次 `addEliteToPaths` 一次只修一条缺 elite 的路径（至多 1 次 rng 调用），
 * 每次 `fixConsecutiveElite` 至多 demote 1 个节点；交替最坏情况 ≈ K_paths × 2.
 * 100-seed stress test 从未超过 ~20 轮，50 留足缓冲.
 */
export const MAX_REPAIR_ITERATIONS = 50

/** 判断节点 kind 是否"固定不可变"（step 0/1/6/12/13 的节点）. */
function isKindFixed(node: TowerNode): boolean {
  return (
    node.step === START_STEP ||
    node.step === MOB_STEP ||
    node.step === REWARD_STEP ||
    node.step === CAMPFIRE_STEP ||
    node.step === BOSS_STEP
  )
}

/** 从权重表中按条件重抽（排除某些 kind），对 node 原地赋值. */
function reassignKind(
  node: TowerNode,
  rng: Rng,
  excluded: Set<TowerNodeKind>,
): void {
  const entries = (Object.entries(NONFIXED_WEIGHTS) as [TowerNodeKind, number][])
    .filter(([k, w]) => w > 0 && !excluded.has(k))
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) {
    throw new Error(`repair: no valid kind for node ${node.id}`)
  }
  let roll = rng() * total
  for (const [k, w] of entries) {
    roll -= w
    if (roll <= 0) {
      node.kind = k
      return
    }
  }
  node.kind = entries[entries.length - 1][0]
}

/**
 * Build excluded-kind set for a node during consecutive-elite repair.
 * Always excludes 'elite' (caller is reassigning **away** from elite),
 * plus step-adjacency constraints 3/4 (step 11 no campfire, step 5/7 no reward).
 * NOTE: coupled to repair's purpose — not reusable for first-pass type assignment,
 * where `type-assignment.ts#forbiddenKindsForStep` applies instead.
 */
function stepExclusions(step: number): Set<TowerNodeKind> {
  const excluded = new Set<TowerNodeKind>(['elite'])
  if (step === CAMPFIRE_STEP - 1) excluded.add('campfire')
  if (step === REWARD_STEP - 1 || step === REWARD_STEP + 1) excluded.add('reward')
  return excluded
}

/**
 * 修约束 2：遍历所有 elite→elite 边对 (u,v)，找到第一个可修复的.
 * - 若 u 固定（如 step=1 mob-slot）则跳过此对——无法通过改 v 解决.
 * - 若 v 固定，则改 u 为非 elite（退而求其次）.
 * - 若 v 不固定，则改 v 为非 elite（标准路径）.
 * 返回是否做出了改动.
 *
 * NOTE: 对真实生成图（type-assignment 后），固定 step 的节点 kind 永远匹配
 * 该 step 的固定 kind（start/mob/reward/campfire/boss），绝无 elite；因此
 * `isKindFixed(u) && u.kind === 'elite'` 在生产上不会发生，仅测试代码可以
 * 手工构造这种形态. 这里的 skip 分支是防御性容错，非生产路径.
 */
function fixConsecutiveElite(nodes: TowerNode[], rng: Rng): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const u of nodes) {
    if (u.kind !== 'elite') continue
    if (isKindFixed(u)) continue // fixed-elite u: can't resolve from this side; skip
    for (const vid of u.next) {
      const v = byId.get(vid)
      if (!v || v.kind !== 'elite' || v.step !== u.step + 1) continue
      // Found a fixable consecutive elite pair (u not fixed)
      if (!isKindFixed(v)) {
        reassignKind(v, rng, stepExclusions(v.step))
      } else {
        // v is fixed; fix u instead
        reassignKind(u, rng, stepExclusions(u.step))
      }
      return true
    }
  }
  return false
}

/**
 * Returns true if assigning elite to `node` would create a consecutive-elite
 * edge with any of its neighbors (predecessors or successors already elite).
 */
function wouldCreateConsecutiveElite(
  node: TowerNode,
  byId: Map<number, TowerNode>,
  prevById: Map<number, number[]>,
): boolean {
  // Check successors: node→successor both elite
  for (const nextId of node.next) {
    const next = byId.get(nextId)
    if (next && next.kind === 'elite' && next.step === node.step + 1) return true
  }
  // Check predecessors: predecessor→node both elite
  const preds = prevById.get(node.id) ?? []
  for (const predId of preds) {
    const pred = byId.get(predId)
    if (pred && pred.kind === 'elite' && pred.step === node.step - 1) return true
  }
  return false
}

/**
 * 修约束 5：对每条无 elite 的路径，选其中一个非固定节点改为 elite.
 * 优先选 step 值大且不会引发连续 elite 的节点；若最高 step 全部冲突则退而求其次.
 * 每次调用只修复第一条违规路径，调用方循环负责重复调用.
 */
function addEliteToPaths(
  nodes: TowerNode[],
  startId: number,
  bossId: number,
  rng: Rng,
): boolean {
  const missing = findPathsWithoutElite(nodes, startId, bossId)
  if (missing.length === 0) return false
  const byId = new Map(nodes.map((n) => [n.id, n]))

  // Build predecessor map for consecutive-elite check.
  const prevById = new Map<number, number[]>()
  for (const n of nodes) {
    for (const nextId of n.next) {
      const list = prevById.get(nextId) ?? []
      list.push(n.id)
      prevById.set(nextId, list)
    }
  }

  // Fix the first missing path.
  const path = missing[0]
  // Filter to non-fixed candidates.
  const candidates = path
    .map((id) => byId.get(id)!)
    .filter((n) => !isKindFixed(n))
  if (candidates.length === 0) {
    throw new Error(
      `repair: path ${path.join('→')} has no mutable candidate for elite`,
    )
  }
  // Sort by step descending; prefer candidates that won't create consecutive elites.
  candidates.sort((a, b) => b.step - a.step)
  const safe = candidates.filter((n) => !wouldCreateConsecutiveElite(n, byId, prevById))
  const pool = safe.length > 0 ? safe : candidates
  // Pick randomly from the top-step tier of the preferred pool.
  const topStep = pool[0].step
  const topTier = pool.filter((n) => n.step === topStep)
  const chosen = topTier[Math.floor(rng() * topTier.length)]
  chosen.kind = 'elite'
  return true
}

/**
 * 从 nodes 里找出 start/boss 节点的 id.
 * NOTE: plan originally looked up by step (START_STEP/BOSS_STEP), but test
 * graphs use synthetic step indices. Looking up by kind is the correct intent
 * since repair operates on already-kind-assigned nodes.
 */
function findStartAndBoss(nodes: TowerNode[]): { startId: number; bossId: number } {
  const start = nodes.find((n) => n.kind === 'start')
  const boss = nodes.find((n) => n.kind === 'boss')
  if (!start || !boss) {
    throw new Error('repair: missing start or boss node')
  }
  return { startId: start.id, bossId: boss.id }
}

/**
 * 主入口：迭代修复约束 2 → 约束 5，直到全部满足或超限.
 * **修改原 nodes 数组**（in-place），并把同样的数组返回以便链式.
 */
export function repair(nodes: TowerNode[], rng: Rng): TowerNode[] {
  const { startId, bossId } = findStartAndBoss(nodes)
  for (let iter = 0; iter < MAX_REPAIR_ITERATIONS; iter++) {
    // 先修约束 2（可能扰动约束 5；下轮再看）
    if (fixConsecutiveElite(nodes, rng)) continue
    // 再修约束 5（可能引入新 elite 导致约束 2 违反；下轮再看）
    if (addEliteToPaths(nodes, startId, bossId, rng)) continue
    return nodes // 全部通过
  }
  throw new Error(
    `repair: graph did not converge in ${MAX_REPAIR_ITERATIONS} iterations ` +
      `(pathological seed).`,
  )
}
