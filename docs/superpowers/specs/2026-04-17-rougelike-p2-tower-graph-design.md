# Rougelike Tower — Phase 2 (Graph Generation & Map UI) 设计

> Scope：为爬塔肉鸽模式接上**图生成算法**、**hand-crafted graph loader**、**路径地图 UI** 及**路径推进 store action**。phase2 完成后，玩家能从 `selecting-job` phase 点按"开始下潜"生成一张 seed 确定的图，并在地图 UI 上点击合法下一步节点推进 `currentNodeId`；节点点击后**不触发战斗、不弹侦察窗**——那是 phase4 的事。

## 1. Spec Reference

- GDD: `docs/brainstorm/2026-04-17-rougelike.md` §2.1 / §2.2 / §2.2.1 / §7.3 / §7.4
- Phase 1 产物（本 phase 的基底）：
  - `src/tower/types.ts`
  - `src/tower/random.ts`（`createRng`）
  - `src/stores/tower.ts`（`useTowerStore`）
  - `src/pages/tower/index.vue`
- Phase 1 plan（施工惯例参照）：`docs/superpowers/plans/2026-04-17-rougelike-p1-foundation.md`

---

## 2. Scope

### IN（phase2 必做）

- **类型扩展**（`src/tower/types.ts`）：
  - `TowerNodeKind` 新增 `'start'`（第 0 节点；既非 reward 也非 campfire，GDD §2.2.1 定义独特）
  - `TowerNode` 新增 `slot: number` 字段（水平位置，UI 布局用）
- **图生成**：`src/tower/graph/generator.ts` — `generateTowerGraph(seed: string): TowerGraph`
- **硬约束校验**（独立模块便于单测）：`src/tower/graph/constraints.ts`
- **YAML loader**（同期做，为 phase7 教程塔铺路）：`src/tower/graph/loader.ts`
- **Store 扩展**（`src/stores/tower.ts`）：新增 `startDescent()` / `advanceTo(nodeId)` actions
- **UI**：
  - `src/components/tower/TowerMap.vue`（整图画布）
  - `src/components/tower/TowerMapNode.vue`（单节点）
  - `src/components/tower/TowerMapEdges.vue`（SVG 连线层）
  - `src/pages/tower/index.vue` 扩展渲染 `selecting-job`（极简：显示 baseJob + seed + "开始下潜"按钮）与 `in-path`（渲染 `<TowerMap>`）分支
- 对应 colocated `*.test.ts`

### OUT（留给后续 phase，文档中重复申明以防误读）

- 第 0 节点的"随机武器 + 3 选 1 策略卡"—— **phase 6**
- 点击节点后的确认/侦察弹窗 —— **phase 4**
- 战斗接入 `<EncounterRunner>` —— **phase 4**
- 决心 runtime、超越之力、场地机制挂载 —— **phase 5**
- 基础职业实际技能与起始装备 —— **phase 3**
- 教程塔 YAML 内容 —— **phase 7**（loader 做了但不写教程内容；本 phase 仅随一个极简样板 YAML 过 unit test）
- 地图背景氛围、parallax、动效、音效 —— 后期美术阶段

---

## 3. 关键技术决策

### 3.1 图生成：seed 不混 job

`generateTowerGraph(seed)` 的签名**不接收** `baseJobId` 参数。同一 seed 在不同 job 下产生**同一张图**。理由（对齐 GDD §7.4 "seeded PRNG / 每日种子"）：

- 每日种子 / 种子赛语义统一
- QA 报 bug 只需 seed，无需附带 job
- 同 seed 不同 job 重玩成为天然的 re-playability——"同图不同 build"

job 仅影响 phase3 的起始技能/属性与 phase6 的第 0 节点武器选择，**永远不进 graph generator**。

### 3.2 图生成时机：`startDescent()` 分离

phase1 已有 `startNewRun(baseJobId, seed?)`——创建 run + phase='selecting-job'。phase2 不改其行为；新增独立 action `startDescent()`：

1. 前置条件：`phase === 'selecting-job'` 且 `run !== null`
2. 调 `generateTowerGraph(run.seed)` 生成图
3. `$patch` 赋给 `run.towerGraph`；`run.currentNodeId = graph.startNodeId`
4. `setPhase('in-path')` 触发持久化

好处：seed 可在 `selecting-job` 界面展示（未来支持"重掷种子"/"预览种子"）；图生成与"确认职业"语义分离，符合状态机 `selecting-job → in-path` 的既定节拍。

### 3.3 两阶段 pipeline：拓扑 → 类型 → 校验修复

`generateTowerGraph(seed)` 内部：

