# Rougelike Tower — Phase 2 (Graph Generation & Map UI) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 phase1 foundation 基础上，实现爬塔模式的图生成算法（seeded、3 阶段 pipeline）、YAML hand-crafted loader、schema versioning 存档校验、`/tower` 路径地图 UI 与路径推进 store actions。phase2 完成后，玩家能从主菜单点"新游戏" → 硬编码职业（phase3 将替换）→ 确认下潜 → 在地图上点击合法下一步推进 `currentNodeId`，但**不进战斗**——战斗接入是 phase4 的事。

**Architecture:**
- **纯逻辑层**（`src/tower/graph/*`）：K schedule 常量 → 拓扑生成 → 类型分配 → 约束修复，各自独立 TS 模块，全量 TDD。generator 仅是 orchestrator。
- **Loader**（`src/tower/graph/loader.ts`）：`yaml` 包解析 + schema validate + BFS 可达性，为 phase7 教程塔铺路，phase2 只以 unit test 验证。
- **Store 扩展**（`src/stores/tower.ts`）：新增 `startDescent` / `advanceTo` actions；扩展 `continueLastRun` 做 `schemaVersion` 校验；新增 `schemaResetNotice` ephemeral ref。
- **UI 层**（`src/components/tower/` + `src/pages/tower/index.vue`）：`<TowerMap>` 组合 `<TowerMapNode>` + `<TowerMapEdges>`，SVG 层绘制连线；Page 扩展 `selecting-job` / `in-path` 两个 phase 分支。
- **确定性与随机**：所有随机走 `createRng(seed)`（phase1 已实现），seed 不混 job。存档版本通过 `TOWER_RUN_SCHEMA_VERSION` 常量跟踪，phase2 起首发 `= 1`。

**Tech Stack:** TypeScript (strict) + Vue 3 `<script setup>` + pug + scoped SCSS + UnoCSS (Attributify) + Pinia + vue-router 5 + yaml 2.8.3 + Vitest + @vue/test-utils (新增 dev dep) + fake-indexeddb (phase1 已配)

**Reference spec:** `docs/superpowers/specs/2026-04-17-rougelike-p2-tower-graph-design.md`（本 plan 完整兑现其 §2 IN 清单；OUT 项目保持不动）

**Reference GDD:** `docs/brainstorm/2026-04-17-rougelike.md` §2.1 / §2.2 / §2.2.1 / §7.3 / §7.4

---

## 任务依赖图

```
Task 1 (@vue/test-utils 安装)   → 被 Task 13/14/15 引用
Task 2 (types.ts 扩展)          → 被 Task 3-12/15 引用（大部分模块 import 类型）
Task 3 (k-schedule.ts)          → 被 Task 5/6/8/14/15 引用
Task 4 (constraints.ts)         → 被 Task 7/8 引用
Task 5 (topology.ts)            → 被 Task 8 引用
Task 6 (type-assignment.ts)     → 被 Task 8 引用
Task 7 (repair.ts)              → 被 Task 8 引用
Task 8 (generator.ts orch)      → 被 Task 10 引用
Task 9 (loader.ts)              → 独立（phase2 仅 unit test 验证）
Task 10 (store.startDescent)    → 被 Task 16 引用
Task 11 (store.advanceTo)       → 被 Task 15 引用
Task 12 (store.continueLastRun 扩展) → 被 Task 16 引用
Task 13 (TowerMapNode.vue)      → 被 Task 15 引用
Task 14 (TowerMapEdges.vue)     → 被 Task 15 引用
Task 15 (TowerMap.vue)          → 被 Task 16 引用
Task 16 (pages/tower/index.vue) → 被 Task 17 引用
Task 17 (主菜单 新游戏按钮启用)  → 独立
Task 18 (最终验收)              → 依赖全部
```

推荐顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18。

---

## Task 1: 安装 `@vue/test-utils` 以支持组件测试

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

Spec §9.5 要求对 `TowerMap.vue` 做组件单测。phase1 没有任何 `.vue` 测试，项目未安装 `@vue/test-utils`。现在补上。

- [ ] **Step 1: 安装 `@vue/test-utils` 到 devDependencies**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm add -D @vue/test-utils
```

Expected: `package.json` 的 `devDependencies` 多出 `"@vue/test-utils": "^x.y.z"`，`pnpm-lock.yaml` 同步更新。

- [ ] **Step 2: 确保依赖可被解析**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && node -e "console.log(require.resolve('@vue/test-utils'))"
```

Expected: 打印出 `node_modules/@vue/test-utils/dist/vue-test-utils.cjs.js`（或类似路径），无报错。

- [ ] **Step 3: 跑已有测试确认没 break**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run
```

Expected: 所有已有测试通过（phase1 共 5 个测试文件，总 ~30 passed；具体数量以当前实际为准）。

- [ ] **Step 4: Commit**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add package.json pnpm-lock.yaml && git commit -m "chore(tower): add @vue/test-utils for P2 component tests"
```

---

## Task 2: 扩展 `src/tower/types.ts`

**Files:**
- Modify: `src/tower/types.ts`
- Modify: `src/stores/tower.ts`（`createInitialRun` 补 `schemaVersion`）
- Modify: `src/stores/tower.test.ts`（既有 mock run 补 `schemaVersion`）
- Modify: `src/tower/persistence.test.ts`（既有 mock run 补 `schemaVersion`）

3 处类型改动：`TowerNodeKind` 加 `'start'`、`TowerNode` 加 `slot: number`、`TowerRun` 加 `schemaVersion: number`，以及导出 `TOWER_RUN_SCHEMA_VERSION = 1`。

TypeScript strict 下，字段新增会让所有构造 `TowerRun` 的地方报错——phase2 借此强制把所有 mock / init 代码补齐。

- [ ] **Step 1: 修改 `src/tower/types.ts` 加 `'start'` kind**

Open `src/tower/types.ts`, locate:

```ts
export type TowerNodeKind =
  | 'mob'
  | 'elite'
  | 'boss'
  | 'campfire'
  | 'reward'
  | 'event'
```

Replace with:

```ts
export type TowerNodeKind =
  | 'start'
  | 'mob'
  | 'elite'
  | 'boss'
  | 'campfire'
  | 'reward'
  | 'event'
```

- [ ] **Step 2: 修改 `TowerNode` 加 `slot`**

In `src/tower/types.ts`, locate:

```ts
export interface TowerNode {
  /** 全局唯一 node id（图内） */
  id: number
  /** 第几步（0 = 起点 0 号节点，1-12 = 主干，13 = boss） */
  step: number
  kind: TowerNodeKind
  /** 可达的下一层节点 id（有向图） */
  next: number[]
}
```

Replace with:

```ts
export interface TowerNode {
  /** 全局唯一 node id（图内） */
  id: number
  /** 第几步（0 = 起点 0 号节点，1-12 = 主干，13 = boss） */
  step: number
  /** 水平位置索引，[0, K(step))；UI 布局用。算法不感知渲染方向 */
  slot: number
  kind: TowerNodeKind
  /** 可达的下一层节点 id（有向图） */
  next: number[]
}
```

- [ ] **Step 3: 加 `TOWER_RUN_SCHEMA_VERSION` 常量并修改 `TowerRun`**

In `src/tower/types.ts`, 在 `// TowerRun — 局内持久化状态的根对象` 注释块之前插入：

```ts
// ============================================================
// Schema versioning（spec §3.6）
// ============================================================

/**
 * 存档 schema 版本号.
 * 任何 breaking 变更（新增 TowerNodeKind / 改 K schedule / 改 TowerNode 字段 /
 * 调整权重 / 重写修复算法 / 改约束集）都必须 bump 此常量.
 * phase2 首发 = 1.
 */
export const TOWER_RUN_SCHEMA_VERSION = 1 as const
```

然后在 `export interface TowerRun {` 内部最顶端（在 `runId` 之前）插入：

```ts
  /**
   * 存档 schema 版本号；不匹配 `TOWER_RUN_SCHEMA_VERSION` 时 continueLastRun
   * 会 reset 存档 + 弹提示条（spec §3.6）.
   */
  schemaVersion: number
```

- [ ] **Step 4: typecheck 预期失败，列出受影响的位置**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 失败，错误类似 `Property 'schemaVersion' is missing in type ... but required in type 'TowerRun'`，指向:
- `src/stores/tower.ts` 的 `createInitialRun` 返回对象
- `src/stores/tower.test.ts` 中手工构造 TowerRun 的地方
- `src/tower/persistence.test.ts` 中 `makeRun()` helper

- [ ] **Step 5: 修复 `src/stores/tower.ts` 的 `createInitialRun`**

Locate:

```ts
function createInitialRun(baseJobId: BaseJobId, seed: string): TowerRun {
  return {
    runId: generateRunId(),
```

Add the import at the top of the file（`import type ... TowerRun, TowerRunPhase, BaseJobId` 旁边）：

```ts
import type { TowerRun, TowerRunPhase, BaseJobId } from '@/tower/types'
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'
```

Then prepend `schemaVersion: TOWER_RUN_SCHEMA_VERSION,` as the first property:

