# Rougelike Tower — Phase 1 (Foundation) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为爬塔肉鸽模式搭建基础设施层 —— 纯类型模块、seeded PRNG、IndexedDB 持久化、Pinia store 与 `/tower` 单路由骨架，为后续 6 个阶段提供稳定的接口与数据契约。

**Architecture:** 新增 `src/tower/` 存放**类型与无副作用工具**（types / random / persistence / events）；新增 `src/stores/tower.ts` 作为运行时状态中心，通过 `$subscribe` 在 `phase` 变更时写入 IndexedDB；新增 `src/pages/tower/index.vue` 作为单路由入口，仅渲染 `phase === 'no-run'` 分支（其余分支后续阶段实现）。所有逻辑（图生成、战斗、策略卡等）留给后续阶段，本阶段不写一行游戏逻辑。

**Tech Stack:** TypeScript (strict) + Vue 3 `<script setup>` + pug + scoped SCSS + UnoCSS (Attributify) + Pinia + vue-router 5 (file-based) + @vueuse/core + localspace (IndexedDB wrapper) + Vitest + fake-indexeddb (test-only)

**Reference spec:** `docs/brainstorm/2026-04-17-rougelike.md`（重点 §2.14 决心 / §2.17 策略卡 / §7.1 MVP In / §7.4 技术架构原则）

---

## Scope（Phase 1 only）

**IN**:
- `src/tower/types.ts` —— `TowerRun` / `TowerRunPhase` / `Weapon` / `Materia` / `Affix` / `RelicCard` / `BattlefieldCondition` / `TowerNode` / `TowerGraph` / `ScoutInfo`
- `src/tower/random.ts` —— seeded PRNG（inline mulberry32）
- `src/tower/persistence.ts` —— IndexedDB 封装（基于 `localspace`）
- `src/tower/events.ts` —— tower-scoped event type 定义 + bus 辅助
- `src/stores/tower.ts` —— `useTowerStore`（Pinia setup store），含 `startNewRun` / `continueLastRun` / `resetRun` / `setPhase` 四个 action + 自动持久化
- `src/pages/tower/index.vue` —— 仅渲染 `'no-run'` 分支的骨架页
- 对应的 colocated `*.test.ts`

**OUT**（call out for the reader）：
- 图生成算法（Phase 2）
- 基础职业/武器/魔晶石的运行时逻辑（Phase 3–6）
- `<EncounterRunner>` 与战斗节点流转（Phase 4）
- 决心系统的 runtime（fail / retry / surrender）与 Echo buff 与战斗场地机制（Phase 5）
- 魔晶石激活、策略卡抽取、0 号节点、篝火、结算页（Phase 6）
- 教程塔内容素材（Phase 7）

本阶段的产物是**类型 + 存档 + 状态机外壳**，跑 `pnpm typecheck` / `pnpm test:run` 必须通过；`/tower` 页面可打开，只会看到"未开始"的占位 UI。

## 关键技术决策

- **PRNG = inline mulberry32**（不装 `seedrandom`）：总共 ~10 行代码、零依赖、算法质量足够支持"断点续玩 / 每日种子 / QA 复现"三类场景。`seedrandom` 约 13 KB minified，其 `Math.random` 替换 API 与多算法切换我们都不需要。
- **IndexedDB 封装 = `localspace`**（按 spec §7.4 指定）。相比 localForage 去掉了 WebSQL / localStorage fallback driver，包体更小。API 基本一致（`getItem` / `setItem` / `removeItem` / `clear`）。
- **测试环境 = `fake-indexeddb`**：Vitest 的 jsdom 默认不提供 IndexedDB。`fake-indexeddb/auto` 一行 import 即可在全局注入 IndexedDB polyfill，生态事实标准。
- **Store 自动持久化策略**：使用 `store.$subscribe`，在 `phase` 变更时（不是每次 mutation）执行 `saveTowerRun(state)`。Phase 1 只要求"phase 切换时持久化"，不要求每帧或每个字段变化时都写盘——这与 spec 对 `TowerRun.phase` 作为状态机 discriminator 的设计一致。

## 任务依赖图

```
Task 1 (依赖安装) → 独立
Task 2 (types) → 被 3/4/5/7 引用
Task 3 (random) → 被 7 引用
Task 4 (persistence) → 被 7 引用
Task 5 (events) → 独立（只依赖 core/event-bus）
Task 6 (fake-indexeddb setup) → 被 4/7 测试引用
Task 7 (store) → 依赖 2/3/4
Task 8 (page) → 依赖 7
```

推荐顺序：1 → 2 → 3 → 6 → 4 → 5 → 7 → 8。

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 安装 localspace 作为 runtime 依赖**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm add localspace
```

Expected: `pnpm-lock.yaml` 更新，`package.json` 的 `dependencies` 新增 `"localspace": "^x.y.z"` 条目。

- [ ] **Step 2: 安装 fake-indexeddb 作为 dev 依赖**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm add -D fake-indexeddb
```

Expected: `package.json` 的 `devDependencies` 新增 `"fake-indexeddb": "^x.y.z"`。