1. **拓扑阶段**：按 K schedule 放节点 + path-generation 连边
2. **类型分配阶段**：固定节点 + 非固定节点按权重抽样
3. **约束修复阶段**：迭代校验 5 条硬约束并局部修正

三阶段解耦便于单测各自。

### 3.4 Hand-crafted loader 同期

`loadTowerGraphFromYaml(yamlText: string): TowerGraph`。解析后做 schema validation：
- 必有 `startNodeId` / `bossNodeId` / `nodes`
- `nodes` 中每个条目合法（id/step/slot/kind/next 字段齐全且类型正确）
- `startNodeId` 与 `bossNodeId` 均在 `nodes` 中
- `next` 指向的 id 均在 `nodes` 中
- 从 `startNodeId` 走 next 可达 `bossNodeId`（BFS）

不校验 K schedule / 节点类型权重 / 硬约束——hand-crafted 塔的全部业务约束由**作者自控**（设计教程塔或 QA 场景时需要打破权重分布）。

### 3.5 UI 渲染方向：起点顶部、Boss 底部

呼应 FF14 死者宫殿"深层下潜"的叙事。视觉上：
- `step === 0` 渲染在画布顶部
- `step === 13` 渲染在画布底部
- 玩家随 step 数增大"向下"移动

算法层完全不感知渲染方向——节点仅持有 `step` 与 `slot`，由 UI 做 `y = step × SPACING` 映射即可。未来若需"反向塔"或某个特殊场景从下往上走，算法/存档/generator 零改动，UI 翻 y 映射即可。

### 3.6 Schema versioning：存档版本号 + 不匹配即重置

phase2 是图正式入档的 phase——之后任何破坏性变更（新增 `TowerNodeKind`、改 `K_SCHEDULE`、改 `TowerNode` 字段、调整权重语义、重写修复算法、改约束集）都可能让老存档 hydrate 后出错，或产生"视觉正常但玩下去崩溃"的隐性脏状态。

策略：

- `TowerRun` 新增 `schemaVersion: number` 字段；phase2 首发值 `= 1`
- 每次 breaking 变更 bump 常量 `TOWER_RUN_SCHEMA_VERSION`（`src/tower/types.ts` 导出）
- `continueLastRun()` 读档后做版本校验：
  - 匹配 → 正常 hydrate
  - 不匹配（旧存档、更早实验版本、甚至将来回滚）→ `resetRun()` 清存档 + 置 `schemaResetNotice = true` + console.warn
- **不做 migration 函数链**：MVP 阶段"匹配 or 重置"二选一即可
- UI：`<TowerPage>` 的 `no-run` 分支读 `schemaResetNotice`，渲染一次性提示条——"**本迷宫版本已更新，之前的下潜已关闭**"（文案草稿），玩家点"知道了"调 `dismissSchemaNotice()` 清掉。`schemaResetNotice` 是 ephemeral ref，不落盘

**预留接口（post-MVP）**：将来金币系统打通后，版本不匹配的玩家应当**强制结算获得补偿金币**（按 `loaded.crystals` / `loaded.level` / `loaded.currentNodeId` 算出一个缓冲金额）。phase2 仅在代码里留 TODO + spec §12 登记，不实作。hook 位置：

```ts
async function continueLastRun() {
  const loaded = await loadTowerRun()
  if (!loaded) return
  if (loaded.schemaVersion !== TOWER_RUN_SCHEMA_VERSION) {
    // TODO(post-MVP): 金币系统上线后，在此处调 forcedSettlement(loaded)
    // 按 loaded.crystals / loaded.level / loaded.currentNodeId 给出补偿金币
    // 参见 spec §12 "强制结算补偿金币"
    console.warn(
      `[tower] saved run schemaVersion ${loaded.schemaVersion} ` +
      `!= current ${TOWER_RUN_SCHEMA_VERSION}, resetting`,
    )
    resetRun()
    schemaResetNotice.value = true
    return
  }
  // ...phase1 原 hydrate 流程
}
```

---

## 4. 类型扩展（`src/tower/types.ts`）

### 4.1 `TowerNodeKind` 新增 `'start'`

```ts
export type TowerNodeKind =
  | 'start'      // ← 新增；GDD §2.2.1 第 0 节点
  | 'mob'
  | 'elite'
  | 'boss'
  | 'campfire'
  | 'reward'
  | 'event'
```

> 注：`'start'` 节点在 UI 中的图标（临时）使用 `'🚩'`；phase6 完成"武器+策略卡 3 选 1"后可能换成更具 FF14 风味的 icon，不在本 phase 范围内。

### 4.2 `TowerNode` 新增 `slot`

```ts
export interface TowerNode {
  id: number
  step: number
  slot: number   // ← 新增；水平位置索引，[0, K(step))
  kind: TowerNodeKind
  next: number[]
}
```