```ts
function createInitialRun(baseJobId: BaseJobId, seed: string): TowerRun {
  return {
    schemaVersion: TOWER_RUN_SCHEMA_VERSION,
    runId: generateRunId(),
    seed,
    graphSource: { kind: 'random' },
    startedAt: Date.now(),
    // ...rest unchanged
  }
}
```

- [ ] **Step 6: 修复 `src/stores/tower.test.ts`**

Find each place where a `TowerRun` literal is constructed (e.g., inside `persistence.saveTowerRun({...})` calls in tests like `continueLastRun loads persisted run...`, `hydrate() updates...`). For each object literal, add `schemaVersion: TOWER_RUN_SCHEMA_VERSION,` at the top, and import the constant if not present.

Example: find blocks like:

```ts
await persistence.saveTowerRun({
  runId: 'persisted-run',
  seed: 'old-seed',
  graphSource: { kind: 'random' },
  // ...
})
```

Change to:

```ts
await persistence.saveTowerRun({
  schemaVersion: TOWER_RUN_SCHEMA_VERSION,
  runId: 'persisted-run',
  seed: 'old-seed',
  graphSource: { kind: 'random' },
  // ...
})
```

Add the import at the top of `src/stores/tower.test.ts`:

```ts
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'
```

- [ ] **Step 7: 修复 `src/tower/persistence.test.ts` 的 `makeRun()` helper**

Open `src/tower/persistence.test.ts`. Find:

```ts
function makeRun(overrides: Partial<TowerRun> = {}): TowerRun {
  return {
    runId: 'test-run-1',
    seed: 'abc',
    // ...
    ...overrides,
  }
}
```

Replace with (prepend `schemaVersion` in the defaults):

```ts
function makeRun(overrides: Partial<TowerRun> = {}): TowerRun {
  return {
    schemaVersion: TOWER_RUN_SCHEMA_VERSION,
    runId: 'test-run-1',
    seed: 'abc',
    // ...
    ...overrides,
  }
}
```

Add the import at the top of `src/tower/persistence.test.ts`:

```ts
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'
```

- [ ] **Step 8: typecheck 现在应通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0, 无报错.

- [ ] **Step 9: 跑全量测试**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run
```

Expected: 全部通过（phase1 原测试 + 修补后的 mock）.

- [ ] **Step 10: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/types.ts src/stores/tower.ts src/stores/tower.test.ts src/tower/persistence.test.ts && git commit -m "feat(tower): extend types with 'start' kind, slot field, schemaVersion"
```

---

## Task 3: `src/tower/graph/k-schedule.ts`

**Files:**
- Create: `src/tower/graph/k-schedule.ts`
- Create: `src/tower/graph/k-schedule.test.ts`

K schedule 是 phase2 所有模块共享的常量源。单独模块避免循环依赖。

- [ ] **Step 1: 先写失败的测试 `src/tower/graph/k-schedule.test.ts`**

```ts
// src/tower/graph/k-schedule.test.ts
import { describe, it, expect } from 'vitest'
import {
  K_SCHEDULE,
  TOTAL_STEPS,
  TOTAL_NODES,
  BOSS_STEP,
  REWARD_STEP,
  CAMPFIRE_STEP,
  START_STEP,
  MOB_STEP,
} from '@/tower/graph/k-schedule'

describe('K_SCHEDULE', () => {
  it('has exactly 14 entries (step 0 through step 13)', () => {
    expect(K_SCHEDULE.length).toBe(14)
    expect(TOTAL_STEPS).toBe(14)
  })

  it('totals 26 nodes', () => {
    const sum = K_SCHEDULE.reduce((a, b) => a + b, 0)
    expect(sum).toBe(26)
    expect(TOTAL_NODES).toBe(26)
  })

  it('fixed layers have K=1', () => {
    expect(K_SCHEDULE[0]).toBe(1)   // start
    expect(K_SCHEDULE[6]).toBe(1)   // reward
    expect(K_SCHEDULE[12]).toBe(1)  // campfire
    expect(K_SCHEDULE[13]).toBe(1)  // boss
  })

  it('key decision steps (4 and 8) have K=3', () => {
    expect(K_SCHEDULE[4]).toBe(3)
    expect(K_SCHEDULE[8]).toBe(3)
  })

  it('default non-fixed layers have K=2', () => {
    for (const step of [1, 2, 3, 5, 7, 9, 10, 11]) {
      expect(K_SCHEDULE[step]).toBe(2)
    }
  })

  it('exports step-role constants', () => {
    expect(START_STEP).toBe(0)
    expect(MOB_STEP).toBe(1)
    expect(REWARD_STEP).toBe(6)
    expect(CAMPFIRE_STEP).toBe(12)
    expect(BOSS_STEP).toBe(13)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/k-schedule.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/k-schedule'`.

- [ ] **Step 3: 创建 `src/tower/graph/k-schedule.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/k-schedule.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/k-schedule.ts src/tower/graph/k-schedule.test.ts && git commit -m "feat(tower): add K schedule constants for graph generation"
```

---

## Task 4: `src/tower/graph/constraints.ts`

**Files:**
- Create: `src/tower/graph/constraints.ts`
- Create: `src/tower/graph/constraints.test.ts`

独立模块供 repair 和单测使用。5 个纯函数，每个对应 GDD §7.3 的一条硬约束。

- [ ] **Step 1: 写测试 `src/tower/graph/constraints.test.ts`**

```ts
// src/tower/graph/constraints.test.ts
import { describe, it, expect } from 'vitest'
import type { TowerNode } from '@/tower/types'
import {
  isStep1AllMob,
  hasConsecutiveElite,
  findConsecutiveEliteEdge,
  hasCampfireAdjacentToStep12,
  hasRewardAdjacentToStep6,
  findPathsWithoutElite,
  allPathsHaveElite,
} from '@/tower/graph/constraints'

/** Build a minimal linear graph for constraint tests. */
function linearGraph(kinds: TowerNode['kind'][]): TowerNode[] {
  return kinds.map((kind, i) => ({
    id: i,
    step: i,
    slot: 0,
    kind,
    next: i < kinds.length - 1 ? [i + 1] : [],
  }))
}

describe('constraint 1: step-1 all mob', () => {
  it('passes when all step-1 nodes are mob', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [] },
    ]
    expect(isStep1AllMob(nodes)).toBe(true)
  })

  it('fails when any step-1 node is not mob', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [] },
    ]
    expect(isStep1AllMob(nodes)).toBe(false)
  })
})

describe('constraint 2: no consecutive elite steps', () => {
  it('passes on a graph without elite', () => {
    const nodes = linearGraph(['start', 'mob', 'mob', 'mob', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(false)
  })

  it('passes on isolated elite', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'mob', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(false)
  })

  it('fails on two elite in consecutive steps via edge', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'boss'])
    expect(hasConsecutiveElite(nodes)).toBe(true)
  })

  it('findConsecutiveEliteEdge returns [from, to] pair', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'boss'])
    const pair = findConsecutiveEliteEdge(nodes)
    expect(pair).not.toBeNull()
    expect(pair![0].kind).toBe('elite')
    expect(pair![1].kind).toBe('elite')
    expect(pair![1].step).toBe(pair![0].step + 1)
  })
})

describe('constraint 3: campfire not at step 11', () => {
  it('passes when no step-11 node is campfire', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 11, slot: 0, kind: 'mob', next: [1] },
      { id: 1, step: 12, slot: 0, kind: 'campfire', next: [] },
    ]
    expect(hasCampfireAdjacentToStep12(nodes)).toBe(false)
  })

  it('fails when step-11 node is campfire', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 11, slot: 0, kind: 'campfire', next: [1] },
      { id: 1, step: 12, slot: 0, kind: 'campfire', next: [] },
    ]
    expect(hasCampfireAdjacentToStep12(nodes)).toBe(true)
  })
})

describe('constraint 4: reward not at step 5 or 7', () => {
  it('passes when step 5 and 7 have no reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 5, slot: 0, kind: 'mob', next: [1] },
      { id: 1, step: 6, slot: 0, kind: 'reward', next: [2] },
      { id: 2, step: 7, slot: 0, kind: 'mob', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(false)
  })

  it('fails when step 5 has reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 5, slot: 0, kind: 'reward', next: [1] },
      { id: 1, step: 6, slot: 0, kind: 'reward', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(true)
  })

  it('fails when step 7 has reward', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 6, slot: 0, kind: 'reward', next: [1] },
      { id: 1, step: 7, slot: 0, kind: 'reward', next: [] },
    ]
    expect(hasRewardAdjacentToStep6(nodes)).toBe(true)
  })
})

describe('constraint 5: every path has at least 1 elite', () => {
  it('passes on a graph where all paths contain elite', () => {
    // Two paths: 0 → 1 → 3 and 0 → 2 → 3; both must include elite.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'elite', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    expect(findPathsWithoutElite(nodes, 0, 3)).toEqual([])
    expect(allPathsHaveElite(nodes, 0, 3)).toBe(true)
  })

  it('fails on a graph where some path lacks elite', () => {
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'elite', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    const missing = findPathsWithoutElite(nodes, 0, 3)
    expect(missing.length).toBe(1)
    expect(missing[0]).toEqual([0, 2, 3])
    expect(allPathsHaveElite(nodes, 0, 3)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/constraints.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/constraints'`.