- [ ] **Step 3: 验证两个包可被解析**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && node -e "console.log(require.resolve('localspace')); console.log(require.resolve('fake-indexeddb/auto'))"
```

Expected: 打印出两个 `node_modules` 下的路径，无报错。

- [ ] **Step 4: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add package.json pnpm-lock.yaml && git commit -m "chore(tower): add localspace and fake-indexeddb deps for P1 foundation"
```

---

## Task 2: 定义 `src/tower/types.ts`

**Files:**
- Create: `src/tower/types.ts`

本阶段只写类型，不写实现。类型成为后续所有阶段的契约。

- [ ] **Step 1: 创建 `src/tower/types.ts`**

```ts
// src/tower/types.ts
//
// Phase 1: 类型定义 only. 无 runtime 逻辑.
// 参见 docs/brainstorm/2026-04-17-rougelike.md

// ============================================================
// 基础职业 & 进阶 job
// ============================================================

/** MVP 三个基础职业 ID（Phase 3 将落地为实际 PlayerJob）。 */
export type BaseJobId = 'swordsman' | 'archer' | 'thaumaturge'

/** 进阶 job 通过现有 `src/jobs/` 的 id 引用（string，不做枚举约束，便于未来扩容）。 */
export type AdvancedJobId = string

// ============================================================
// 词条 (Affix)
// ============================================================

/** spec §2.10 词条体系 */
export type AffixType =
  | 'physical-attack'
  | 'magic-attack'
  | 'defense'
  | 'skill-speed'
  | 'crit-rate'
  | 'crit-damage'
  | 'hp'

export interface Affix {
  type: AffixType
  /** 词条等级，决定数值大小；具体数值映射在 Phase 6 的 config 中解析 */
  tier: number
}

// ============================================================
// 武器 (Weapon)
// ============================================================

export interface Weapon {
  /** UUID，区分同 job 的不同武器实例 */
  instanceId: string
  /** 该武器对应的进阶 job id（spec §2.11：切换武器 = 切换到对应 job） */
  advancedJobId: AdvancedJobId
  /** 2 条固定词条（该 job 核心属性） */
  fixedAffixes: [Affix, Affix]
  /** 1 条随机词条 */
  randomAffix: Affix
}

// ============================================================
// 魔晶石 (Materia)
// ============================================================

export interface Materia {
  /** UUID，区分同类魔晶石的不同实例 */
  instanceId: string
  /** 1-3 条词条（spec §2.9） */
  affixes: Affix[]
}

// ============================================================
// 策略卡 (RelicCard) — spec §2.17
// ============================================================

/**
 * 策略卡效果类型（discriminated union）。
 * Phase 6 将扩充 effect 具体字段；Phase 1 只定义占位 tag.
 */
export type RelicCardEffect =
  | { kind: 'numeric'; description: string }
  | { kind: 'rule'; description: string }
  | { kind: 'negative'; description: string }

export interface RelicCard {
  /** 策略卡定义 id（指向配置池） */
  id: string
  name: string
  description: string
  effect: RelicCardEffect
}

// ============================================================
// 场地机制 (BattlefieldCondition) — spec §2.14.3 / §7.4
// ============================================================

/**
 * 场地机制：战斗级别的条件规则.
 * MVP 只实现 'echo' 一种（决心 ≤ X 时给予全属性 +Y%）。
 * Phase 5 会在战斗引擎内消费此类型.
 */
export type BattlefieldCondition =
  | {
      kind: 'echo'
      /** 触发阈值：决心 ≤ 此值时激活 */
      determinationThreshold: number
      /** 全属性加成百分比（如 0.25 = +25%） */
      allStatsBonus: number
    }

// ============================================================
// 塔图 (TowerGraph) — Phase 1 仅类型，生成逻辑在 Phase 2
// ============================================================

/** 节点类型（spec §2.2 的 6 类） */
export type TowerNodeKind =
  | 'mob'
  | 'elite'
  | 'boss'
  | 'campfire'
  | 'reward'
  | 'event'

export interface TowerNode {
  /** 全局唯一 node id（图内） */
  id: number
  /** 第几步（0 = 起点 0 号节点，1-12 = 主干，13 = boss） */
  step: number
  kind: TowerNodeKind
  /** 可达的下一层节点 id（有向图） */
  next: number[]
}

export interface TowerGraph {
  /** 起点节点 id（spec §2.2.1 第 0 节点） */
  startNodeId: number
  /** Boss 节点 id */
  bossNodeId: number
  /** 所有节点，key 为 node id */
  nodes: Record<number, TowerNode>
}

// ============================================================
// 侦察信息 (ScoutInfo) — spec §2.4
// ============================================================

/** 对某节点侦察后缓存的信息 */
export interface ScoutInfo {
  /** 已侦察过的节点一律为 true；unscouted 节点不在 `scoutedNodes` 里 */
  scoutedAt: number
  /** 该战斗节点激活的场地机制（若非战斗节点则为 []） */
  conditions: BattlefieldCondition[]
  /** 展示给玩家的敌人简述；非战斗节点为 null */
  enemySummary: string | null
}

// ============================================================
// 塔图来源 (graph source)
// ============================================================

export type TowerGraphSource =
  | { kind: 'random' }
  | { kind: 'hand-crafted'; id: string }

// ============================================================
// TowerRun — 局内持久化状态的根对象
// ============================================================

/** 运行阶段（状态机 discriminator；spec §7.4） */
export type TowerRunPhase =
  | 'no-run'
  | 'selecting-job'
  | 'in-path'
  | 'in-combat'
  | 'ended'

export interface TowerRun {
  /** UUID，一局一个 */
  runId: string
  /** PRNG seed（spec §7.4 seeded PRNG） */
  seed: string
  /** 图来源（random 或 hand-crafted 教程塔） */
  graphSource: TowerGraphSource
  /** 开始时间 Date.now() */
  startedAt: number
  /** 玩家选择的基础职业 */
  baseJobId: BaseJobId
  /** 塔图（Phase 2 才会填充节点；Phase 1 用空 graph 占位） */
  towerGraph: TowerGraph
  /** 当前所在节点 id */
  currentNodeId: number
  /** 决心（spec §2.14） */
  determination: number
  /** MVP 固定 5 */
  maxDetermination: number
  /** 玩家等级 1–15 */
  level: number
  /** 水晶数量 */
  crystals: number
  /** 当前装备武器 */
  currentWeapon: Weapon | null
  /** 当前进阶 job id（切换武器时同步更新） */
  advancedJobId: AdvancedJobId | null
  /** 背包中所有魔晶石 */
  materia: Materia[]
  /** 已激活的魔晶石 instanceId（MVP 上限 5） */
  activatedMateria: string[]
  /** 持有的策略卡 */
  relics: RelicCard[]
  /** 已侦察节点信息，key 为 node id */
  scoutedNodes: Record<number, ScoutInfo>
  /** 已通过/完成的节点 id（包含放弃低保走完的） */
  completedNodes: number[]
}
```