### 4.3 Phase 1 placeholder 的迁移

phase1 的 `createInitialRun` 给出 `towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} }` 作为占位。phase2 的 `startDescent()` 会整体替换 `run.towerGraph`。phase1 遗留的空图存档**不会**在正常流程下抵达 `in-path`（phase1 永远停在 `no-run` 或 `selecting-job`）；即便有异常遗留，§3.6 的 `schemaVersion` 校验会把它按"旧版本"处理并 reset——不需要单独的 defensive check。

### 4.4 `TowerRun.schemaVersion`

```ts
// src/tower/types.ts
export const TOWER_RUN_SCHEMA_VERSION = 1 as const

export interface TowerRun {
  /** 存档 schema 版本号；不匹配当前常量时 continueLastRun 会 reset（§3.6） */
  schemaVersion: number
  // ... 原有字段
}
```

phase1 的 `createInitialRun`（`src/stores/tower.ts`）需同步在返回对象里加 `schemaVersion: TOWER_RUN_SCHEMA_VERSION`。phase1 `tower.test.ts` 里手工构造 `TowerRun` 的地方也要加该字段——phase2 改完类型后 typecheck 会强制全部补齐。

---

## 5. 图生成算法

### 5.1 K schedule（固化常量）

```ts
// src/tower/graph/k-schedule.ts
export const K_SCHEDULE: readonly number[] = [
  /* step  0 start    */ 1,
  /* step  1 mob      */ 2,
  /* step  2 nonfixed */ 2,
  /* step  3 nonfixed */ 2,
  /* step  4 nonfixed */ 3,   // 关键决策位
  /* step  5 nonfixed */ 2,
  /* step  6 reward   */ 1,
  /* step  7 nonfixed */ 2,
  /* step  8 nonfixed */ 3,   // 关键决策位
  /* step  9 nonfixed */ 2,
  /* step 10 nonfixed */ 2,
  /* step 11 nonfixed */ 2,
  /* step 12 campfire */ 1,
  /* step 13 boss     */ 1,
]

export const TOTAL_STEPS = K_SCHEDULE.length  // 14
```

共 14 层、`sum(K) = 1+2+2+2+3+2+1+2+3+2+2+2+1+1 = 26` 个节点。

### 5.2 阶段 A：拓扑生成

```ts
// Pseudocode
function buildTopology(rng: Rng): Pick<TowerNode, 'id' | 'step' | 'slot' | 'next'>[] {
  // (1) 按 step × slot 分配递增 id
  const nodes = []
  let nextId = 0
  for (let step = 0; step < TOTAL_STEPS; step++) {
    for (let slot = 0; slot < K_SCHEDULE[step]; slot++) {
      nodes.push({ id: nextId++, step, slot, next: [] as number[] })
    }
  }

  // (2) 生成 M 条路径（M = max K = 3），每条路径自顶向下走合法 slot
  const M = 3
  const paths: number[][] = []  // 每条路径是 step-index 上的 slot 序列
  for (let i = 0; i < M; i++) {
    const path = [0]             // step 0 只有 slot 0
    for (let step = 1; step < TOTAL_STEPS; step++) {
      const prev = path[step - 1]
      const K = K_SCHEDULE[step]
      // 合法 next slot：与 prev 差 ±1 且 in [0, K)，或 K=1 时强制 slot=0
      const candidates = (K === 1)
        ? [0]
        : [prev - 1, prev, prev + 1].filter((s) => s >= 0 && s < K)
      path.push(pickWeighted(candidates, rng))  // 均匀抽取
    }
    paths.push(path)
  }

  // (3) 把 paths 转成 edges（去重），写入 node.next
  const findNodeId = (step: number, slot: number) =>
    nodes.find((n) => n.step === step && n.slot === slot)!.id
  for (const path of paths) {
    for (let step = 0; step < TOTAL_STEPS - 1; step++) {
      const from = findNodeId(step, path[step])
      const to = findNodeId(step + 1, path[step + 1])
      const fromNode = nodes.find((n) => n.id === from)!
      if (!fromNode.next.includes(to)) fromNode.next.push(to)
    }
  }

  // (4) 修复：确保每个非 step-0 节点至少有 1 入边
  for (let step = 1; step < TOTAL_STEPS; step++) {
    for (let slot = 0; slot < K_SCHEDULE[step]; slot++) {
      const v = findNodeId(step, slot)
      const hasIn = nodes.some((u) => u.next.includes(v))
      if (!hasIn) {
        // 找一个 step-1 上 slot 与 v.slot 相邻的节点 u，把 v 加到 u.next
        const prevK = K_SCHEDULE[step - 1]
        const candidateSlots = (prevK === 1)
          ? [0]
          : [slot - 1, slot, slot + 1].filter((s) => s >= 0 && s < prevK)
        const u = findNodeId(step - 1, pickWeighted(candidateSlots, rng))
        nodes.find((n) => n.id === u)!.next.push(v)
      }
    }
  }

  return nodes
}
```