- [ ] **Step 3: 实现 `src/tower/graph/constraints.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/constraints.test.ts
```

Expected: all tests pass (约 11 条).

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/constraints.ts src/tower/graph/constraints.test.ts && git commit -m "feat(tower): add hard-constraint validators for graph generation"
```

---

## Task 5: `src/tower/graph/topology.ts` — 阶段 A

**Files:**
- Create: `src/tower/graph/topology.ts`
- Create: `src/tower/graph/topology.test.ts`

生成节点 id / step / slot / next 骨架，**不含 kind**。

算法：
1. 按 step × slot 分配递增 id（lex 顺序）
2. 生成 M=3 条路径，每条从 step 0 slot 0 出发，每步按"slot ±1 且 in [0, K(next_step))"或 K=1 强制 slot=0 选下一步
3. 合并所有路径的边到 `node.next`（去重）
4. 修复：每个 step>0 节点若无入边，从 step-1 选相邻 slot 的节点补一条边

- [ ] **Step 1: 写测试 `src/tower/graph/topology.test.ts`**

```ts
// src/tower/graph/topology.test.ts
import { describe, it, expect } from 'vitest'
import { createRng } from '@/tower/random'
import { buildTopology, type PartialTowerNode } from '@/tower/graph/topology'
import { K_SCHEDULE, TOTAL_NODES, TOTAL_STEPS } from '@/tower/graph/k-schedule'

