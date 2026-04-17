// src/tower/graph/k-schedule.ts
//
// 塔结构固化常量. spec §5.1 / GDD §7.3.
// 本 MVP 仅 1 层塔，12 步 + start + boss = 14 个 step 索引.

/**
 * 每 step 的节点数.
 * Index = step number (0 ~ 13).
 * K=1 的 step 为"固定层"（start / reward / campfire / boss），所有路径强制汇合.
 */
export const K_SCHEDULE: readonly number[] = [
  /* step  0 start    */ 1,
  /* step  1 mob      */ 2,
  /* step  2 nonfixed */ 2,
  /* step  3 nonfixed */ 2,
  /* step  4 nonfixed */ 3, // 关键决策位
  /* step  5 nonfixed */ 2,
  /* step  6 reward   */ 1,
  /* step  7 nonfixed */ 2,
  /* step  8 nonfixed */ 3, // 关键决策位
  /* step  9 nonfixed */ 2,
  /* step 10 nonfixed */ 2,
  /* step 11 nonfixed */ 2,
  /* step 12 campfire */ 1,
  /* step 13 boss     */ 1,
] as const

export const TOTAL_STEPS = K_SCHEDULE.length
export const TOTAL_NODES = K_SCHEDULE.reduce((a, b) => a + b, 0)

// 各角色 step 索引（避免其他模块硬编码 magic number）.
export const START_STEP = 0
export const MOB_STEP = 1 // 硬约束 1：step 1 全部为 mob
export const REWARD_STEP = 6
export const CAMPFIRE_STEP = 12
export const BOSS_STEP = 13