**关键性质**：
- 拓扑天然连通（M 条路径都从 step 0 到 step 13）
- K=1 层强制汇合（路径 slot 被 clamp 到 0）
- 下一层每节点至少 1 入边（修复步骤保证）
- 同一 `(step, slot)` 只有 1 个节点（enforced by 构造）

### 5.3 阶段 B：类型分配

```ts
// 权重表（GDD §7.3 非固定层）
const NONFIXED_WEIGHTS: Record<TowerNodeKind, number> = {
  mob: 50,
  elite: 15,
  event: 15,
  reward: 10,
  campfire: 10,
  start: 0, boss: 0,  // 固定节点类型不参与非固定层抽样
}
```

分配流程：

1. **固定节点 kind**：
   - `step === 0`: `kind = 'start'`
   - `step === 6`: `kind = 'reward'`
   - `step === 12`: `kind = 'campfire'`
   - `step === 13`: `kind = 'boss'`
   - `step === 1`（全部节点）：`kind = 'mob'`（硬约束 1）

2. **非固定节点 kind**（step ∈ {2,3,4,5,7,8,9,10,11}）：
   - 对每个节点按权重抽样一个 kind
   - 立刻校验约束 3、4：
     - `step === 5 || step === 7` 不允许 `reward`（约束 4）
     - `step === 11` 不允许 `campfire`（约束 3）
   - 违反时从**排除违规 kind 的 weights** 重新抽样

### 5.4 阶段 C：约束修复迭代

**硬约束清单**（GDD §7.3）：

| # | 约束 | 校验方式 |
|---|---|---|
| 1 | Step 1 必为小怪战 | 固定分配已满足 |
| 2 | 精英战不连续两步 | 对每个 `elite` 节点 `u`，若 `u.next` 含 `elite` 或某前驱节点为 `elite`，违规 |
| 3 | 篝火不与 Step 12 相邻 | Step 11 无 `campfire`（分配时已 enforce） |
| 4 | 奖励不与 Step 6 相邻 | Step 5、7 无 `reward`（分配时已 enforce） |
| 5 | 每条路径至少 1 次精英战 | DFS all paths，每条路径 kind 序列必须含 `elite` |

修复算法：

```ts
const MAX_REPAIR_ITERATIONS = 5

function repair(nodes: TowerNode[], rng: Rng): void {
  for (let iter = 0; iter < MAX_REPAIR_ITERATIONS; iter++) {
    // (1) 修约束 2：扫描连续 elite，后发者重抽为 mob/event（保守选择）
    const violation2 = findConsecutiveElite(nodes)
    if (violation2) {
      fixConsecutiveElite(violation2, rng)
      continue
    }
    // (2) 修约束 5：DFS all paths，对每条无 elite 路径选一节点改 elite
    const pathsWithoutElite = findPathsWithoutElite(nodes)
    if (pathsWithoutElite.length > 0) {
      addEliteToPaths(pathsWithoutElite, nodes, rng)
      continue
    }
    return  // 所有约束通过
  }
  throw new Error(
    `tower graph repair did not converge in ${MAX_REPAIR_ITERATIONS} iterations. ` +
    `This seed is pathological.`
  )
}
```

**修复策略细节**：

- `addEliteToPaths`：对每条缺 elite 的路径 `p`，找出其非固定节点集合 `candidates`（排除 start/step-1/reward/campfire/boss 位），从中随机选 1 个改为 elite。**优先选在 `p` 上 step 值大的节点**——减少后续引发约束 2 连续 elite 的概率。
- `fixConsecutiveElite`：找到一对相邻 step 的 elite 节点 `(u, v)`（`u.step + 1 === v.step` 且 `u.next.includes(v.id)`），把**后者** `v` 改为按权重重抽（排除 elite）的 kind。选后者是因为"前者"可能已被"覆盖路径"步骤钦定。
- 循环 MAX 5 次通常足以收敛；若超 5 次 throw——但这应该在正常 seed 分布下极少触发（模拟 1000 seeds 全部应收敛≤3 次，phase2 单测覆盖这个统计性质）。

### 5.5 确定性验证

