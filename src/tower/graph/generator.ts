// src/tower/graph/generator.ts
//
// 图生成主入口：编排 topology → type-assignment → repair 三阶段.
// spec §5.6.
import type { TowerGraph } from '@/tower/types'
import { createRng } from '@/tower/random'
import { assignKinds } from './type-assignment'
import { buildTopology } from './topology'
import { repair } from './repair'

/**
 * 根据 seed 生成一张满足所有硬约束的 TowerGraph.
 * 同一 seed **必须**产出 deepEqual 的图（确定性保证）.
 * @throws 若 repair 在 MAX_REPAIR_ITERATIONS 轮内不收敛.
 */
export function generateTowerGraph(seed: string): TowerGraph {
  const rng = createRng(seed)
  const topo = buildTopology(rng)
  const typed = assignKinds(topo, rng)
  const repaired = repair(typed, rng)

  const nodes: TowerGraph['nodes'] = {}
  for (const n of repaired) nodes[n.id] = n

  const startNode = repaired.find((n) => n.step === 0)!
  const bossNode = repaired.find((n) => n.kind === 'boss')!

  return {
    startNodeId: startNode.id,
    bossNodeId: bossNode.id,
    nodes,
  }
}
