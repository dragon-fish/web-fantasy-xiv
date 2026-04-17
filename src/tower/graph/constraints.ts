// src/tower/graph/constraints.ts
//
// 硬约束校验器（纯函数；无 side effect）.
// 对应 GDD §7.3 的 5 条硬约束.
import type { TowerNode } from '@/tower/types'
import { CAMPFIRE_STEP, MOB_STEP, REWARD_STEP } from './k-schedule'

function nodeById(nodes: TowerNode[]): Map<number, TowerNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

// ============================================================
// 约束 1: step 1 全部为 mob
// ============================================================

export function isStep1AllMob(nodes: TowerNode[]): boolean {
  for (const n of nodes) {
    if (n.step === MOB_STEP && n.kind !== 'mob') return false
  }
  return true
}

// ============================================================
// 约束 2: 精英战不连续两步（elite 相邻 step 不能都是 elite）
// ============================================================

export function hasConsecutiveElite(nodes: TowerNode[]): boolean {
  return findConsecutiveEliteEdge(nodes) !== null
}

/**
 * 返回第一对"连续两步 elite" 节点对 [u, v]，其中 v ∈ u.next.
 * 若无违规返回 null.
 */
export function findConsecutiveEliteEdge(
  nodes: TowerNode[],
): [TowerNode, TowerNode] | null {
  const byId = nodeById(nodes)
  for (const u of nodes) {
    if (u.kind !== 'elite') continue
    for (const vid of u.next) {
      const v = byId.get(vid)
      if (v && v.kind === 'elite' && v.step === u.step + 1) {
        return [u, v]
      }
    }
  }
  return null
}

// ============================================================
// 约束 3: 篝火不与 Step 12 相邻（step 11 不能是 campfire）
// ============================================================

export function hasCampfireAdjacentToStep12(nodes: TowerNode[]): boolean {
  return nodes.some((n) => n.step === CAMPFIRE_STEP - 1 && n.kind === 'campfire')
}

// ============================================================
// 约束 4: 奖励不与 Step 6 相邻（step 5 / 7 不能是 reward）
// ============================================================

export function hasRewardAdjacentToStep6(nodes: TowerNode[]): boolean {
  return nodes.some(
    (n) =>
      (n.step === REWARD_STEP - 1 || n.step === REWARD_STEP + 1) &&
      n.kind === 'reward',
  )
}

// ============================================================
// 约束 5: 每条从 startId 到 bossId 的路径都含至少一个 elite
// ============================================================

/**
 * DFS 枚举所有从 startId 到 bossId 的简单路径，
 * 返回不含 elite 节点的路径列表（每条路径为 node id 数组）.
 */
export function findPathsWithoutElite(
  nodes: TowerNode[],
  startId: number,
  bossId: number,
): number[][] {
  const byId = nodeById(nodes)
  const missing: number[][] = []

  function dfs(currentId: number, path: number[], hasElite: boolean): void {
    const node = byId.get(currentId)
    if (!node) return
    const newHasElite = hasElite || node.kind === 'elite'
    const newPath = [...path, currentId]
    if (currentId === bossId) {
      if (!newHasElite) missing.push(newPath)
      return
    }
    for (const nextId of node.next) {
      dfs(nextId, newPath, newHasElite)
    }
  }

  dfs(startId, [], false)
  return missing
}

export function allPathsHaveElite(
  nodes: TowerNode[],
  startId: number,
  bossId: number,
): boolean {
  return findPathsWithoutElite(nodes, startId, bossId).length === 0
}