`generateTowerGraph('foo')` 必须在任意环境下返回**完全一致**的 `TowerGraph`。关键：
- 所有抽样走 `createRng(seed)` 返回的 `Rng`
- 节点分配顺序固定为 `step × slot` lex 序
- `Array.sort` 等隐式使用需用稳定排序（JS 现代 V8 已保证，但任意性写法如 `[...set]` 顺序依赖 insertion order，写时留心）
- `Set` / `Map` iteration 顺序 = insertion order，OK

### 5.6 图接口与起止 id

```ts
export function generateTowerGraph(seed: string): TowerGraph {
  // ...
  return {
    startNodeId: 0,                        // step 0 slot 0
    bossNodeId: totalNodes - 1,            // step 13 slot 0
    nodes: Object.fromEntries(allNodes.map((n) => [n.id, n])),
  }
}
```

26 个节点，id 从 0 递增到 25；`startNodeId = 0`，`bossNodeId = 25`。

---

## 6. Hand-crafted Loader

### 6.1 YAML schema（示例）

```yaml
# public/encounters/tower-tutorial.yaml —— 样板（phase2 内随 unit test 创一个极简版）
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
```

### 6.2 API

```ts
// src/tower/graph/loader.ts
import { parse } from 'yaml'
import type { TowerGraph, TowerNode, TowerNodeKind } from '@/tower/types'

export function loadTowerGraphFromYaml(yamlText: string): TowerGraph {
  const raw = parse(yamlText) as unknown
  return validate(raw)
}

function validate(raw: unknown): TowerGraph { /* schema check, BFS reachability */ }
```

### 6.3 Validator 规则

1. Root 对象必有 `startNodeId: number` / `bossNodeId: number` / `nodes: Array`
2. 每个 node 必有 `id: number` / `step: number` / `slot: number` / `kind: TowerNodeKind` / `next: number[]`
3. `kind` 必为 7 个 literal 之一
4. `nodes` 内 id 全局唯一
5. `startNodeId` 与 `bossNodeId` 均 ∈ `nodes[*].id`
6. 所有 `next[i]` ∈ `nodes[*].id`
7. BFS from `startNodeId`，必须可达 `bossNodeId`

校验失败 throw `TowerGraphLoaderError(message, path)`，便于测试精确断言错误。

### 6.4 未接入 UI

本 phase **不**在 `/tower` 页面接"教程"按钮——loader 仅以 unit test 形式验证。phase7 教程塔会在 store 增加 `startTutorial(id: string)` action 调用 loader 并走 `graphSource: { kind: 'hand-crafted', id }` 分支。

---

## 7. Store 改动（`src/stores/tower.ts`）

### 7.1 新增 actions

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
  // 使用 Vue 的赋值语法而非 $patch（setup store 内更自然）
  run.value.towerGraph = graph
  run.value.currentNodeId = graph.startNodeId
  phase.value = 'in-path'
}

function advanceTo(nodeId: number): void {
  if (!run.value) return
  if (phase.value !== 'in-path') {
    console.warn(`[tower] advanceTo called in wrong phase: ${phase.value}`)
    return
  }
  const current = run.value.towerGraph.nodes[run.value.currentNodeId]
  if (!current) return
  if (!current.next.includes(nodeId)) {
    console.warn(`[tower] illegal move: ${run.value.currentNodeId} -> ${nodeId}`)
    return
  }
  // 推进：把当前节点加入 completedNodes，再切到 nodeId
  if (!run.value.completedNodes.includes(current.id)) {
    run.value.completedNodes.push(current.id)
  }
  run.value.currentNodeId = nodeId
  // 注意：不切 phase（仍然 in-path）；phase4 会在此时根据 next node 的 kind 判断是否切 'in-combat'
}
```

### 7.2 暴露 surface

```ts
return {
  phase, run, savedRunExists, currentBaseJobId,
  startNewRun, continueLastRun, resetRun, setPhase, hydrate,
  startDescent, advanceTo,                   // ← 新增
}
```

### 7.3 持久化联动

phase1 的 persistence hook `watchPhaseForPersistence` 监听 `phase` 变化写盘。`startDescent` 会触发 `phase` 变化（`selecting-job → in-path`），因此 `run.towerGraph` 的新值会随 `in-path` 的 save 一起落盘。

`advanceTo` **不**改 phase，所以默认不触发 persistence。这会导致"走到一半离开"丢进度。**修复**：把 `run` 的深层字段写入也纳入 persistence。方案：

- 在 `advanceTo` 之后手动调 `void saveTowerRun(toRaw(run.value))`
- 避免扩展 watch 到整个 run 的 deep watch（性能开销大，且 phase1 特意选择"仅 phase 变化时写盘"）

改动：**在 `advanceTo` 末尾直接 fire-and-forget 一次 `saveTowerRun`**。这样 `advanceTo` 是 sync action，底层 IO 异步。

```ts
run.value.currentNodeId = nodeId
void saveTowerRun(toRaw(run.value))
```

写盘失败不回滚（同 phase1 `resetRun` 的 `clearTowerRun` fire-and-forget 风格）。

### 7.4 单测追加

```
- startDescent: 前置 selecting-job → 调用后 phase='in-path' 且 run.towerGraph.nodes 非空
- startDescent: 相同 seed 两次调用产生 equal 图
- startDescent: 错误 phase 调用 no-op + warn
- advanceTo: 合法下一步 → currentNodeId 更新 + 前节点进 completedNodes
- advanceTo: 非法 nodeId → 不变更 + warn
- advanceTo: 无 run / 错误 phase → 不变更 + warn
- advanceTo: 调用后触发 saveTowerRun（通过 spy 验证）
```

### 7.5 `continueLastRun` 扩展：版本检查 + `schemaResetNotice`

phase1 `continueLastRun` 把读档结果直接灌入 `run.value`。phase2 扩展为：

1. `loadTowerRun()` 拿到 `loaded`
2. `loaded === null` → 直接 return（phase1 原行为）
3. **新增**：`loaded.schemaVersion !== TOWER_RUN_SCHEMA_VERSION` → `resetRun()` + `schemaResetNotice.value = true` + console.warn → return（不 hydrate）
4. 其余分支走 phase1 原 hydrate 流程（含 `suppressPersist` + `nextTick` 恢复）

新增 store 暴露：

```ts
const schemaResetNotice = ref(false)
function dismissSchemaNotice(): void { schemaResetNotice.value = false }