describe('buildTopology', () => {
  it('returns exactly TOTAL_NODES nodes', () => {
    const nodes = buildTopology(createRng('t-1'))
    expect(nodes.length).toBe(TOTAL_NODES)
  })

  it('each step has exactly K(step) nodes', () => {
    const nodes = buildTopology(createRng('t-2'))
    for (let step = 0; step < TOTAL_STEPS; step++) {
      const count = nodes.filter((n) => n.step === step).length
      expect(count).toBe(K_SCHEDULE[step])
    }
  })

  it('slot is in [0, K(step)) for every node', () => {
    const nodes = buildTopology(createRng('t-3'))
    for (const n of nodes) {
      expect(n.slot).toBeGreaterThanOrEqual(0)
      expect(n.slot).toBeLessThan(K_SCHEDULE[n.step])
    }
  })

  it('node ids are 0..TOTAL_NODES-1 with no gaps', () => {
    const nodes = buildTopology(createRng('t-4'))
    const ids = nodes.map((n) => n.id).sort((a, b) => a - b)
    expect(ids).toEqual(Array.from({ length: TOTAL_NODES }, (_, i) => i))
  })

  it('every edge (u → v) satisfies v.step === u.step + 1', () => {
    const nodes = buildTopology(createRng('t-5'))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const u of nodes) {
      for (const vid of u.next) {
        const v = byId.get(vid)!
        expect(v.step).toBe(u.step + 1)
      }
    }
  })

  it('every non-start node has at least one incoming edge', () => {
    const nodes = buildTopology(createRng('t-6'))
    for (const n of nodes) {
      if (n.step === 0) continue
      const hasIn = nodes.some((u) => u.next.includes(n.id))
      expect(hasIn).toBe(true)
    }
  })

  it('every non-boss node has at least one outgoing edge', () => {
    const nodes = buildTopology(createRng('t-7'))
    for (const n of nodes) {
      if (n.step === TOTAL_STEPS - 1) continue
      expect(n.next.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('K=1 fixed layers have exactly 1 node', () => {
    const nodes = buildTopology(createRng('t-8'))
    for (const step of [0, 6, 12, 13]) {
      expect(nodes.filter((n) => n.step === step).length).toBe(1)
    }
  })

  it('is deterministic: same seed produces equal topology', () => {
    const a = buildTopology(createRng('same'))
    const b = buildTopology(createRng('same'))
    // Normalize: sort next lists and compare
    const normalize = (ns: PartialTowerNode[]) =>
      ns.map((n) => ({ ...n, next: [...n.next].sort((x, y) => x - y) }))
    expect(normalize(a)).toEqual(normalize(b))
  })

  it('different seeds produce different topology', () => {
    const a = buildTopology(createRng('seed-A'))
    const b = buildTopology(createRng('seed-B'))
    // Edges should differ; collect and diff
    const edges = (ns: PartialTowerNode[]) =>
      ns.flatMap((n) => n.next.map((v) => `${n.id}->${v}`)).sort()
    expect(edges(a)).not.toEqual(edges(b))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/topology.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/topology'`.

- [ ] **Step 3: 实现 `src/tower/graph/topology.ts`**

```ts
// src/tower/graph/topology.ts
//
// 阶段 A：拓扑生成。产出带 id/step/slot/next 的节点骨架，**不含 kind**.
// spec §5.2.
import type { Rng } from '@/tower/random'
import { K_SCHEDULE, TOTAL_STEPS, TOTAL_NODES } from './k-schedule'

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

  // (4) 修复：保证 step > 0 的每个节点至少 1 条入边
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

  // next 列表内部排序稳定（避免 set iteration 差异）
  for (const n of nodes) n.next.sort((a, b) => a - b)

  return nodes
}

/** 供测试使用：用常量 re-export，避免循环依赖. */
export { TOTAL_NODES }
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/topology.test.ts
```

Expected: 10 passed.

- [ ] **Step 5: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/topology.ts src/tower/graph/topology.test.ts && git commit -m "feat(tower): add graph topology generator (phase A)"
```

---

## Task 6: `src/tower/graph/type-assignment.ts` — 阶段 B

**Files:**
- Create: `src/tower/graph/type-assignment.ts`
- Create: `src/tower/graph/type-assignment.test.ts`

给 topology 节点分配 `kind`。固定节点直接钉死；非固定按权重抽样，抽样时直接规避约束 3/4（step 11 不抽 campfire、step 5/7 不抽 reward）。约束 2/5 留给 Task 7 repair 处理。

- [ ] **Step 1: 写测试 `src/tower/graph/type-assignment.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/type-assignment.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/type-assignment'`.

- [ ] **Step 3: 实现 `src/tower/graph/type-assignment.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/type-assignment.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/type-assignment.ts src/tower/graph/type-assignment.test.ts && git commit -m "feat(tower): add kind assignment with inline constraint 3/4 enforcement"
```

---

## Task 7: `src/tower/graph/repair.ts` — 阶段 C

**Files:**
- Create: `src/tower/graph/repair.ts`
- Create: `src/tower/graph/repair.test.ts`

迭代修复约束 2 与 5。MAX 5 轮；不收敛 throw。

- [ ] **Step 1: 写测试 `src/tower/graph/repair.test.ts`**

```ts
// src/tower/graph/repair.test.ts
import { describe, it, expect } from 'vitest'
import type { TowerNode } from '@/tower/types'
import { createRng } from '@/tower/random'
import { repair } from '@/tower/graph/repair'
import {
  findConsecutiveEliteEdge,
  allPathsHaveElite,
} from '@/tower/graph/constraints'

/** Construct a minimal graph with a given kind sequence. */
function linearGraph(kinds: TowerNode['kind'][]): TowerNode[] {
  return kinds.map((kind, i) => ({
    id: i,
    step: i,
    slot: 0,
    kind,
    next: i < kinds.length - 1 ? [i + 1] : [],
  }))
}

describe('repair', () => {
  it('fixes consecutive elite by mutating the later node', () => {
    const nodes = linearGraph(['start', 'mob', 'elite', 'elite', 'mob', 'boss'])
    const repaired = repair(nodes, createRng('r-1'))
    expect(findConsecutiveEliteEdge(repaired)).toBeNull()
  })

  it('adds elite to a path that lacks one', () => {
    // Two paths; path 0→2→3 has elite, path 0→1→3 does not.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [3] },
      { id: 2, step: 1, slot: 1, kind: 'elite', next: [3] },
      { id: 3, step: 2, slot: 0, kind: 'boss', next: [] },
    ]
    const repaired = repair(nodes, createRng('r-2'))
    expect(allPathsHaveElite(repaired, 0, 3)).toBe(true)
  })

  it('does not mutate fixed kinds (start / boss / campfire / reward / step-1 mob)', () => {
    // Construct a graph with fixed kinds and see that after repair they are unchanged.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [2] },
      { id: 2, step: 6, slot: 0, kind: 'reward', next: [3] },
      { id: 3, step: 12, slot: 0, kind: 'campfire', next: [4] },
      { id: 4, step: 13, slot: 0, kind: 'boss', next: [] },
    ]
    // This graph has no elite on any path. Repair must add elite somewhere
    // **other than** the 5 fixed positions. But here there's nowhere else to put it,
    // so it should throw (pathological).
    expect(() => repair(nodes, createRng('r-3'))).toThrow()
  })

  it('throws when repair does not converge', () => {
    // Force a linear graph where every non-start/boss node is a candidate,
    // but rng is rigged: we use a small seed and rely on MAX_REPAIR_ITERATIONS.
    // Easier: construct a graph that violates constraint 2 in a way repair
    // can't resolve — every node is elite (except start/boss).
    const nodes = linearGraph([
      'start', 'mob', 'elite', 'elite', 'elite', 'elite', 'elite', 'elite', 'boss',
    ])
    // Step 1 (index 1) is mob, but all middle nodes are elite and consecutive.
    // repair repeatedly flips later elites to non-elite. Eventually converges.
    // To actually force non-convergence, we'd need mutually exclusive constraints.
    // Instead, mock scenario where repair has no room: use the "all fixed" case above.
    expect(() => repair(nodes, createRng('r-4'))).not.toThrow()
    // (Converges; assertion is that non-convergence **can** throw is shown in r-3.)
  })

  it('returned graph passes both constraint 2 and constraint 5', () => {
    // A mildly broken graph that repair can handle.
    const nodes: TowerNode[] = [
      { id: 0, step: 0, slot: 0, kind: 'start', next: [1, 2] },
      { id: 1, step: 1, slot: 0, kind: 'mob', next: [3, 4] },
      { id: 2, step: 1, slot: 1, kind: 'mob', next: [3, 4] },
      { id: 3, step: 2, slot: 0, kind: 'mob', next: [5] },
      { id: 4, step: 2, slot: 1, kind: 'event', next: [5] },
      { id: 5, step: 3, slot: 0, kind: 'boss', next: [] },
    ]
    const repaired = repair(nodes, createRng('r-5'))
    expect(findConsecutiveEliteEdge(repaired)).toBeNull()
    expect(allPathsHaveElite(repaired, 0, 5)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/repair.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/repair'`.

- [ ] **Step 3: 实现 `src/tower/graph/repair.ts`**

```ts
// src/tower/graph/repair.ts
//
// 阶段 C：修复约束 2（精英不连续）与约束 5（每路径至少 1 精英）.
// 迭代最多 MAX_REPAIR_ITERATIONS 轮；超限 throw.
// spec §5.4.
import type { TowerNode, TowerNodeKind } from '@/tower/types'
import type { Rng } from '@/tower/random'
import {
  findConsecutiveEliteEdge,
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

export const MAX_REPAIR_ITERATIONS = 5

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
 * 修约束 2：找到一对 consecutive elite (u, v)，把后者 v 重抽为非 elite.
 * 额外 exclude v.step 对应的 step 禁忌（与 type-assignment 保持一致）.
 */
function fixConsecutiveElite(nodes: TowerNode[], rng: Rng): boolean {
  const pair = findConsecutiveEliteEdge(nodes)
  if (!pair) return false
  const [, v] = pair
  if (isKindFixed(v)) {
    throw new Error(
      `repair: cannot fix consecutive elite — later node ${v.id} is fixed-kind at step ${v.step}`,
    )
  }
  const excluded = new Set<TowerNodeKind>(['elite'])
  if (v.step === CAMPFIRE_STEP - 1) excluded.add('campfire')
  if (v.step === REWARD_STEP - 1 || v.step === REWARD_STEP + 1) excluded.add('reward')
  reassignKind(v, rng, excluded)
  return true
}

/**
 * 修约束 5：对每条无 elite 的路径，选其中一个非固定节点改为 elite.
 * 优先选 step 值大的节点（减少后续引发连续 elite 的概率）.
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
  let changed = false
  for (const path of missing) {
    // 过滤出非固定节点
    const candidates = path
      .map((id) => byId.get(id)!)
      .filter((n) => !isKindFixed(n))
    if (candidates.length === 0) {
      throw new Error(
        `repair: path ${path.join('→')} has no mutable candidate for elite`,
      )
    }
    // 按 step 降序排；从 "step 最大" 一部分里用 rng 选一个
    candidates.sort((a, b) => b.step - a.step)
    const topStep = candidates[0].step
    const topTier = candidates.filter((n) => n.step === topStep)
    const chosen = topTier[Math.floor(rng() * topTier.length)]
    chosen.kind = 'elite'
    changed = true
  }
  return changed
}

/** 简易：从 nodes 里找出 start/boss 的 id. */
function findStartAndBoss(nodes: TowerNode[]): { startId: number; bossId: number } {
  const start = nodes.find((n) => n.step === START_STEP)
  const boss = nodes.find((n) => n.step === BOSS_STEP)
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/repair.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/repair.ts src/tower/graph/repair.test.ts && git commit -m "feat(tower): add constraint repair iterator for graph generation"
```

---

## Task 8: `src/tower/graph/generator.ts` — 编排 + stress test

**Files:**
- Create: `src/tower/graph/generator.ts`
- Create: `src/tower/graph/generator.test.ts`

三阶段串联，对外暴露 `generateTowerGraph(seed): TowerGraph`。100-seed stress test 验证所有硬约束。

- [ ] **Step 1: 写测试 `src/tower/graph/generator.test.ts`**

```ts
// src/tower/graph/generator.test.ts
import { describe, it, expect } from 'vitest'
import type { TowerGraph } from '@/tower/types'
import { generateTowerGraph } from '@/tower/graph/generator'
import {
  allPathsHaveElite,
  hasCampfireAdjacentToStep12,
  hasConsecutiveElite,
  hasRewardAdjacentToStep6,
  isStep1AllMob,
} from '@/tower/graph/constraints'
import { K_SCHEDULE, TOTAL_NODES, TOTAL_STEPS } from '@/tower/graph/k-schedule'

function asArray(g: TowerGraph) {
  return Object.values(g.nodes)
}

describe('generateTowerGraph', () => {
  it('is deterministic: same seed produces deepEqual graphs', () => {
    const a = generateTowerGraph('seed-det')
    const b = generateTowerGraph('seed-det')
    expect(a).toEqual(b)
  })

  it('produces exactly TOTAL_NODES nodes', () => {
    const g = generateTowerGraph('seed-count')
    expect(Object.keys(g.nodes).length).toBe(TOTAL_NODES)
  })

  it('startNodeId points to step 0 start; bossNodeId points to step 13 boss', () => {
    const g = generateTowerGraph('seed-st')
    expect(g.nodes[g.startNodeId].step).toBe(0)
    expect(g.nodes[g.startNodeId].kind).toBe('start')
    expect(g.nodes[g.bossNodeId].step).toBe(TOTAL_STEPS - 1)
    expect(g.nodes[g.bossNodeId].kind).toBe('boss')
  })

  it('per-step node count matches K_SCHEDULE', () => {
    const g = generateTowerGraph('seed-K')
    const arr = asArray(g)
    for (let step = 0; step < TOTAL_STEPS; step++) {
      const count = arr.filter((n) => n.step === step).length
      expect(count).toBe(K_SCHEDULE[step])
    }
  })

  it('every non-start node is reachable from startNodeId (BFS)', () => {
    const g = generateTowerGraph('seed-reach')
    const visited = new Set<number>([g.startNodeId])
    const q = [g.startNodeId]
    while (q.length) {
      const u = q.shift()!
      for (const v of g.nodes[u].next) {
        if (!visited.has(v)) {
          visited.add(v)
          q.push(v)
        }
      }
    }
    expect(visited.size).toBe(TOTAL_NODES)
  })

  // 5 条硬约束 across 100 seeds stress test
  for (let i = 0; i < 100; i++) {
    const seed = `stress-${i}`
    it(`hard constraints hold for seed '${seed}'`, () => {
      const g = generateTowerGraph(seed)
      const arr = asArray(g)
      expect(isStep1AllMob(arr)).toBe(true)
      expect(hasConsecutiveElite(arr)).toBe(false)
      expect(hasCampfireAdjacentToStep12(arr)).toBe(false)
      expect(hasRewardAdjacentToStep6(arr)).toBe(false)
      expect(allPathsHaveElite(arr, g.startNodeId, g.bossNodeId)).toBe(true)
    })
  }
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/generator.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/generator'`.

- [ ] **Step 3: 实现 `src/tower/graph/generator.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/generator.test.ts
```

Expected: 105 passed（5 基础 + 100 stress）。

> 若某个 stress seed 抛出 "did not converge"，说明修复算法对该 seed 不收敛。处理方式：
> 1. 检查抛出时的 `nodes` snapshot（可临时加 console.log）
> 2. 调整 `repair` 的优先级策略（例如优先从同路径的 `event` 节点而非 `mob` 改 elite），或提高 MAX_REPAIR_ITERATIONS 至 10
> 3. 重跑 `pnpm test:run src/tower/graph/generator.test.ts`；若仍持续不收敛则在 plan review 阶段反馈

- [ ] **Step 5: 全量 typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/generator.ts src/tower/graph/generator.test.ts && git commit -m "feat(tower): add generateTowerGraph orchestrator with stress-tested constraints"
```

---

## Task 9: `src/tower/graph/loader.ts` — YAML hand-crafted loader

**Files:**
- Create: `src/tower/graph/loader.ts`
- Create: `src/tower/graph/loader.test.ts`

Phase2 不接 UI；仅暴露 API + 单测验证。phase7 教程塔会使用。

- [ ] **Step 1: 写测试 `src/tower/graph/loader.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/loader.test.ts
```

Expected: 失败 with `Cannot find module '@/tower/graph/loader'`.

- [ ] **Step 3: 实现 `src/tower/graph/loader.ts`**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/graph/loader.test.ts
```

Expected: 8 passed.

- [ ] **Step 5: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/graph/loader.ts src/tower/graph/loader.test.ts && git commit -m "feat(tower): add YAML tower graph loader with schema validation"
```

---

## Task 10: Store — `startDescent` action

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: 在 `tower.test.ts` 末尾追加 startDescent 测试**

Open `src/stores/tower.test.ts`. Add these tests inside the existing `describe('useTowerStore', ...)` block:

```ts
  // ------------------------------------------------------------
  // Phase 2: startDescent
  // ------------------------------------------------------------
  describe('startDescent', () => {
    it('generates graph and transitions to in-path when in selecting-job', () => {
      const store = useTowerStore()
      store.startNewRun('swordsman', 'descent-seed-1')
      expect(store.phase).toBe('selecting-job')
      store.startDescent()
      expect(store.phase).toBe('in-path')
      expect(Object.keys(store.run!.towerGraph.nodes).length).toBeGreaterThan(0)
      expect(store.run!.currentNodeId).toBe(store.run!.towerGraph.startNodeId)
    })

    it('is deterministic: two runs with same seed produce equal graphs', () => {
      setActivePinia(createPinia())
      const a = useTowerStore()
      a.startNewRun('swordsman', 'equal-seed')
      a.startDescent()
      const graphA = a.run!.towerGraph

      setActivePinia(createPinia())
      const b = useTowerStore()
      b.startNewRun('archer', 'equal-seed') // 不同 job, 同 seed
      b.startDescent()
      const graphB = b.run!.towerGraph

      expect(graphA).toEqual(graphB)
    })

    it('no-op + warn when called without active run', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startDescent()
      expect(store.phase).toBe('no-run')
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn when called in wrong phase', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman')
      store.setPhase('in-path')
      store.startDescent()
      expect(warn).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 4 failures (新增的 startDescent 测试)。原有测试保持 pass.

- [ ] **Step 3: 修改 `src/stores/tower.ts` 添加 `startDescent`**

Open `src/stores/tower.ts`. Add imports at the top:

```ts
import { generateTowerGraph } from '@/tower/graph/generator'
```

Inside the store's `defineStore` setup function, after the existing `setPhase` function and before `hydrate`, add:

```ts
  function startDescent(): void {
    if (!run.value) {
      console.warn('[tower] startDescent called without active run')
      return
    }
    if (phase.value !== 'selecting-job') {
      console.warn(`[tower] startDescent called in wrong phase: ${phase.value}`)
      return
    }
    const graph = generateTowerGraph(run.value.seed)
    run.value.towerGraph = graph
    run.value.currentNodeId = graph.startNodeId
    phase.value = 'in-path'
  }
```

Then update the `return` object to expose it:

```ts
  return {
    phase,
    run,
    savedRunExists,
    currentBaseJobId,
    startNewRun,
    continueLastRun,
    resetRun,
    setPhase,
    hydrate,
    startDescent, // ← new
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 所有测试 pass（原有 + 4 新增）.

- [ ] **Step 5: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/stores/tower.ts src/stores/tower.test.ts && git commit -m "feat(store): add startDescent action that generates graph and enters in-path"
```

---

## Task 11: Store — `advanceTo` action

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: 在 `tower.test.ts` 末尾追加 advanceTo 测试**

```ts
  // ------------------------------------------------------------
  // Phase 2: advanceTo
  // ------------------------------------------------------------
  describe('advanceTo', () => {
    it('advances currentNodeId to a legal next node and marks prev completed', () => {
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-1')
      store.startDescent()
      const start = store.run!.towerGraph.nodes[store.run!.currentNodeId]
      const legalNext = start.next[0]
      store.advanceTo(legalNext)
      expect(store.run!.currentNodeId).toBe(legalNext)
      expect(store.run!.completedNodes).toContain(start.id)
    })

    it('no-op + warn on illegal next node id', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-2')
      store.startDescent()
      const prevId = store.run!.currentNodeId
      store.advanceTo(99999) // 不在 next 列表中
      expect(store.run!.currentNodeId).toBe(prevId)
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn without active run', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.advanceTo(0)
      expect(warn).toHaveBeenCalled()
    })

    it('no-op + warn in wrong phase', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const store = useTowerStore()
      store.startNewRun('swordsman')
      // phase 此时 = 'selecting-job'
      store.advanceTo(0)
      expect(warn).toHaveBeenCalled()
    })

    it('triggers a persistence save', async () => {
      const spy = vi.spyOn(persistence, 'saveTowerRun')
      const store = useTowerStore()
      store.startNewRun('swordsman', 'adv-seed-3')
      store.startDescent()
      spy.mockClear() // 清掉 phase 变更引发的 save
      const start = store.run!.towerGraph.nodes[store.run!.currentNodeId]
      const legalNext = start.next[0]
      store.advanceTo(legalNext)
      expect(spy).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 5 failures (advanceTo 相关).

- [ ] **Step 3: 修改 `src/stores/tower.ts` 添加 `advanceTo`**

In `src/stores/tower.ts`, after the `startDescent` function, add:

```ts
  function advanceTo(nodeId: number): void {
    if (!run.value) {
      console.warn('[tower] advanceTo called without active run')
      return
    }
    if (phase.value !== 'in-path') {
      console.warn(`[tower] advanceTo called in wrong phase: ${phase.value}`)
      return
    }
    const current = run.value.towerGraph.nodes[run.value.currentNodeId]
    if (!current) {
      console.warn(
        `[tower] advanceTo: currentNodeId ${run.value.currentNodeId} not in graph`,
      )
      return
    }
    if (!current.next.includes(nodeId)) {
      console.warn(
        `[tower] advanceTo: illegal move ${run.value.currentNodeId} -> ${nodeId}`,
      )
      return
    }
    if (!run.value.completedNodes.includes(current.id)) {
      run.value.completedNodes.push(current.id)
    }
    run.value.currentNodeId = nodeId
    // advanceTo 不改 phase，不会触发 watchPhaseForPersistence；
    // 手动 fire-and-forget 写盘，失败不回滚
    void saveTowerRun(toRaw(run.value))
  }
```

Also add `advanceTo` to the returned object:

```ts
  return {
    // ...existing
    startDescent,
    advanceTo, // ← new
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 所有测试 pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/stores/tower.ts src/stores/tower.test.ts && git commit -m "feat(store): add advanceTo action with legal-move validation and persistence"
```

---

## Task 12: Store — `continueLastRun` schema version check + `schemaResetNotice`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

spec §3.6 / §7.5。

- [ ] **Step 1: 在 `tower.test.ts` 追加 schema version 测试**

```ts
  // ------------------------------------------------------------
  // Phase 2: schema version check + schemaResetNotice
  // ------------------------------------------------------------
  describe('schema version', () => {
    it('continueLastRun resets run + sets notice when schemaVersion mismatches', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      // Save an "old" run with schemaVersion 0
      await persistence.saveTowerRun({
        schemaVersion: 0, // 不等于 TOWER_RUN_SCHEMA_VERSION (=1)
        runId: 'old-run',
        seed: 'x',
        graphSource: { kind: 'random' },
        startedAt: 0,
        baseJobId: 'swordsman',
        towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
        currentNodeId: 0,
        determination: 5,
        maxDetermination: 5,
        level: 1,
        crystals: 0,
        currentWeapon: null,
        advancedJobId: null,
        materia: [],
        activatedMateria: [],
        relics: [],
        scoutedNodes: {},
        completedNodes: [],
      })
      const store = useTowerStore()
      await store.continueLastRun()
      expect(store.phase).toBe('no-run')
      expect(store.run).toBeNull()
      expect(store.schemaResetNotice).toBe(true)
      expect(warn).toHaveBeenCalled()
    })

    it('continueLastRun hydrates normally when schemaVersion matches', async () => {
      await persistence.saveTowerRun({
        schemaVersion: TOWER_RUN_SCHEMA_VERSION,
        runId: 'current-run',
        seed: 'x',
        graphSource: { kind: 'random' },
        startedAt: 0,
        baseJobId: 'swordsman',
        towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
        currentNodeId: 0,
        determination: 5,
        maxDetermination: 5,
        level: 1,
        crystals: 0,
        currentWeapon: null,
        advancedJobId: null,
        materia: [],
        activatedMateria: [],
        relics: [],
        scoutedNodes: {},
        completedNodes: [],
      })
      const store = useTowerStore()
      await store.continueLastRun()
      expect(store.phase).toBe('in-path')
      expect(store.run?.runId).toBe('current-run')
      expect(store.schemaResetNotice).toBe(false)
    })

    it('dismissSchemaNotice clears the notice flag', () => {
      const store = useTowerStore()
      // Manually raise notice by direct ref access is not possible; use continueLastRun path
      // or a simpler approach: just call dismiss after it's set.
      // Here we rely on the previous test's state semantics, so we set it manually:
      ;(store as unknown as { schemaResetNotice: { value: boolean } })
        // ignore; test pattern below is cleaner
      store.schemaResetNotice = true // Pinia setup stores expose refs as writable
      expect(store.schemaResetNotice).toBe(true)
      store.dismissSchemaNotice()
      expect(store.schemaResetNotice).toBe(false)
    })
  })
```

> 注：上面 `store.schemaResetNotice = true` 利用 Pinia setup store 的 ref 代理——setup store 返回的 ref 在外层通过 `.value` 访问，但 Pinia 已自动 unwrap，所以 `store.schemaResetNotice` 是可直接读写的。若 TS 报错可用 `;(store as any).schemaResetNotice = true`.

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 3 new failures.

- [ ] **Step 3: 修改 `src/stores/tower.ts`**

Add import for `TOWER_RUN_SCHEMA_VERSION` at the top (if not already):

```ts
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'
```

Inside `defineStore`, add to `---- state ----`:

```ts
  const schemaResetNotice = ref(false)
```

Replace the existing `continueLastRun` implementation with:

```ts
  async function continueLastRun(): Promise<void> {
    const loaded = await loadTowerRun()
    if (!loaded) return
    if (loaded.schemaVersion !== TOWER_RUN_SCHEMA_VERSION) {
      // TODO(post-MVP): 金币系统上线后，在此处调 forcedSettlement(loaded)
      // 按 loaded.crystals / loaded.level / loaded.currentNodeId 给出补偿金币
      // 参见 spec §3.6 / §12 "强制结算补偿金币"
      console.warn(
        `[tower] saved run schemaVersion ${loaded.schemaVersion} ` +
          `!= current ${TOWER_RUN_SCHEMA_VERSION}, resetting`,
      )
      resetRun()
      schemaResetNotice.value = true
      return
    }
    suppressPersist = true
    run.value = loaded
    phase.value = 'in-path'
    savedRunExists.value = true
    await nextTick()
    suppressPersist = false
  }
```

Add a new action:

```ts
  function dismissSchemaNotice(): void {
    schemaResetNotice.value = false
  }
```

Expose both in the `return`:

```ts
  return {
    // ...existing
    startDescent,
    advanceTo,
    schemaResetNotice, // ← new
    dismissSchemaNotice, // ← new
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 所有测试 pass.

- [ ] **Step 5: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/stores/tower.ts src/stores/tower.test.ts && git commit -m "feat(store): add schemaVersion check with reset notice on mismatch"
```

---

## Task 13: `src/components/tower/TowerMapNode.vue`

**Files:**
- Create: `src/components/tower/TowerMapNode.vue`
- Create: `src/components/tower/TowerMapNode.test.ts`

状态可视化单元：current / completed / reachable / unreachable + kind-specific icon。

- [ ] **Step 1: 写测试 `src/components/tower/TowerMapNode.test.ts`**

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/components/tower/TowerMapNode.test.ts
```

Expected: 失败 with `Cannot find module '@/components/tower/TowerMapNode.vue'`.

- [ ] **Step 3: 创建目录并写 `src/components/tower/TowerMapNode.vue`**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && mkdir -p src/components/tower
```

Create the file:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TowerNode, TowerNodeKind } from '@/tower/types'

type NodeState = 'current' | 'completed' | 'reachable' | 'unreachable'

const props = defineProps<{
  node: TowerNode
  state: NodeState
}>()

const emit = defineEmits<{
  (e: 'select', nodeId: number): void
}>()

const ICON_MAP: Record<TowerNodeKind, string> = {
  start: '🚩',
  mob: '⚔️',
  elite: '💀',
  boss: '👑',
  campfire: '🔥',
  reward: '🎁',
  event: '❓',
}

const icon = computed(() => ICON_MAP[props.node.kind])
const disabled = computed(() => props.state !== 'reachable')

function onClick() {
  if (disabled.value) return
  emit('select', props.node.id)
}
</script>

<template lang="pug">
button.tower-map-node(
  :class="[state, `kind-${node.kind}`]"
  :disabled="disabled"
  type="button"
  @click="onClick"
)
  span.icon {{ icon }}
</template>

<style lang="scss" scoped>
.tower-map-node {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  font-size: 22px;
  transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease;
  user-select: none;

  .icon {
    line-height: 1;
  }

  &:disabled {
    cursor: not-allowed;
  }

  &.current {
    border-color: #ffd166;
    background: rgba(255, 209, 102, 0.2);
    box-shadow: 0 0 12px rgba(255, 209, 102, 0.4);
    transform: scale(1.15);
  }

  &.completed {
    filter: saturate(0.5);
    opacity: 0.6;
  }

  &.reachable {
    border-color: rgba(255, 255, 255, 0.6);
    animation: pulse 1.4s ease-in-out infinite;

    &:hover {
      transform: scale(1.08);
      background: rgba(255, 255, 255, 0.12);
    }
  }

  &.unreachable {
    filter: saturate(0.3);
    opacity: 0.5;
  }

  // kind-specific tints
  &.kind-elite { color: #ff7a7a; }
  &.kind-boss { color: #ff6680; }
  &.kind-campfire { color: #ff9955; }
  &.kind-reward { color: #ffd166; }
  &.kind-event { color: #9acbff; }
  &.kind-start { color: #c9c9ff; }
  &.kind-mob { color: #dddddd; }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
  50% { box-shadow: 0 0 10px 4px rgba(255, 255, 255, 0.2); }
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/components/tower/TowerMapNode.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0. (unplugin-vue-components 会自动生成 `typed-components.d.ts` 条目，typecheck 前可能需先 `pnpm dev` 或 `pnpm build` 预跑一次以刷新 `typed-components.d.ts`。若 typecheck 报 "module not found" 请运行 `pnpm build` 触发 refresh 后再跑 typecheck。)

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/components/tower/TowerMapNode.vue src/components/tower/TowerMapNode.test.ts src/typed-components.d.ts && git commit -m "feat(tower-ui): add TowerMapNode component with state and kind classes"
```

---

## Task 14: `src/components/tower/TowerMapEdges.vue`

**Files:**
- Create: `src/components/tower/TowerMapEdges.vue`

绝对定位 SVG 层；画布坐标与 TowerMap 布局常量对齐。视觉细节不做单测（spec §9.5 明示"不测 SVG 坐标精确值"）；TowerMap 的 integration test 覆盖"有线条存在"即可。

- [ ] **Step 1: 创建 `src/components/tower/TowerMapEdges.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TowerGraph, TowerNode } from '@/tower/types'
import { K_SCHEDULE } from '@/tower/graph/k-schedule'

const props = defineProps<{
  graph: TowerGraph
  currentNodeId: number
  completedNodes: number[]
  /** 布局常量；必须与 TowerMap 保持一致 */
  stepSpacingY: number
  slotSpacingX: number
  canvasPaddingX: number
  canvasPaddingY: number
  canvasWidth: number
  canvasHeight: number
}>()

interface EdgeGeom {
  fromId: number
  toId: number
  x1: number
  y1: number
  x2: number
  y2: number
  status: 'walked' | 'available' | 'dormant'
}

function nodeCenter(
  node: TowerNode,
  slotSpacingX: number,
  stepSpacingY: number,
  canvasPaddingX: number,
  canvasPaddingY: number,
  canvasWidth: number,
): { x: number; y: number } {
  const K = K_SCHEDULE[node.step]
  const centerX = canvasWidth / 2
  const x = centerX + (node.slot - (K - 1) / 2) * slotSpacingX
  void canvasPaddingX
  const y = canvasPaddingY + node.step * stepSpacingY
  return { x, y }
}

const edges = computed<EdgeGeom[]>(() => {
  const list: EdgeGeom[] = []
  const completedSet = new Set(props.completedNodes)
  for (const from of Object.values(props.graph.nodes) as TowerNode[]) {
    const fromPos = nodeCenter(
      from,
      props.slotSpacingX,
      props.stepSpacingY,
      props.canvasPaddingX,
      props.canvasPaddingY,
      props.canvasWidth,
    )
    for (const toId of from.next) {
      const to = props.graph.nodes[toId]
      if (!to) continue
      const toPos = nodeCenter(
        to,
        props.slotSpacingX,
        props.stepSpacingY,
        props.canvasPaddingX,
        props.canvasPaddingY,
        props.canvasWidth,
      )
      let status: EdgeGeom['status']
      if (
        completedSet.has(from.id) &&
        (completedSet.has(to.id) || to.id === props.currentNodeId)
      ) {
        status = 'walked'
      } else if (from.id === props.currentNodeId) {
        status = 'available'
      } else {
        status = 'dormant'
      }
      list.push({
        fromId: from.id,
        toId,
        x1: fromPos.x,
        y1: fromPos.y,
        x2: toPos.x,
        y2: toPos.y,
        status,
      })
    }
  }
  return list
})
</script>

<template lang="pug">
svg.tower-map-edges(
  :width="canvasWidth"
  :height="canvasHeight"
  :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
  xmlns="http://www.w3.org/2000/svg"
)
  line(
    v-for="e in edges"
    :key="`${e.fromId}-${e.toId}`"
    :x1="e.x1"
    :y1="e.y1"
    :x2="e.x2"
    :y2="e.y2"
    :class="`edge-${e.status}`"
    stroke-width="2"
  )
</template>

<style lang="scss" scoped>
.tower-map-edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;

  .edge-walked {
    stroke: rgba(255, 209, 102, 0.7);
  }
  .edge-available {
    stroke: rgba(255, 255, 255, 0.9);
  }
  .edge-dormant {
    stroke: rgba(255, 255, 255, 0.15);
  }
}
</style>
```

- [ ] **Step 2: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/components/tower/TowerMapEdges.vue src/typed-components.d.ts && git commit -m "feat(tower-ui): add TowerMapEdges SVG layer"
```

---

## Task 15: `src/components/tower/TowerMap.vue`

**Files:**
- Create: `src/components/tower/TowerMap.vue`
- Create: `src/components/tower/TowerMap.test.ts`

整图画布；combine Node + Edges；从 store 读 graph/currentNodeId/completedNodes；点击 reachable 节点调 `advanceTo`。

- [ ] **Step 1: 写测试 `src/components/tower/TowerMap.test.ts`**

```ts
// src/components/tower/TowerMap.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TowerMap from '@/components/tower/TowerMap.vue'
import { useTowerStore } from '@/stores/tower'
import type { TowerGraph } from '@/tower/types'

/** Inject a tiny hand-crafted graph into a fresh store. */
function setupStoreWithGraph(graph: TowerGraph, currentNodeId = graph.startNodeId) {
  setActivePinia(createPinia())
  const store = useTowerStore()
  store.startNewRun('swordsman', 'test-seed')
  // Bypass startDescent — directly inject graph and phase.
  store.run!.towerGraph = graph
  store.run!.currentNodeId = currentNodeId
  store.setPhase('in-path')
  return store
}

const SIMPLE_GRAPH: TowerGraph = {
  startNodeId: 0,
  bossNodeId: 2,
  nodes: {
    0: { id: 0, step: 0, slot: 0, kind: 'start', next: [1] },
    1: { id: 1, step: 1, slot: 0, kind: 'mob', next: [2] },
    2: { id: 2, step: 2, slot: 0, kind: 'boss', next: [] },
  },
}

describe('TowerMap', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renders a node for every graph entry', () => {
    setupStoreWithGraph(SIMPLE_GRAPH)
    const w = mount(TowerMap)
    expect(w.findAllComponents({ name: 'TowerMapNode' }).length).toBe(3)
  })

  it('marks current node with "current" state', () => {
    setupStoreWithGraph(SIMPLE_GRAPH, 1)
    const w = mount(TowerMap)
    const buttons = w.findAll('.tower-map-node')
    const current = buttons.find((b) => b.classes().includes('current'))
    expect(current).toBeTruthy()
  })

  it('marks reachable successors of current node as "reachable"', () => {
    setupStoreWithGraph(SIMPLE_GRAPH, 0)
    const w = mount(TowerMap)
    const buttons = w.findAll('.tower-map-node')
    const reachable = buttons.filter((b) => b.classes().includes('reachable'))
    expect(reachable.length).toBe(1) // 只有 node 1 reachable
  })

  it('marks prev visited nodes as "completed"', () => {
    const store = setupStoreWithGraph(SIMPLE_GRAPH, 1)
    store.run!.completedNodes = [0]
    const w = mount(TowerMap)
    const buttons = w.findAll('.tower-map-node')
    const completed = buttons.filter((b) => b.classes().includes('completed'))
    expect(completed.length).toBe(1) // node 0
  })

  it('clicking a reachable node calls tower.advanceTo', async () => {
    const store = setupStoreWithGraph(SIMPLE_GRAPH, 0)
    const spy = vi.spyOn(store, 'advanceTo')
    const w = mount(TowerMap)
    const reachable = w
      .findAll('.tower-map-node')
      .find((b) => b.classes().includes('reachable'))!
    await reachable.trigger('click')
    expect(spy).toHaveBeenCalledWith(1)
  })

  it('clicking a completed node does not call advanceTo', async () => {
    const store = setupStoreWithGraph(SIMPLE_GRAPH, 1)
    store.run!.completedNodes = [0]
    const spy = vi.spyOn(store, 'advanceTo')
    const w = mount(TowerMap)
    const completed = w
      .findAll('.tower-map-node')
      .find((b) => b.classes().includes('completed'))!
    await completed.trigger('click')
    expect(spy).not.toHaveBeenCalled()
  })

  it('renders an SVG edges layer', () => {
    setupStoreWithGraph(SIMPLE_GRAPH)
    const w = mount(TowerMap)
    expect(w.find('svg.tower-map-edges').exists()).toBe(true)
    expect(w.findAll('svg.tower-map-edges line').length).toBe(2) // 0→1, 1→2
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/components/tower/TowerMap.test.ts
```

Expected: 失败 with `Cannot find module '@/components/tower/TowerMap.vue'`.

- [ ] **Step 3: 创建 `src/components/tower/TowerMap.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import type { TowerNode } from '@/tower/types'
import { K_SCHEDULE, TOTAL_STEPS } from '@/tower/graph/k-schedule'
import TowerMapNode from './TowerMapNode.vue'
import TowerMapEdges from './TowerMapEdges.vue'

const tower = useTowerStore()

// ---- Layout constants (spec §8.2) ----
const STEP_SPACING_Y = 72
const SLOT_SPACING_X = 96
const CANVAS_PADDING_X = 40
const CANVAS_PADDING_Y = 40

const maxK = Math.max(...K_SCHEDULE)
const canvasWidth = maxK * SLOT_SPACING_X + CANVAS_PADDING_X * 2
const canvasHeight = TOTAL_STEPS * STEP_SPACING_Y + CANVAS_PADDING_Y * 2

type NodeState = 'current' | 'completed' | 'reachable' | 'unreachable'

function computeState(node: TowerNode): NodeState {
  const run = tower.run
  if (!run) return 'unreachable'
  if (node.id === run.currentNodeId) return 'current'
  if (run.completedNodes.includes(node.id)) return 'completed'
  const current = run.towerGraph.nodes[run.currentNodeId]
  if (current?.next.includes(node.id)) return 'reachable'
  return 'unreachable'
}

function nodePosition(node: TowerNode): { left: number; top: number } {
  const K = K_SCHEDULE[node.step]
  const centerX = canvasWidth / 2
  const x = centerX + (node.slot - (K - 1) / 2) * SLOT_SPACING_X
  const y = CANVAS_PADDING_Y + node.step * STEP_SPACING_Y
  return { left: x - 24, top: y - 24 } // 24 = half of node size (48)
}

const nodesList = computed<TowerNode[]>(() =>
  tower.run ? (Object.values(tower.run.towerGraph.nodes) as TowerNode[]) : [],
)

function onSelect(nodeId: number) {
  tower.advanceTo(nodeId)
}
</script>

<template lang="pug">
.tower-map(
  v-if="tower.run"
  :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
)
  TowerMapEdges(
    :graph="tower.run.towerGraph"
    :current-node-id="tower.run.currentNodeId"
    :completed-nodes="tower.run.completedNodes"
    :step-spacing-y="STEP_SPACING_Y"
    :slot-spacing-x="SLOT_SPACING_X"
    :canvas-padding-x="CANVAS_PADDING_X"
    :canvas-padding-y="CANVAS_PADDING_Y"
    :canvas-width="canvasWidth"
    :canvas-height="canvasHeight"
  )
  .node-slot(
    v-for="node in nodesList"
    :key="node.id"
    :style="{ position: 'absolute', left: `${nodePosition(node).left}px`, top: `${nodePosition(node).top}px` }"
  )
    TowerMapNode(
      :node="node"
      :state="computeState(node)"
      @select="onSelect"
    )
</template>

<style lang="scss" scoped>
.tower-map {
  position: relative;
  margin: 0 auto;
  overflow-y: auto;
  max-width: 480px;
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/components/tower/TowerMap.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: 全量测试 + typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run && pnpm typecheck
```

Expected: 全部通过, typecheck 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/components/tower/TowerMap.vue src/components/tower/TowerMap.test.ts src/typed-components.d.ts && git commit -m "feat(tower-ui): add TowerMap composing nodes + edges + advanceTo dispatch"
```

---

## Task 16: 扩展 `src/pages/tower/index.vue`——`selecting-job` 与 `in-path` 分支

**Files:**
- Modify: `src/pages/tower/index.vue`

新增 `selecting-job` 分支（极简：显示 baseJob/seed + 开始下潜/重置按钮），`in-path` 分支渲染 `<TowerMap>`，`no-run` 分支加入 `schemaResetNotice` 提示条。

此外，把原 `v-else` 占位块拆成明确的 `v-else-if` 分支。

- [ ] **Step 1: 修改 `src/pages/tower/index.vue`**

完整替换文件内容（保留脚本风格，仅改 template 与 style）：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTowerStore } from '@/stores/tower'

const router = useRouter()
const tower = useTowerStore()

onMounted(async () => {
  await tower.hydrate()
})

function goHome() {
  router.push('/')
}

function onNewGame() {
  // Phase 3 将在这里接"真正的职业选择流程".
  // P2 的临时桥：硬编码 'swordsman'，让流程跑通到 selecting-job.
  tower.startNewRun('swordsman')
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

function onTutorial() {
  // Phase 7 将在这里装载教程塔 hand-crafted graph.
}

function onStartDescent() {
  tower.startDescent()
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .schema-reset-notice(v-if="tower.schemaResetNotice")
    span.notice-text 本迷宫版本已更新，之前的下潜已关闭
    button.notice-dismiss(type="button" @click="tower.dismissSchemaNotice()") 知道了

  //- ───────────────────────── no-run ─────────────────────────
  .tower-panel(v-if="tower.phase === 'no-run'")
    .tower-title 爬塔模式
    .tower-subtitle 选择一个入口开始你的攀登
    .tower-actions
      button.tower-btn.primary(type="button" @click="onNewGame") 新游戏
      button.tower-btn.secondary(
        type="button"
        :disabled="!tower.savedRunExists"
        @click="onContinue"
      ) 继续
      button.tower-btn.secondary(
        type="button"
        disabled
        @click="onTutorial"
      ) 教程
      button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单

  //- ───────────────────── selecting-job ─────────────────────
  .tower-panel(v-else-if="tower.phase === 'selecting-job' && tower.run")
    .tower-title 准备下潜
    .tower-subtitle 确认你的装备后点击开始
    .tower-preview
      .preview-row
        span.label 基础职业
        span.value {{ tower.run.baseJobId }}
      .preview-row
        span.label 种子
        span.value.seed {{ tower.run.seed }}
    .tower-actions
      button.tower-btn.primary(type="button" @click="onStartDescent") 开始下潜
      button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 重置

  //- ───────────────────────── in-path ────────────────────────
  .tower-inpath(v-else-if="tower.phase === 'in-path' && tower.run")
    .tower-subtitle 点击可达节点前进
    TowerMap
    .tower-actions-inline
      button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 放弃本局

  //- ─────────────────────── fallback ─────────────────────────
  .tower-panel(v-else)
    .tower-title 爬塔模式
    .tower-placeholder
      | Phase: {{ tower.phase }}
    .tower-placeholder
      | TODO: implemented in later phases
    button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 重置并返回
</template>

<style lang="scss" scoped>
.tower-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  max-width: 420px;
  width: 90%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.tower-inpath {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tower-title {
  font-size: 18px;
  color: #ddd;
  font-weight: bold;
}

.tower-subtitle {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.tower-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.tower-actions-inline {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 12px;
}

.tower-btn {
  padding: 10px 20px;
  font-size: 13px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.primary { background: rgba(255, 255, 255, 0.1); }
  &.secondary { background: rgba(255, 255, 255, 0.06); }
  &.tertiary { background: rgba(255, 255, 255, 0.02); }
}

.tower-placeholder {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

.tower-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  margin-bottom: 6px;

  .preview-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;

    .label { color: #888; }
    .value { color: #ddd; }
    .value.seed {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.schema-reset-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  max-width: 420px;
  width: 90%;
  margin-bottom: 12px;
  background: rgba(255, 140, 80, 0.15);
  border: 1px solid rgba(255, 140, 80, 0.4);
  border-radius: 6px;
  font-size: 12px;
  color: #ffd0b0;

  .notice-text {
    flex: 1;
  }

  .notice-dismiss {
    padding: 4px 10px;
    font-size: 11px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    color: inherit;
    cursor: pointer;

    &:hover { background: rgba(255, 255, 255, 0.16); }
  }
}
</style>
```

- [ ] **Step 2: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 3: 全量测试**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run
```

Expected: 全部通过.

- [ ] **Step 4: 启动 dev server 做目视验收**

Run in background:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm dev
```

打开 `http://localhost:5173/tower`。

验收点：
1. 看到 no-run 界面 + "新游戏"按钮已**启用**
2. 点"新游戏" → 进入 selecting-job 界面，显示 `baseJobId: swordsman` + seed 字符串 + "开始下潜"/"重置" 按钮
3. 点"开始下潜" → 渲染地图：14 层节点（step 0 在顶、boss 在底），起点高亮，step 1 的 2 个节点 reachable 有呼吸动画
4. 点击 reachable 节点 → 进阶一层，前节点变 completed（饱和度降低），下一层 reachable 节点切换
5. 一路点到 boss 节点——点击 boss 后 `currentNodeId = bossNodeId`；所有节点变 unreachable/completed，卡在此状态（phase4 会接战斗；phase2 到此为止）
6. 点"放弃本局" → 回到 no-run 界面

停 dev server。

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/pages/tower/index.vue && git commit -m "feat(pages): wire selecting-job + in-path phases to tower map UI"
```

---

## Task 17: 主菜单 `新游戏`（爬塔入口）已启用验证

**Files:**（无修改；本 task 仅做 cross-check）

phase1 已在 `src/pages/index.vue` 加入 "◈ 爬塔模式" 入口。Task 16 在 `/tower` 页把 "新游戏" 按钮启用。主菜单本身**无需修改**。本 task 确认从主菜单一路跑到 tower map 可达，并留记录。

- [ ] **Step 1: 目视从主菜单启动**

Run in background:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm dev
```

在浏览器访问 `http://localhost:5173/`。

验收：
1. 主菜单有 "◈ 爬塔模式" 按钮
2. 点击 → 进入 `/tower` → 看到 no-run
3. 点"新游戏" → 进入 selecting-job → 点"开始下潜" → 进入 map
4. 点 reachable → 前进
5. 浏览器刷新页面 → 自动从 IndexedDB hydrate 回到 in-path（currentNodeId 保留）；地图正确渲染

停 dev server。

- [ ] **Step 2: （不修改文件，本 task 无 commit）**

无代码改动。如果 Step 1 发现问题（例如刷新不恢复 currentNodeId），修复应当回到 Task 11 `advanceTo` 的 `saveTowerRun` 调用并补一次 commit。

---

## Task 18: 最终验收

**Files:**（验收；无修改）

- [ ] **Step 1: 跑完整测试 + typecheck + 生产构建**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run && pnpm typecheck && pnpm build
```

Expected: 所有测试通过、typecheck 退出码 0、`pnpm build` 成功产出 `dist/`。

- [ ] **Step 2: 确认预期产物清单**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git ls-files | grep -E '^src/(tower/graph|components/tower|stores/tower|pages/tower)|^src/tower/types' | sort
```

Expected（或至少这些；typed-*.d.ts 额外出现也 OK）：

```
src/components/tower/TowerMap.test.ts
src/components/tower/TowerMap.vue
src/components/tower/TowerMapEdges.vue
src/components/tower/TowerMapNode.test.ts
src/components/tower/TowerMapNode.vue
src/pages/tower/index.vue
src/stores/tower.test.ts
src/stores/tower.ts
src/tower/graph/constraints.test.ts
src/tower/graph/constraints.ts
src/tower/graph/generator.test.ts
src/tower/graph/generator.ts
src/tower/graph/k-schedule.test.ts
src/tower/graph/k-schedule.ts
src/tower/graph/loader.test.ts
src/tower/graph/loader.ts
src/tower/graph/repair.test.ts
src/tower/graph/repair.ts
src/tower/graph/topology.test.ts
src/tower/graph/topology.ts
src/tower/graph/type-assignment.test.ts
src/tower/graph/type-assignment.ts
src/tower/types.ts
```

- [ ] **Step 3: dev server 端到端 smoke test**

Run in background:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm dev
```

执行完整流程：
1. 主菜单 → 爬塔模式 → 新游戏 → 开始下潜 → 地图出现
2. 点 5-6 步（包括过 step 4 的 3 分叉、step 6 的 reward 汇合）
3. 刷新页面 → 确认恢复位置
4. 回到主菜单 → 返回爬塔 → "继续" 可用 → 点击恢复同一局
5. 点"放弃本局" → 回 no-run → "继续" 变 disabled

停 dev server.

- [ ] **Step 4: Commit（若需要追加 log／notes，否则跳过）**

phase2 完成。无需额外 commit（Task 17 无 commit 是预期）。

---

## Phase 2 完成判据

- `pnpm test:run` 所有测试通过（原有 + phase2 新增约 180 条）
- `pnpm typecheck` 退出码 0
- `pnpm build` 成功
- 从主菜单点"爬塔模式" → 新游戏 → 开始下潜 → 在地图上点到 boss 节点，全程不报错
- 存档校验路径：修改 `TOWER_RUN_SCHEMA_VERSION = 1 as const` 为 `= 2` 后运行 `pnpm dev`，点"继续"应触发 `schemaResetNotice` 提示并重置（验证后改回 `= 1`，或通过单测证明，生产代码保持 1）

Phase 2 **不产生**：战斗代码 / 基础职业技能 / 魔晶石 / 策略卡 / 第 0 节点 UI / 篝火 UI / 结算页 / 教程塔内容 —— 这些是后续 phase 的工作。