- [ ] **Step 2: typecheck 通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0，无报错。

- [ ] **Step 3: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/types.ts && git commit -m "feat(tower): add TowerRun/TowerGraph/RelicCard type definitions"
```

---

## Task 3: `src/tower/random.ts` — seeded PRNG

**Files:**
- Create: `src/tower/random.ts`
- Create: `src/tower/random.test.ts`

选择 mulberry32（理由见 "关键技术决策"）。

- [ ] **Step 1: 先写失败的测试 `src/tower/random.test.ts`**

```ts
// src/tower/random.test.ts
import { describe, it, expect } from 'vitest'
import { createRng, seedToUint32 } from '@/tower/random'

describe('seedToUint32', () => {
  it('produces the same uint32 for the same seed string', () => {
    expect(seedToUint32('hello')).toBe(seedToUint32('hello'))
  })

  it('produces a different uint32 for different seed strings', () => {
    expect(seedToUint32('hello')).not.toBe(seedToUint32('world'))
  })
})

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-1')
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('produces a different sequence for different seeds', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-2')
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('returns values in [0, 1)', () => {
    const rng = createRng('range-check')
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('advances state independently per rng instance', () => {
    const rng = createRng('independence')
    const v1 = rng()
    const v2 = rng()
    expect(v1).not.toBe(v2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/random.test.ts
```

Expected: 失败，提示 `Cannot find module '@/tower/random'` 或类似 "module not found" 错误。

- [ ] **Step 3: 实现 `src/tower/random.ts`**

```ts
// src/tower/random.ts
//
// Seeded PRNG (mulberry32). ~10 行的 high-quality 伪随机.
// spec §7.4：所有 tower-mode 随机生成都使用此模块，**禁止 Math.random**.

/**
 * 将任意字符串 seed 哈希到 uint32.
 * 使用 FNV-1a 变体，足够稳定且无依赖.
 */
export function seedToUint32(seed: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Rng = () => number

/**
 * 基于字符串 seed 创建 PRNG. 返回函数每次调用产生 [0, 1) 区间浮点数.
 * 算法：mulberry32，周期 2^32，质量足够游戏级别的随机需求.
 */
export function createRng(seed: string): Rng {
  let state = seedToUint32(seed)
  return function mulberry32(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/random.test.ts
```

Expected: 5 passed。

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/random.ts src/tower/random.test.ts && git commit -m "feat(tower): add seeded PRNG (mulberry32) for reproducible runs"
```

---

## Task 4: IndexedDB 测试环境 — `fake-indexeddb` 接入

Vitest 默认 jsdom 没有 IndexedDB。先把 polyfill 接好，后续 `persistence.test.ts` 和 `tower.test.ts` 都依赖它。

**Files:**
- Modify: `vite.config.ts`

> 注：本仓库用 `vite.config.ts` 同时承载 Vite build config 与 Vitest config（见 `pnpm test` 脚本）。我们在 `test.setupFiles` 里加入 fake-indexeddb auto import，所有 Vitest 测试共享该 setup。

- [ ] **Step 1: 打开 `vite.config.ts`**

Read current file:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && cat vite.config.ts
```

Expected 当前内容顶部为 `import { defineConfig } from 'vite'`，**没有** `test` 字段。

- [ ] **Step 2: 添加 Vitest setup files**

编辑 `vite.config.ts`，在 `defineConfig({...})` 对象末尾（`resolve` 之后）新增 `test` 字段。**修改后的完整文件**：

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import VueRouter from 'vue-router/vite'
import Components from 'unplugin-vue-components/vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  server: {
    forwardConsole: {
      logLevels: ['error', 'warn', 'info'],
    },
  },
  plugins: [
    VueRouter({
      routesFolder: 'src/pages',
      dts: 'src/typed-router.d.ts',
    }),
    Vue({
      template: { preprocessOptions: { pug: {} } },
    }),
    VueJsx(),
    Components({
      dirs: ['src/components'],
      directoryAsNamespace: true,
      collapseSamePrefixes: true,
      dts: 'src/typed-components.d.ts',
    }),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/tower/test-setup.ts'],
  },
})
```

Note: `environment: 'jsdom'` 加入是为了让 IndexedDB polyfill 挂到 `globalThis`；已有的非 DOM 测试（如 `event-bus.test.ts` / `warrior.test.ts`）不会受影响（它们不触碰 DOM API）。

- [ ] **Step 3: 创建 `src/tower/test-setup.ts`**

```ts
// src/tower/test-setup.ts
//
// Vitest global setup:
// - 注入 fake-indexeddb 到 globalThis（Vitest 默认 jsdom 没有 IndexedDB）.
//
// `fake-indexeddb/auto` 会立刻替换全局 indexedDB / IDBKeyRange.
import 'fake-indexeddb/auto'
```

- [ ] **Step 4: 确认 jsdom 可用**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm add -D jsdom
```

Expected: `jsdom` 加入 devDependencies. （Vitest 需要 jsdom 包来启用 jsdom environment；若已存在会 no-op。）

- [ ] **Step 5: 跑已有的 event-bus 测试确认没被 break**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/core/event-bus.test.ts
```

Expected: 5 passed。

- [ ] **Step 6: 写一个 sanity check 确认 fake-indexeddb 已注入**

Create `src/tower/test-setup.test.ts`:

```ts
// src/tower/test-setup.test.ts
import { describe, it, expect } from 'vitest'

describe('test-setup', () => {
  it('injects IndexedDB polyfill globally', () => {
    expect(globalThis.indexedDB).toBeDefined()
    expect(typeof globalThis.indexedDB.open).toBe('function')
  })
})
```

- [ ] **Step 7: 跑 sanity check**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/test-setup.test.ts
```

Expected: 1 passed。

- [ ] **Step 8: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add vite.config.ts src/tower/test-setup.ts src/tower/test-setup.test.ts package.json pnpm-lock.yaml && git commit -m "test(tower): add jsdom + fake-indexeddb global setup for Vitest"
```

---

## Task 5: `src/tower/persistence.ts` — IndexedDB 封装

Wraps localspace 提供三个 async 函数：`saveTowerRun` / `loadTowerRun` / `clearTowerRun`。

**Files:**
- Create: `src/tower/persistence.ts`
- Create: `src/tower/persistence.test.ts`

- [ ] **Step 1: 先写失败的测试 `src/tower/persistence.test.ts`**

```ts
// src/tower/persistence.test.ts
import { beforeEach, describe, it, expect } from 'vitest'
import { saveTowerRun, loadTowerRun, clearTowerRun } from '@/tower/persistence'
import type { TowerRun } from '@/tower/types'

function makeRun(overrides: Partial<TowerRun> = {}): TowerRun {
  return {
    runId: 'test-run-1',
    seed: 'abc',
    graphSource: { kind: 'random' },
    startedAt: 1_700_000_000_000,
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
    ...overrides,
  }
}

describe('persistence', () => {
  beforeEach(async () => {
    await clearTowerRun()
  })

  it('loadTowerRun returns null when no run saved', async () => {
    expect(await loadTowerRun()).toBeNull()
  })

  it('save + load roundtrips a TowerRun object', async () => {
    const run = makeRun({ crystals: 42, level: 7 })
    await saveTowerRun(run)
    const loaded = await loadTowerRun()
    expect(loaded).toEqual(run)
  })

  it('save overwrites previous run', async () => {
    await saveTowerRun(makeRun({ crystals: 10 }))
    await saveTowerRun(makeRun({ crystals: 99 }))
    const loaded = await loadTowerRun()
    expect(loaded?.crystals).toBe(99)
  })

  it('clearTowerRun removes the persisted run', async () => {
    await saveTowerRun(makeRun())
    await clearTowerRun()
    expect(await loadTowerRun()).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/persistence.test.ts
```

Expected: 失败，提示 `Cannot find module '@/tower/persistence'`。

- [ ] **Step 3: 实现 `src/tower/persistence.ts`**

```ts
// src/tower/persistence.ts
//
// IndexedDB 持久化（spec §7.4）.
// 封装 localspace（localforage 的现代替代品）.
// 本阶段只存"当前局" —— 单 key，key 名 'current-run'.
import localspace from 'localspace'
import type { TowerRun } from './types'

// 独立的 IndexedDB 实例，避免污染应用其他存储空间.
const store = localspace.createInstance({
  name: 'xiv-tower',
  storeName: 'tower-runs',
})

const CURRENT_RUN_KEY = 'current-run'

/** 持久化当前 TowerRun. 覆盖式写入. */
export async function saveTowerRun(run: TowerRun): Promise<void> {
  await store.setItem(CURRENT_RUN_KEY, run)
}

/** 读取当前 TowerRun. 无存档时返回 null. */
export async function loadTowerRun(): Promise<TowerRun | null> {
  const raw = await store.getItem<TowerRun>(CURRENT_RUN_KEY)
  return raw ?? null
}

/** 清除当前 TowerRun. 不可恢复. */
export async function clearTowerRun(): Promise<void> {
  await store.removeItem(CURRENT_RUN_KEY)
}
```

> 注：若 `localspace` 的 default export 不是 `{ createInstance }` 形态，实施者需要查看 `node_modules/localspace/package.json` 的 `main`/`types`，按其实际 API 调整 import（例如改为 `import { createInstance } from 'localspace'`）。localspace 自述为 "localforage's modern replacement with unused drivers removed, API nearly identical"，因此 `createInstance / setItem / getItem / removeItem` 是保底约定。

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/persistence.test.ts
```

Expected: 4 passed。

- [ ] **Step 5: typecheck 通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/persistence.ts src/tower/persistence.test.ts && git commit -m "feat(tower): add IndexedDB persistence wrapper via localspace"
```

---

## Task 6: `src/tower/events.ts` — tower-scoped event types

只定义类型与辅助函数，**不注册 handler**。

**Files:**
- Create: `src/tower/events.ts`
- Create: `src/tower/events.test.ts`

- [ ] **Step 1: 先写失败的测试 `src/tower/events.test.ts`**

```ts
// src/tower/events.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/event-bus'
import {
  TOWER_EVENTS,
  onTowerEvent,
  emitTowerEvent,
  type TowerEventMap,
} from '@/tower/events'

describe('tower events', () => {
  it('TOWER_EVENTS exposes all known event names', () => {
    expect(TOWER_EVENTS.RUN_STARTED).toBe('tower:run:started')
    expect(TOWER_EVENTS.RUN_ENDED).toBe('tower:run:ended')
    expect(TOWER_EVENTS.PHASE_CHANGED).toBe('tower:phase:changed')
    expect(TOWER_EVENTS.NODE_ENTERED).toBe('tower:node:entered')
    expect(TOWER_EVENTS.NODE_COMPLETED).toBe('tower:node:completed')
  })

  it('emitTowerEvent delivers typed payloads to onTowerEvent subscribers', () => {
    const bus = new EventBus()
    const handler = vi.fn<(p: TowerEventMap['tower:phase:changed']) => void>()
    onTowerEvent(bus, 'tower:phase:changed', handler)
    emitTowerEvent(bus, 'tower:phase:changed', {
      from: 'no-run',
      to: 'selecting-job',
    })
    expect(handler).toHaveBeenCalledWith({ from: 'no-run', to: 'selecting-job' })
  })

  it('emits are isolated from other event buses', () => {
    const bus1 = new EventBus()
    const bus2 = new EventBus()
    const handler = vi.fn()
    onTowerEvent(bus1, 'tower:run:started', handler)
    emitTowerEvent(bus2, 'tower:run:started', { runId: 'x' })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/events.test.ts
```

Expected: 失败，提示 `Cannot find module '@/tower/events'`.

- [ ] **Step 3: 实现 `src/tower/events.ts`**

```ts
// src/tower/events.ts
//
// Tower 模式的事件名常量 + 强类型 emit/on 辅助.
// 本阶段只定义契约，**不注册任何 handler**.
// 后续阶段直接 import TOWER_EVENTS.* 与 onTowerEvent / emitTowerEvent.
import type { EventBus } from '@/core/event-bus'
import type { TowerRunPhase } from './types'

export const TOWER_EVENTS = {
  RUN_STARTED: 'tower:run:started',
  RUN_ENDED: 'tower:run:ended',
  PHASE_CHANGED: 'tower:phase:changed',
  NODE_ENTERED: 'tower:node:entered',
  NODE_COMPLETED: 'tower:node:completed',
} as const

/** Payload shapes per event name. */
export interface TowerEventMap {
  'tower:run:started': { runId: string }
  'tower:run:ended': { runId: string; reason: 'victory' | 'exhausted' | 'surrendered' }
  'tower:phase:changed': { from: TowerRunPhase; to: TowerRunPhase }
  'tower:node:entered': { nodeId: number }
  'tower:node:completed': { nodeId: number; outcome: 'victory' | 'surrendered' | 'reward-taken' }
}

export type TowerEventName = keyof TowerEventMap

/** Typed subscriber helper. */
export function onTowerEvent<K extends TowerEventName>(
  bus: EventBus,
  name: K,
  handler: (payload: TowerEventMap[K]) => void,
): void {
  bus.on(name, handler as (payload: unknown) => void)
}

/** Typed emitter helper. */
export function emitTowerEvent<K extends TowerEventName>(
  bus: EventBus,
  name: K,
  payload: TowerEventMap[K],
): void {
  bus.emit(name, payload)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/tower/events.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/tower/events.ts src/tower/events.test.ts && git commit -m "feat(tower): add typed event name constants and emit/on helpers"
```

---

## Task 7: `src/stores/tower.ts` — Pinia store

Setup store 模式（与 `useJobStore` / `useDebugStore` 一致），在 `phase` 变更时触发持久化；mount 时从 IndexedDB hydrate 一次。

**Files:**
- Create: `src/stores/tower.ts`
- Create: `src/stores/tower.test.ts`

- [ ] **Step 1: 先写失败的测试 `src/stores/tower.test.ts`**

```ts
// src/stores/tower.test.ts
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTowerStore } from '@/stores/tower'
import * as persistence from '@/tower/persistence'

describe('useTowerStore', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await persistence.clearTowerRun()
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await persistence.clearTowerRun()
  })

  it('initial phase is "no-run"', () => {
    const store = useTowerStore()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('savedRunExists starts false', () => {
    const store = useTowerStore()
    expect(store.savedRunExists).toBe(false)
  })

  it('startNewRun mutates phase to "selecting-job" and creates a run', () => {
    const store = useTowerStore()
    store.startNewRun('swordsman', 'seed-xyz')
    expect(store.phase).toBe('selecting-job')
    expect(store.run).not.toBeNull()
    expect(store.run?.baseJobId).toBe('swordsman')
    expect(store.run?.seed).toBe('seed-xyz')
    expect(store.run?.determination).toBe(5)
    expect(store.run?.maxDetermination).toBe(5)
    expect(store.run?.level).toBe(1)
  })

  it('startNewRun without seed generates a seed string', () => {
    const store = useTowerStore()
    store.startNewRun('archer')
    expect(typeof store.run?.seed).toBe('string')
    expect(store.run?.seed.length).toBeGreaterThan(0)
  })

  it('resetRun clears run and returns phase to "no-run"', () => {
    const store = useTowerStore()
    store.startNewRun('thaumaturge')
    store.resetRun()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('setPhase updates phase discriminator', () => {
    const store = useTowerStore()
    store.startNewRun('swordsman')
    store.setPhase('in-path')
    expect(store.phase).toBe('in-path')
  })

  it('persists run via saveTowerRun when phase changes', async () => {
    const spy = vi.spyOn(persistence, 'saveTowerRun')
    const store = useTowerStore()
    store.startNewRun('swordsman', 'persist-seed')
    // $subscribe is async — wait a microtask
    await Promise.resolve()
    await Promise.resolve()
    expect(spy).toHaveBeenCalled()
    const lastCall = spy.mock.calls.at(-1)
    expect(lastCall?.[0].seed).toBe('persist-seed')
  })

  it('resetRun calls clearTowerRun', async () => {
    const spy = vi.spyOn(persistence, 'clearTowerRun')
    const store = useTowerStore()
    store.startNewRun('swordsman')
    store.resetRun()
    expect(spy).toHaveBeenCalled()
  })

  it('continueLastRun loads persisted run and sets phase to "in-path"', async () => {
    // Seed IndexedDB with a run
    await persistence.saveTowerRun({
      runId: 'persisted-run',
      seed: 'old-seed',
      graphSource: { kind: 'random' },
      startedAt: 1_700_000_000_000,
      baseJobId: 'archer',
      towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
      currentNodeId: 3,
      determination: 4,
      maxDetermination: 5,
      level: 5,
      crystals: 42,
      currentWeapon: null,
      advancedJobId: null,
      materia: [],
      activatedMateria: [],
      relics: [],
      scoutedNodes: {},
      completedNodes: [0, 1, 2],
    })
    const store = useTowerStore()
    await store.continueLastRun()
    expect(store.run?.runId).toBe('persisted-run')
    expect(store.run?.crystals).toBe(42)
    expect(store.phase).toBe('in-path')
  })

  it('continueLastRun is a no-op when no saved run exists', async () => {
    const store = useTowerStore()
    await store.continueLastRun()
    expect(store.phase).toBe('no-run')
    expect(store.run).toBeNull()
  })

  it('hydrate() updates savedRunExists from IndexedDB', async () => {
    await persistence.saveTowerRun({
      runId: 'hydrate-check',
      seed: 's',
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
    await store.hydrate()
    expect(store.savedRunExists).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 失败，提示 `Cannot find module '@/stores/tower'`.

- [ ] **Step 3: 实现 `src/stores/tower.ts`**

```ts
// src/stores/tower.ts
//
// Tower 模式运行时状态中心.
// - state: TowerRun（或 null） + phase discriminator.
// - actions: startNewRun / continueLastRun / resetRun / setPhase / hydrate.
// - 持久化: phase 变更时触发 saveTowerRun，通过 $subscribe 挂接.
//
// **本阶段不含图生成、战斗逻辑**. 所有与图/战斗相关的调用留给 Phase 2+.
import { defineStore } from 'pinia'
import { ref, computed, watch, type Ref } from 'vue'
import type { TowerRun, TowerRunPhase, BaseJobId } from '@/tower/types'
import { saveTowerRun, loadTowerRun, clearTowerRun } from '@/tower/persistence'

/**
 * 生成一个 run id. 优先使用浏览器原生 crypto.randomUUID；兜底返回时间戳 + 随机串.
 */
function generateRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * 生成默认 seed. 与 runId 独立（便于未来支持"固定种子赛"而不改 runId 生成）.
 */
function generateSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `seed-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

/**
 * 创建一个全新 TowerRun 的初始 state.
 * Phase 1: towerGraph 为 empty graph placeholder，Phase 2 会填充.
 */
function createInitialRun(baseJobId: BaseJobId, seed: string): TowerRun {
  return {
    runId: generateRunId(),
    seed,
    graphSource: { kind: 'random' },
    startedAt: Date.now(),
    baseJobId,
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
  }
}

export const useTowerStore = defineStore('tower', () => {
  // ---- state ----
  const phase = ref<TowerRunPhase>('no-run')
  const run = ref<TowerRun | null>(null)
  const savedRunExists = ref(false)

  // 是否由 hydrate / setter 触发的 phase 变更（用于 $subscribe 去重，防止 load 回写）
  let suppressPersist = false

  // ---- derived ----
  const currentBaseJobId = computed(() => run.value?.baseJobId ?? null)

  // ---- actions ----
  function startNewRun(baseJobId: BaseJobId, seed?: string): void {
    run.value = createInitialRun(baseJobId, seed ?? generateSeed())
    phase.value = 'selecting-job'
    savedRunExists.value = true
  }

  async function continueLastRun(): Promise<void> {
    const loaded = await loadTowerRun()
    if (!loaded) return
    suppressPersist = true
    run.value = loaded
    phase.value = 'in-path'
    savedRunExists.value = true
    // 下一个 microtask 恢复持久化
    await Promise.resolve()
    suppressPersist = false
  }

  function resetRun(): void {
    run.value = null
    phase.value = 'no-run'
    savedRunExists.value = false
    // fire-and-forget；clear 失败时不阻塞状态切换
    void clearTowerRun()
  }

  function setPhase(next: TowerRunPhase): void {
    phase.value = next
  }

  async function hydrate(): Promise<void> {
    const loaded = await loadTowerRun()
    savedRunExists.value = loaded !== null
  }

  // ---- 持久化 hook ----
  // 只在 phase 变化时写盘.
  let lastPersistedPhase: TowerRunPhase = phase.value
  function maybePersist(): void {
    if (suppressPersist) return
    if (phase.value === lastPersistedPhase) return
    lastPersistedPhase = phase.value
    if (run.value) {
      void saveTowerRun(run.value)
    }
  }

  // 注意: Pinia setup store 中 $subscribe 的挂载时机——通过返回 store 前不易直接 hook，
  // 改用 Vue 的 watch 实现等价效果.
  // 这里不能直接 import watch —— Pinia setup store 内允许 import.
  // 我们在文件顶部补 import.
  // (见下方 _installSubscribe 调用.)
  _installSubscribe(phase, maybePersist)

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
  }
})

// ------------------------------------------------------------
// helper: 由于 Pinia setup store 外部不方便拿 store 实例去 $subscribe，
// 这里用 Vue watch 监听 phase ref，效果等同.
// ------------------------------------------------------------
function _installSubscribe(phaseRef: Ref<TowerRunPhase>, cb: () => void): void {
  watch(phaseRef, () => cb(), { flush: 'post' })
}
```

> 实施说明：Pinia setup store 内可直接使用 `watch` / `ref` / `computed`。`$subscribe` 在 setup store 里 **不能直接用**（那是 option store API），因此用 `watch(phase, ...)` 等价实现。`flush: 'post'` 保证 phase mutation 已 commit 后再回调——测试用 `await Promise.resolve()` 两次即可覆盖。

- [ ] **Step 4: 跑测试确认通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run src/stores/tower.test.ts
```

Expected: 11 passed。

- [ ] **Step 5: 全量 test 确认没 break 其他**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run
```

Expected: 全部通过（原有测试 + 新增 tower 测试）。

- [ ] **Step 6: typecheck 通过**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0.

- [ ] **Step 7: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/stores/tower.ts src/stores/tower.test.ts && git commit -m "feat(stores): add useTowerStore with IndexedDB-backed phase persistence"
```

---

## Task 8: `src/pages/tower/index.vue` — 单路由骨架

MVP P1 仅渲染 `'no-run'` 分支，其他 phase 显示 "TODO: implemented in later phases" 占位。在路径命名上沿用文件路由约定，`/tower` 对应 `src/pages/tower/index.vue`（与 `/encounter/[id]` 的目录结构一致）。

**Files:**
- Create: `src/pages/tower/index.vue`

- [ ] **Step 1: 创建目录 + 文件**

Run (verify parent exists):
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && ls src/pages
```

Expected: 看到 `about.vue encounter encounters.vue index.vue job.vue`.

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && mkdir -p src/pages/tower
```

Expected: 无输出（目录已创建）.

- [ ] **Step 2: 写 `src/pages/tower/index.vue`**

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
  // Phase 3 将在这里连接职业选择流程.
  // P1: 按钮 disabled，不会被点击.
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

function onTutorial() {
  // Phase 7 将在这里装载教程塔 hand-crafted graph.
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .tower-panel(v-if="tower.phase === 'no-run'")
    .tower-title 爬塔模式
    .tower-subtitle 选择一个入口开始你的攀登
    .tower-actions
      button.tower-btn.primary(
        type="button"
        disabled
        @click="onNewGame"
      ) 新游戏
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
      button.tower-btn.tertiary(
        type="button"
        @click="goHome"
      ) 返回主菜单
  .tower-panel(v-else)
    .tower-title 爬塔模式
    .tower-placeholder
      | Phase: {{ tower.phase }}
    .tower-placeholder
      | TODO: implemented in later phases
    button.tower-btn.tertiary(
      type="button"
      @click="tower.resetRun()"
    ) 重置并返回
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
</style>
```

- [ ] **Step 3: typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm typecheck
```

Expected: 退出码 0。`src/typed-router.d.ts` 会被 VueRouter 插件在 dev/build 时重新生成，typecheck 期间可能仍为旧版；若报 "unused route /tower"，运行 `pnpm dev` 触发一次重新生成或运行 `pnpm build` 也可。若 typecheck 仍然红则手工补 `/tower` 到 `typed-router.d.ts`（最保险：运行 `pnpm dev` 在后台 10 秒后停掉，让 plugin 重新生成该 `.d.ts`）。

- [ ] **Step 4: 启动 dev server 验证路由能访问**

Run in background:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm dev
```

After dev server boots, visit `http://localhost:5173/tower` in a browser or check logs for route registration. Expected: 页面渲染"爬塔模式"标题 + 四个按钮（新游戏 disabled、继续 disabled、教程 disabled、返回主菜单 可点）。

Stop dev server（在合适时机 Ctrl+C 或杀进程）。

- [ ] **Step 5: 全量 test + typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run && pnpm typecheck
```

Expected: 所有测试通过，typecheck 退出码 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/pages/tower/index.vue src/typed-router.d.ts && git commit -m "feat(pages): add /tower route skeleton rendering the no-run phase"
```

> 若 `src/typed-router.d.ts` 未被 VueRouter 插件更新（`git status` 看不到它变动），那就仅 `git add src/pages/tower/index.vue` 即可；插件下次启动时自动更新并可单独提交。

---

## Task 9: Wire `/tower` 入口到主菜单

主菜单 `src/pages/index.vue` 现有三个按钮（开始关卡 / 查看职业 / 帮助）。为了让 `/tower` 入口可触达，新增一个按钮。

**Files:**
- Modify: `src/pages/index.vue`

- [ ] **Step 1: 编辑 `src/pages/index.vue`，在 `(开始关卡)` 与 `(查看职业)` 之间插入爬塔入口**

Replace the `<template>` block with:

```pug
<template lang="pug">
MenuShell
  RouterLink.menu-btn.primary(to="/encounters") ▶ &nbsp;开始关卡
  RouterLink.menu-btn.primary(to="/tower") ◈ &nbsp;爬塔模式
  RouterLink.menu-btn.secondary(to="/job")
    | ⚔ &nbsp;查看职业
    span.job-name {{ jobStore.job.name }}
  RouterLink.menu-btn.tertiary(to="/about") ◆ &nbsp;帮助 & 关于
</template>
```

（其余 `<script setup>` 与 `<style>` 保持不变.）

- [ ] **Step 2: 启动 dev server 目视确认**

Run in background:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm dev
```

Expected: 主菜单出现 "◈ 爬塔模式" 按钮，点击后进入 `/tower` 路由并看到 no-run UI。

Stop dev server。

- [ ] **Step 3: 全量 test + typecheck**

Run:
```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run && pnpm typecheck
```

Expected: 通过。

- [ ] **Step 4: Commit**

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && git add src/pages/index.vue && git commit -m "feat(pages): add tower mode entry to main menu"
```

---

## Phase 1 完成验收

所有任务完成后执行：

```bash
cd /Users/xiaoyujun/GitRepositories/web-fantasy-xiv && pnpm test:run && pnpm typecheck && pnpm build
```

**预期产物清单**（`git ls-files | grep -E '^src/(tower|stores/tower|pages/tower)|vite.config' `）：

- `src/tower/types.ts`
- `src/tower/random.ts` + `src/tower/random.test.ts`
- `src/tower/persistence.ts` + `src/tower/persistence.test.ts`
- `src/tower/events.ts` + `src/tower/events.test.ts`
- `src/tower/test-setup.ts` + `src/tower/test-setup.test.ts`
- `src/stores/tower.ts` + `src/stores/tower.test.ts`
- `src/pages/tower/index.vue`
- `vite.config.ts`（修改：新增 `test` 字段）
- `src/pages/index.vue`（修改：新增爬塔入口）
- `package.json` / `pnpm-lock.yaml`（新增 localspace / fake-indexeddb / jsdom）

**Phase 1 不产生任何**：图生成 / 战斗代码 / 职业 / 武器实例 / 魔晶石 / 策略卡 / 篝火 / 教程内容。这些都是后续阶段的工作。