return {
  // ...既有
  schemaResetNotice,
  dismissSchemaNotice,
}
```

`<TowerPage>` 的 `no-run` 分支：`v-if="tower.schemaResetNotice"` 渲染一次性提示条，按钮 "知道了" → `tower.dismissSchemaNotice()`。

单测追加（`src/stores/tower.test.ts`）：

- 读档 `schemaVersion !== TOWER_RUN_SCHEMA_VERSION` → 不 hydrate，phase 仍 `no-run`，`schemaResetNotice === true`，`clearTowerRun` 被调
- `dismissSchemaNotice()` 后 `schemaResetNotice === false`
- 读档 `schemaVersion === TOWER_RUN_SCHEMA_VERSION` → 正常 hydrate，`schemaResetNotice === false`

---

## 8. UI 方案

### 8.1 组件树

```
src/pages/tower/index.vue
├── [phase='no-run']  （phase1 已实现，无需改动）
├── [phase='selecting-job']  （phase2 新增：极简）
│   - 显示 run.baseJobId + run.seed
│   - "开始下潜" 按钮 → tower.startDescent()
│   - "重置" 按钮 → tower.resetRun()
└── [phase='in-path']  （phase2 新增）
    └── <TowerMap>
        ├── <TowerMapEdges>   （SVG 层，画全部边）
        └── v-for node in graph.nodes
            └── <TowerMapNode>
```

> 注：`selecting-job` phase 本身是 phase3 要接"基础职业选择流"的地方，phase2 仅提供"已选 job 后的 seed 确认+开始下潜"UI。`startNewRun` 仍在 `no-run` 分支的"新游戏"按钮内硬编码一个默认 job（例如 `'swordsman'`）以打通流程；**phase3 会替换为真正的职业选择界面**。为了 phase3 替换最小成本，本 phase **不**给"新游戏"按钮加复杂 UI——就一个硬编码 default。

### 8.2 布局算法

`TowerMap` 用 CSS grid + absolute position 布局：

```ts
// 常量
const STEP_SPACING_Y = 72   // px, 每 step 的垂直间距
const SLOT_SPACING_X = 96   // px, 每 slot 的水平间距
const CANVAS_PADDING = 40   // px

// 对每个 node
const K = K_SCHEDULE[node.step]
const x = CANVAS_PADDING + (node.slot - (K - 1) / 2) * SLOT_SPACING_X + CENTER_OFFSET
const y = CANVAS_PADDING + node.step * STEP_SPACING_Y
// 起点顶、Boss 底：step 大 → y 大（自然）
```

画布总高 ≈ `14 × 72 + 80 ≈ 1088 px`，在移动端宽度 360px 下需要 vertical scroll。Canvas 宽度由 max K 决定：`3 × 96 + 80 = 368 px`——刚好塞进移动端；桌面端做 `max-width: 480px; margin: 0 auto` 居中。

### 8.3 `TowerMapNode` 视觉

```vue
<!-- 伪代码 -->
<button class="tower-map-node" :class="{
  completed, current, reachable, unreachable,
  [`kind-${node.kind}`]: true,
}" :disabled="!reachable">
  <span class="icon">{{ iconFor(node.kind) }}</span>
