// src/tower/graph/type-assignment.ts
//
// 阶段 B：为 topology 节点分配 kind.
// 固定节点钉死；非固定按权重抽样，内联规避约束 3/4.
// 约束 2/5 留给 Task 7 repair.
// spec §5.3.
import type { TowerNode, TowerNodeKind } from '@/tower/types'
import type { Rng } from '@/tower/random'
import type { PartialTowerNode } from './topology'
import {
  BOSS_STEP,
  CAMPFIRE_STEP,
  MOB_STEP,
  REWARD_STEP,
  START_STEP,
} from './k-schedule'

/** spec §5.3 权重表；start/boss 占位 0 以满足 Record 类型. */
export const NONFIXED_WEIGHTS: Record<TowerNodeKind, number> = {
  mob: 50,
  elite: 15,
  event: 15,
  reward: 10,
  campfire: 10,
  start: 0,
  boss: 0,
}

/**
 * 权重抽样：从 kinds 里按 weights 权重选一个.
 * weights 中 0 值自动排除；若全部为 0 则 throw（不应发生）.
 */
function weightedPick(
  rng: Rng,
  weights: Record<TowerNodeKind, number>,
  excluded: Set<TowerNodeKind>,
): TowerNodeKind {
  const entries = (Object.entries(weights) as [TowerNodeKind, number][])
    .filter(([k, w]) => w > 0 && !excluded.has(k))
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) {
    throw new Error('weightedPick: no candidates with positive weight')
  }
  let roll = rng() * total
  for (const [k, w] of entries) {
    roll -= w
    if (roll <= 0) return k
  }
  return entries[entries.length - 1][0] // 保险分支（浮点误差）
}

/** 按 step 返回该层"禁止"的 kind 集合（约束 3、4 的 inline 形式）. */
function forbiddenKindsForStep(step: number): Set<TowerNodeKind> {
  const forbidden = new Set<TowerNodeKind>()
  if (step === CAMPFIRE_STEP - 1) forbidden.add('campfire')
  if (step === REWARD_STEP - 1 || step === REWARD_STEP + 1) forbidden.add('reward')
  return forbidden
}

/** 把 PartialTowerNode 升级为带 kind 的 TowerNode. */
export function assignKinds(
  topology: PartialTowerNode[],
  rng: Rng,
): TowerNode[] {
  return topology.map((n): TowerNode => {
    let kind: TowerNodeKind
    if (n.step === START_STEP) kind = 'start'
    else if (n.step === MOB_STEP) kind = 'mob'
    else if (n.step === REWARD_STEP) kind = 'reward'
    else if (n.step === CAMPFIRE_STEP) kind = 'campfire'
    else if (n.step === BOSS_STEP) kind = 'boss'
    else kind = weightedPick(rng, NONFIXED_WEIGHTS, forbiddenKindsForStep(n.step))
    return { ...n, kind }
  })
}