</button>
```

状态规则：
- `current = node.id === run.currentNodeId`
- `completed = run.completedNodes.includes(node.id)`
- `reachable = graph.nodes[currentNodeId].next.includes(node.id)`
- `unreachable = !current && !completed && !reachable`

样式要点：
- `current`: 高饱和度 + 轻微发光 + 放大 1.15
- `reachable`: 边框呼吸动画（`@keyframes pulse`）+ hover 放大 1.05 + cursor-pointer
- `completed`: 饱和度 50% + 透明度 0.6 + 不可点
- `unreachable`: 饱和度 30% + 不可点
- `kind-*` 决定 icon 颜色 tint（战斗红调、篝火橙调、奖励金调等）

icon 映射：

| kind | icon |
|---|---|
| start | 🚩 |
| mob | ⚔️ |
| elite | 💀 |
| boss | 👑 |
| campfire | 🔥 |
| reward | 🎁 |
| event | ❓ |

（与 GDD §2.2 表一致；`start` 临时用旗帜，phase6 可替换）

### 8.4 `TowerMapEdges`

画布上层绝对定位的 SVG。遍历所有节点的 `next` 列表生成 `<line>` 或 `<path>`。线宽 2px，颜色按"起点是否 completed"分：

- **已走过的边**（`from.id ∈ completedNodes && to.id ∈ completedNodes ∪ {currentNodeId}`）：半透明亮色
- **可选边**（`from.id === currentNodeId`）：实色
- **其他**：低饱和灰

SVG z-index 低于 node 按钮，让节点盖住线条端点。

### 8.5 交互流

1. 进入 `in-path`：`<TowerMap>` mounted；玩家看到整张图，`current` 在顶部（step 0）
2. 玩家点击一个 `reachable` 节点 → `TowerMapNode` emit `@select(node.id)`
3. `<TowerMap>` 调 `tower.advanceTo(node.id)`
4. `currentNodeId` 更新 → Vue 响应式触发 `current/reachable/completed` class 重新计算，节点状态视觉变化
5. **phase2 结束于此**——进入战斗、精英掉落、篝火升级都是后续 phase 的事；玩家点到哪都只是 `currentNodeId` 往前推。走到 `bossNodeId` 后也不进战斗，仅仅 `currentNodeId === bossNodeId` 后 next 为空，所有节点都 unreachable，玩家卡在那；phase4 会接 `in-combat`

> phase2 验收 UX：玩家能从 step 0 一路点到 step 13，地图每步呈现正确的视觉过渡；点一个 boss 节点后页面保持 `in-path` 不崩。

### 8.6 可访问性 & 键盘（延后）

phase2 **不做**键盘导航。全鼠标/触屏。phase 7 教程塔可能再补。

---

## 9. 测试策略

### 9.1 `src/tower/graph/generator.test.ts`

1. **确定性**：`generateTowerGraph('same-seed')` 两次产出 `deepEqual` 图
2. **节点总数**：正好 26（`sum(K_SCHEDULE)`）
3. **Step 分布**：各 step 的节点数匹配 `K_SCHEDULE[step]`
4. **Start/Boss**：`graph.nodes[startNodeId].kind === 'start'`、`graph.nodes[bossNodeId].kind === 'boss'`、`graph.nodes[startNodeId].step === 0`、`graph.nodes[bossNodeId].step === 13`
5. **连通性**：从 `startNodeId` BFS 能到达每个节点；反向 BFS（按 next 反向）从 `bossNodeId` 能到达每个节点
6. **硬约束覆盖**（跑 100 seed × 5 个硬约束，全通过）：
   - 约束 1: 所有 step=1 节点 `kind === 'mob'`
   - 约束 2: 不存在相邻 step 的 elite pair（前节点 elite 且其 next 中有 elite）
   - 约束 3: 所有 step=11 节点 `kind !== 'campfire'`
   - 约束 4: 所有 step ∈ {5,7} 节点 `kind !== 'reward'`
   - 约束 5: DFS all paths from start to boss，每条路径 kind 序列含至少一个 elite
7. **不收敛 throw**：构造一个 mock rng 让所有抽样都返回 elite，验证 `generateTowerGraph` 在 5 次迭代后 throw
8. **slot 合法**：每个节点 `0 <= slot < K_SCHEDULE[step]`
9. **边合法**：每条边 `(u, v)` 满足 `v.step === u.step + 1`

### 9.2 `src/tower/graph/constraints.test.ts`

独立校验器的 5 条约束函数单测（纯逻辑，输入手工构造的图）。

### 9.3 `src/tower/graph/loader.test.ts`

1. 合法 YAML → 正确返回 `TowerGraph`
2. 缺字段 → throw `TowerGraphLoaderError` with specific path
3. `next` 指向不存在 id → throw
4. `startNodeId` 不可达 `bossNodeId` → throw
5. 非 YAML 文本 → throw（`yaml.parse` 原生错误 wrap）

### 9.4 `src/stores/tower.test.ts`（追加，不重写）

见 §7.4 清单。

### 9.5 `src/components/tower/TowerMap.test.ts`

- 渲染一张 mock graph（5 节点）
- `current` 节点有 `.current` class
- `reachable` 节点有 `.reachable` class 且可点
- `completed` 节点有 `.completed` class 且 disabled
- 点击 reachable 节点触发 `tower.advanceTo(id)` spy

**不测**：SVG 线条坐标精确值（布局常量可能调；靠视觉 QA 比单测可靠）。

---

## 10. 依赖改动

- 无新增 runtime 依赖（`yaml@2.8.3` 已在）
- 无新增 dev 依赖（`fake-indexeddb` / `jsdom` 已在 phase1 配齐）

---

## 11. 接口契约（phase 3+ 如何消费）

| Consumer | Need | Phase2 接口 |
|---|---|---|
| phase3 职业选择 UI | 在 `selecting-job` 渲染选择界面，确认后进入 in-path | 调 `tower.startDescent()` 即可；本 phase 的 `selecting-job` 分支会被 phase3 替换 |
| phase4 战斗接入 | 点击 mob/elite/boss 节点后切到 `in-combat` | `advanceTo(nodeId)` 推进位置；phase4 在此后读 `run.towerGraph.nodes[run.currentNodeId].kind`，若是战斗 kind 则 `setPhase('in-combat')` 挂 `<EncounterRunner>` |
| phase5 决心 runtime | 节点失败时扣决心并决定重试/放弃/低保 | 复用 `advanceTo(nodeId)` 把节点标记 completed |
| phase6 第 0 节点武器 + 策略卡 | 进入 start kind 节点时弹"3 选 1" UI | 读 `run.currentNodeId` 对应 `node.kind === 'start'`，触发 phase6 弹窗 |
| phase7 教程塔 | 加载 hand-crafted YAML | 调 `loadTowerGraphFromYaml(yamlText)` 得 graph；配合未来新增的 `startTutorial(graph)` action |

---

## 12. Out-of-scope 明示（重复一次）

| 功能 | 延后到 |
|---|---|
| 侦察 / 节点确认弹窗 | phase 4 |
| 战斗节点进战斗 | phase 4 |
| 决心扣减 / Echo buff / 场地机制挂载 | phase 5 |
| 魔晶石激活 / 策略卡抽取 | phase 6 |
| 第 0 节点武器 + 策略卡 3 选 1 UI | phase 6 |
| 篝火功能（升级 / 配装 / 奉献） | phase 6 |
| 结算页 | phase 6 |
| 教程塔 YAML 内容 | phase 7 |
| 键盘导航 / 可访问性 | 后期 |
| 地图美术、背景、音效、动效过场 | 后期 |
| 第 2 层及以上（multi-boss 塔） | post-MVP |
| Seed 赛 / 每日种子社交 | post-MVP |
| 存档版本不匹配的**强制结算补偿金币**（§3.6 `continueLastRun` 已预留 TODO hook） | 金币系统上线后（post-MVP） |

---

## 13. 预期产物清单

```
src/tower/
├── types.ts                       (modify: 新增 'start' kind + slot 字段 + schemaVersion + TOWER_RUN_SCHEMA_VERSION 常量)
├── graph/
│   ├── k-schedule.ts              (new)
│   ├── generator.ts               (new)
│   ├── generator.test.ts          (new)
│   ├── constraints.ts             (new)
│   ├── constraints.test.ts        (new)
│   ├── loader.ts                  (new)
│   └── loader.test.ts             (new)

src/stores/
├── tower.ts                       (modify: +startDescent / +advanceTo / +schemaResetNotice + continueLastRun 版本校验 / createInitialRun 补 schemaVersion)
└── tower.test.ts                  (modify: 追加上述 action 测试)

src/components/tower/
├── TowerMap.vue                   (new)
├── TowerMap.test.ts               (new)
├── TowerMapNode.vue               (new)
└── TowerMapEdges.vue              (new)

src/pages/tower/
└── index.vue                      (modify: 扩展 selecting-job / in-path 分支)
```

Phase 2 **不产生**：图节点素材 YAML（教程塔内容留 phase7）、战斗代码、基础职业技能、魔晶石词条、策略卡、篝火 UI、结算页。
