# Rougelike Tower — Phase 4 (Combat Node Integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把战斗节点接入爬塔流程（确认/侦察弹窗 → 嵌入战斗 → 结算回流 → 决心扣减 → 放弃低保 → run 结束），同时落地 pool 版本化基础设施（Registry / Active Pool / 三层版本体系 / 开局固化）。

**Architecture:** Pool Registry / Active Pool 分离；开局 `startDescent()` 把 encounterId 物化到 `TowerNode`；`<EncounterRunner>` 组件抽离供 tower 与独立模拟器共用；战斗结束事件 `combat:ended` 由 runner emit 到宿主，tower 宿主消费后做决心扣减 / 水晶奖励 / phase 流转。4 个小怪 encounter YAML + 1 个 fallback 用"`loop` action + stackable `mob_enrage` buff"纯配置实现 GDD §2.5.1 软超时。

**Tech Stack:** TypeScript (strict), Vue 3 `<script setup>` + pug + scoped scss + UnoCSS, Pinia, Vitest (colocated `*.test.ts`), YAML (`yaml` pkg), IndexedDB (localspace via existing `src/tower/persistence.ts`).

**Spec reference:** `docs/superpowers/specs/2026-04-18-rougelike-p4-combat-nodes-design.md`
**Engineering principles:** `docs/tower-engineering-principles.md`

---

## File Structure Map

### 新建

| 文件 | 责任 |
|------|------|
| `src/tower/blueprint/version.ts` | `TOWER_BLUEPRINT_CURRENT` + `TOWER_BLUEPRINT_MIN_SUPPORTED` 常量 |
| `src/tower/pools/encounter-pool.ts` | Encounter pool resolver：manifest 加载 / `resolveEncounter(id)` / `pickEncounterIdFromActivePool(seed, nodeId, kind)` |
| `src/tower/pools/encounter-pool.test.ts` | Resolver 单元测试 |
| `public/tower/pools/encounter-pool.json` | Manifest 文件（Registry + Active Pool 合一） |
| `public/encounters/tower/mob-frost-sprite.yaml` | 冰主题小怪 |
| `public/encounters/tower/mob-fire-elemental.yaml` | 火主题小怪 |
| `public/encounters/tower/mob-chain-marker.yaml` | 点名主题小怪 |
| `public/encounters/tower/mob-arena-shrinker.yaml` | 场地收缩主题小怪 |
| `public/encounters/tower/mob-fallback.yaml` | Defensive fallback，从不进 Active Pool |
| `src/components/tower/NodeConfirmPanel.vue` | 节点确认 / 侦察覆盖层 |
| `src/components/tower/EncounterRunner.vue` | 战斗嵌入组件（canvas + HUD + scene lifecycle） |
| `src/components/tower/BattleResultOverlay.vue` | 爬塔战斗结束覆盖层 |
| `src/components/tower/TowerEndedScreen.vue` | 最简 ended 尾屏 |
| `src/components/tower/RunStatusBar.vue` | 运行时常驻状态栏（职业/等级/❤️/💎/装备 stub/魔晶石 stub） |

### 修改

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | — 本 phase 不改（`TowerNode` / `TowerRun` 在 `src/tower/types.ts`） |
| `src/tower/types.ts` | `TowerNode.encounterId?: string` 新增；`TowerRun.blueprintVersion: number` 新增；`TOWER_RUN_SCHEMA_VERSION` 1 → 2 |
| `src/game/encounter-loader.ts` | 解析 `raw.local_buffs` 段；`EncounterData` 新增 `localBuffs: Record<string, BuffDef>` |
| `src/config/schema.ts` | 若 `BuffDef` 解析逻辑在此，需要加 `parseBuffConfig` 接入 local_buffs；否则跳过（implementer 勘查） |
| `src/game/battle-runner.ts` | load encounter 后注册 `localBuffs` 到 `combatResolver.registerBuffs`；`combat:ended` payload 加 `elapsed: number` |
| `src/stores/tower.ts` | `createInitialRun` 注入 `blueprintVersion`；`startDescent` 填 `encounterId`；`continueLastRun` 校验 blueprintVersion；新增 action `enterCombat` / `scoutNode` / `resolveVictory` / `deductDeterminationOnWipe` / `abandonCurrentCombat` / `checkEndedCondition` |
| `src/stores/tower.test.ts` | 新增 test cases |
| `src/pages/tower/index.vue` | 去 `.tower-title` 常驻；挂 `RunStatusBar` / `NodeConfirmPanel` / `EncounterRunner` / `BattleResultOverlay` / `TowerEndedScreen`；新增 `in-combat` / `ended` phase 分支；`in-path` 分支接侦察/确认面板 |
| `src/components/tower/TowerMap.vue` | `onNodeClick` 改为触发 emit `node-click` 给父（父挂面板），不再直接 `advanceTo` |
| `src/pages/encounter/[id].vue` | 模板简化为 `<EncounterRunner>` + 练习模式 onInit + tutorial skip |

---

## Execution Phases

- **Phase A — Foundation**（Task 1-3）：schema bump + blueprint 常量 + store migration 校验
- **Phase B — Pool Infrastructure**（Task 4-6）：resolver 模块 + encounter-loader `local_buffs` 扩展
- **Phase C — Encounter Content**（Task 7-12）：5 个 YAML + manifest + 集成测试
- **Phase D — Store Actions**（Task 13-18）：scout / enterCombat / resolveVictory / deductDeterminationOnWipe / abandonCurrentCombat / checkEndedCondition + startDescent 填 encounterId
- **Phase E — Battle Event Bridge**（Task 19）：`combat:ended` payload 添加 `elapsed`
- **Phase F — UI Component Extraction**（Task 20-21）：`EncounterRunner` 抽离 + `/encounter/[id]` 重构
- **Phase G — Tower UI Components**（Task 22-25）：`RunStatusBar` / `NodeConfirmPanel` / `BattleResultOverlay` / `TowerEndedScreen`
- **Phase H — Integration**（Task 26-28）：`TowerMap` 事件上浮 + `/tower/index.vue` 接线 + 手动 QA checklist

---

## Phase A — Foundation

### Task 1: 新增 blueprint 版本常量

**Files:**
- Create: `src/tower/blueprint/version.ts`
- Create: `src/tower/blueprint/version.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tower/blueprint/version.test.ts
import { describe, it, expect } from 'vitest'
import { TOWER_BLUEPRINT_CURRENT, TOWER_BLUEPRINT_MIN_SUPPORTED } from './version'

describe('tower blueprint version', () => {
  it('initializes CURRENT to 1', () => {
    expect(TOWER_BLUEPRINT_CURRENT).toBe(1)
  })

  it('initializes MIN_SUPPORTED to 1', () => {
    expect(TOWER_BLUEPRINT_MIN_SUPPORTED).toBe(1)
  })

  it('MIN_SUPPORTED <= CURRENT invariant', () => {
    expect(TOWER_BLUEPRINT_MIN_SUPPORTED).toBeLessThanOrEqual(TOWER_BLUEPRINT_CURRENT)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/tower/blueprint/version.test.ts --run`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tower/blueprint/version.ts
/**
 * 当前塔蓝图版本。加节点 kind / 改图生成算法 / 改 K_SCHEDULE 时 bump。
 * 老存档 blueprintVersion < 此值仍可加载（除非低于 MIN_SUPPORTED）。
 *
 * 详见 docs/tower-engineering-principles.md §1 三层版本体系。
 */
export const TOWER_BLUEPRINT_CURRENT = 1 as const

/**
 * 最低支持的塔蓝图版本。老存档 blueprintVersion < 此值 → 强制作废。
 * 只在 "必须掀桌" 时 bump，与 changelog / 公告联动。
 */
export const TOWER_BLUEPRINT_MIN_SUPPORTED = 1 as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/tower/blueprint/version.test.ts --run`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tower/blueprint/version.ts src/tower/blueprint/version.test.ts
git commit -m "feat(tower): add blueprint version constants (phase 4 foundation)"
```

---

### Task 2: `TowerRun.blueprintVersion` + `TowerNode.encounterId` 字段 + SCHEMA bump

**Files:**
- Modify: `src/tower/types.ts`

**Context:** 这一步会破坏现有存档（SCHEMA_VERSION 1 → 2）。phase 3 的测试存档会被 reset；这是设计预期代价。

- [ ] **Step 1: Write failing tests**

Add to `src/tower/types.test.ts` (create if not exists — if exists append; verify first):

```bash
ls src/tower/types.test.ts 2>/dev/null && echo EXISTS || echo NEW
```

If NEW, create with:
```ts
// src/tower/types.test.ts
import { describe, it, expect } from 'vitest'
import { TOWER_RUN_SCHEMA_VERSION, type TowerRun, type TowerNode } from './types'

describe('tower types', () => {
  it('TOWER_RUN_SCHEMA_VERSION is 2 (phase 4 bump)', () => {
    expect(TOWER_RUN_SCHEMA_VERSION).toBe(2)
  })

  it('TowerRun accepts blueprintVersion number', () => {
    // compile-time check: TS will fail if field missing from type
    const run: Partial<TowerRun> = { blueprintVersion: 1 }
    expect(run.blueprintVersion).toBe(1)
  })

  it('TowerNode accepts optional encounterId', () => {
    const node: Partial<TowerNode> = { encounterId: 'mob-frost-sprite' }
    expect(node.encounterId).toBe('mob-frost-sprite')
  })

  it('TowerNode encounterId is optional (undefined OK)', () => {
    const node: Partial<TowerNode> = {}
    expect(node.encounterId).toBeUndefined()
  })
})
```

If types.test.ts EXISTS, append only the new test cases above at the end.

- [ ] **Step 2: Run test to verify failures**

Run: `pnpm test src/tower/types.test.ts --run`
Expected: FAIL — SCHEMA_VERSION mismatch + types may not yet have new fields (TS will fail)

- [ ] **Step 3: Implementation**

Edit `src/tower/types.ts`:

1. Find `TOWER_RUN_SCHEMA_VERSION = 1` → change to `2`. Update its doc comment to add: "phase 4 bump = 2（TowerRun.blueprintVersion + TowerNode.encounterId 字段加入）"

2. In `TowerNode` interface, append after `next: number[]`:
```ts
  /**
   * 战斗节点（kind === 'mob' | 'elite' | 'boss'）开局固化的 encounter id；
   * 非战斗节点 undefined。新开局在 startDescent 时按 seed 从 Active Pool 抽取。
   */
  encounterId?: string
```

3. In `TowerRun` interface, insert after `schemaVersion: number`:
```ts
  /**
   * 塔蓝图版本号；开局 = TOWER_BLUEPRINT_CURRENT。
   * 加载时校验顺序：schemaVersion → blueprintVersion (<MIN_SUPPORTED → reset; >CURRENT → defensive reset)。
   * 详见 docs/tower-engineering-principles.md §1。
   */
  blueprintVersion: number
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/tower/types.test.ts --run`
Expected: PASS (4 tests new + existing pass)

Run: `pnpm typecheck`
Expected: compile errors in places where `createInitialRun` / store code doesn't yet set `blueprintVersion` — **these will be fixed in Task 3**. If typecheck shows unrelated errors, fix them. If errors are only about missing `blueprintVersion`, proceed to next step (Task 3 resolves).

Note: 因为 TS strict mode 可能让该 typecheck 失败。若失败但错误仅限于 `blueprintVersion` 缺失，允许暂存继续 Task 3；Task 3 commit 前必须 typecheck clean。

- [ ] **Step 5: Commit**

```bash
git add src/tower/types.ts src/tower/types.test.ts
git commit -m "feat(tower): schema v2 — add blueprintVersion + TowerNode.encounterId"
```

---

### Task 3: `createInitialRun` + `continueLastRun` 注入 blueprintVersion + 校验

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts` (create if not exists)

- [ ] **Step 1: Check if tower.test.ts exists + inspect existing structure**

```bash
ls src/stores/tower.test.ts 2>/dev/null && head -30 src/stores/tower.test.ts || echo NEW
```

If NEW, seed file:
```ts
// src/stores/tower.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTowerStore } from './tower'

beforeEach(() => {
  setActivePinia(createPinia())
})
```

- [ ] **Step 2: Write failing tests for blueprintVersion init + validation**

Append to `src/stores/tower.test.ts`:

```ts
import { TOWER_BLUEPRINT_CURRENT, TOWER_BLUEPRINT_MIN_SUPPORTED } from '@/tower/blueprint/version'
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'

describe('tower store — blueprint version', () => {
  it('startNewRun initializes run.blueprintVersion to CURRENT', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman')
    expect(tower.run?.blueprintVersion).toBe(TOWER_BLUEPRINT_CURRENT)
  })

  it('continueLastRun accepts blueprintVersion in range [MIN_SUPPORTED, CURRENT]', async () => {
    // manually stuff an IDB-loaded run (schemaVersion = 2, blueprintVersion = 1)
    // via mocking loadTowerRun:
    const mockRun = {
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
      blueprintVersion: TOWER_BLUEPRINT_CURRENT,
      runId: 'r1', seed: 's1', graphSource: { kind: 'random' as const },
      startedAt: Date.now(), baseJobId: 'swordsman' as const,
      towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
      currentNodeId: 0, determination: 5, maxDetermination: 5,
      level: 1, crystals: 0, currentWeapon: null, advancedJobId: null,
      materia: [], activatedMateria: [], relics: [],
      scoutedNodes: {}, completedNodes: [],
    }
    const persistence = await import('@/tower/persistence')
    vi.spyOn(persistence, 'loadTowerRun').mockResolvedValue(mockRun)
    const tower = useTowerStore()
    await tower.continueLastRun()
    expect(tower.run).not.toBeNull()
    expect(tower.phase).toBe('ready-to-descend')
  })

  it('continueLastRun resets when blueprintVersion < MIN_SUPPORTED', async () => {
    const mockRun = {
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
      blueprintVersion: 0,  // below MIN_SUPPORTED
      runId: 'r1', seed: 's1', graphSource: { kind: 'random' as const },
      startedAt: Date.now(), baseJobId: 'swordsman' as const,
      towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
      currentNodeId: 0, determination: 5, maxDetermination: 5,
      level: 1, crystals: 0, currentWeapon: null, advancedJobId: null,
      materia: [], activatedMateria: [], relics: [],
      scoutedNodes: {}, completedNodes: [],
    }
    const persistence = await import('@/tower/persistence')
    vi.spyOn(persistence, 'loadTowerRun').mockResolvedValue(mockRun)
    const tower = useTowerStore()
    await tower.continueLastRun()
    expect(tower.run).toBeNull()
    expect(tower.phase).toBe('no-run')
    expect(tower.schemaResetNotice).toBe(true)
  })

  it('continueLastRun resets when blueprintVersion > CURRENT (defensive)', async () => {
    const mockRun = {
      schemaVersion: TOWER_RUN_SCHEMA_VERSION,
      blueprintVersion: 999,  // from the future
      runId: 'r1', seed: 's1', graphSource: { kind: 'random' as const },
      startedAt: Date.now(), baseJobId: 'swordsman' as const,
      towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
      currentNodeId: 0, determination: 5, maxDetermination: 5,
      level: 1, crystals: 0, currentWeapon: null, advancedJobId: null,
      materia: [], activatedMateria: [], relics: [],
      scoutedNodes: {}, completedNodes: [],
    }
    const persistence = await import('@/tower/persistence')
    vi.spyOn(persistence, 'loadTowerRun').mockResolvedValue(mockRun)
    const tower = useTowerStore()
    await tower.continueLastRun()
    expect(tower.run).toBeNull()
    expect(tower.phase).toBe('no-run')
  })
})
```

- [ ] **Step 3: Run tests to verify failures**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL (store doesn't init / validate blueprintVersion yet)

- [ ] **Step 4: Implementation**

Edit `src/stores/tower.ts`:

1. Add import at top:
```ts
import { TOWER_BLUEPRINT_CURRENT, TOWER_BLUEPRINT_MIN_SUPPORTED } from '@/tower/blueprint/version'
```

2. In `createInitialRun`, insert after `schemaVersion: TOWER_RUN_SCHEMA_VERSION,`:
```ts
    blueprintVersion: TOWER_BLUEPRINT_CURRENT,
```

3. In `continueLastRun`, after the existing `schemaVersion` check, insert blueprintVersion check:
```ts
    // Phase 4: blueprint version gate — after schemaVersion passes
    if (loaded.blueprintVersion === undefined || loaded.blueprintVersion < TOWER_BLUEPRINT_MIN_SUPPORTED) {
      console.warn(
        `[tower] saved run blueprintVersion ${loaded.blueprintVersion} ` +
          `< MIN_SUPPORTED ${TOWER_BLUEPRINT_MIN_SUPPORTED}, resetting`,
      )
      resetRun()
      schemaResetNotice.value = true
      return
    }
    if (loaded.blueprintVersion > TOWER_BLUEPRINT_CURRENT) {
      console.error(
        `[tower] saved run blueprintVersion ${loaded.blueprintVersion} ` +
          `> CURRENT ${TOWER_BLUEPRINT_CURRENT} (impossible rollback?), resetting`,
      )
      resetRun()
      schemaResetNotice.value = true
      return
    }
```

Place these between the existing `schemaVersion` check and the `suppressPersist = true` line.

- [ ] **Step 5: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS (new tests + existing pass)

Run: `pnpm typecheck`
Expected: clean (blueprintVersion now always set)

- [ ] **Step 6: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): initialize and validate blueprintVersion in store"
```

---

## Phase B — Pool Infrastructure

### Task 4: `encounter-loader.ts` 支持 `local_buffs` 解析

**Files:**
- Modify: `src/game/encounter-loader.ts`
- Test: `src/game/encounter-loader.test.ts` (create if not exists; check first)

**Context:** 当前 encounter-loader 有 `local_skills` 支持但无 `local_buffs`。phase 4 小怪 YAML 依赖本地 buff 定义。

- [ ] **Step 1: Check if encounter-loader.test.ts exists**

```bash
ls src/game/encounter-loader.test.ts 2>/dev/null && echo EXISTS || echo NEW
```

- [ ] **Step 2: Write failing test**

If NEW, create with header + first test. If exists, append.

```ts
// src/game/encounter-loader.test.ts (create or append)
import { describe, it, expect } from 'vitest'
import { parseEncounterYaml } from './encounter-loader'

describe('encounter-loader local_buffs', () => {
  it('parses local_buffs section into localBuffs map', () => {
    const yaml = `
arena: { name: test, shape: circle, radius: 15, boundary: wall }
entities: {}
player: {}
boss_ai: {}
skills: {}
local_buffs:
  test_enrage:
    name: 测试愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }
`
    const data = parseEncounterYaml(yaml)
    expect(data.localBuffs).toBeDefined()
    expect(data.localBuffs!.test_enrage).toBeDefined()
    expect(data.localBuffs!.test_enrage.stackable).toBe(true)
    expect(data.localBuffs!.test_enrage.maxStacks).toBe(20)
    expect(data.localBuffs!.test_enrage.effects).toEqual([{ type: 'damage_increase', value: 0.15 }])
  })

  it('returns empty localBuffs when section missing', () => {
    const yaml = `
arena: { name: test, shape: circle, radius: 15, boundary: wall }
entities: {}
player: {}
boss_ai: {}
skills: {}
`
    const data = parseEncounterYaml(yaml)
    expect(data.localBuffs).toBeDefined()
    expect(Object.keys(data.localBuffs!).length).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `pnpm test src/game/encounter-loader.test.ts --run`
Expected: FAIL (no `localBuffs` field on `EncounterData`)

- [ ] **Step 4: Implementation**

Edit `src/game/encounter-loader.ts`:

1. Add import at top (check if already present):
```ts
import type { BuffDef } from '@/core/types'
```

2. In `EncounterData` interface, append:
```ts
  /** Buff definitions local to this encounter; registered into combatResolver at scene init. */
  localBuffs: Record<string, BuffDef>
```

3. In `parseEncounterYaml` function, after `// Skills` block (around line 107), add:
```ts
  // Local buffs (defined inline in encounter YAML)
  const localBuffs: Record<string, BuffDef> = {}
  if (raw.local_buffs) {
    for (const [id, def] of Object.entries(raw.local_buffs as Record<string, any>)) {
      localBuffs[id] = {
        id,
        name: def.name ?? id,
        type: def.type ?? 'buff',
        duration: def.duration ?? 0,
        stackable: def.stackable ?? false,
        maxStacks: def.maxStacks ?? 1,
        effects: def.effects ?? [],
        ...(def.icon != null ? { icon: def.icon } : {}),
        ...(def.preserveOnDeath != null ? { preserveOnDeath: def.preserveOnDeath } : {}),
      }
    }
  }
```

4. In the return statement, add `localBuffs` to the returned object:
```ts
  return { arena, entities, boss, player, bossAI, skills, timeline, phases, localBuffs }
```

- [ ] **Step 5: Run tests**

Run: `pnpm test src/game/encounter-loader.test.ts --run`
Expected: PASS

Run: `pnpm typecheck`
Expected: clean (may surface usage errors if `EncounterData` consumers missed the field — fix in Task 5)

- [ ] **Step 6: Commit**

```bash
git add src/game/encounter-loader.ts src/game/encounter-loader.test.ts
git commit -m "feat(encounter): support local_buffs section in encounter YAML"
```

---

### Task 5: `battle-runner` 注册 localBuffs 到 combatResolver

**Files:**
- Modify: `src/game/battle-runner.ts`

**Context:** Task 4 让 `EncounterData.localBuffs` 有了数据；这一步让 scene 实际用起来。

- [ ] **Step 1: Manual verification test (dev server)**

No unit test needed (integration boundary). Add a commented test plan to battle-runner.ts near the change:

Before code change, note in task: "manual verification at end of task."

- [ ] **Step 2: Implementation**

Edit `src/game/battle-runner.ts`:

Find line `s.combatResolver.registerBuffs(job.buffs)` (around line 129), and insert **after** it:

```ts
  // Register encounter-local buffs (from YAML local_buffs section)
  if (enc.localBuffs && Object.keys(enc.localBuffs).length > 0) {
    s.combatResolver.registerBuffs(enc.localBuffs)
    // Merge into s.buffDefs so HUD tooltip can lookup
    s.buffDefs = { ...s.buffDefs, ...enc.localBuffs }
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 4: Full test suite regression**

Run: `pnpm test:run`
Expected: all existing tests pass (no regression from this edit)

- [ ] **Step 5: Commit**

```bash
git add src/game/battle-runner.ts
git commit -m "feat(battle): register encounter-local buffs into scene combatResolver"
```

---

### Task 6: Encounter pool resolver 模块 + 测试

**Files:**
- Create: `src/tower/pools/encounter-pool.ts`
- Create: `src/tower/pools/encounter-pool.test.ts`

**Context:** 当前 manifest 文件还没有（Task 12 才建）。这一步先实装 resolver 逻辑 + 单元测试，测试里用 mock manifest。

- [ ] **Step 1: Write failing tests**

```ts
// src/tower/pools/encounter-pool.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadEncounterPool,
  resolveEncounter,
  pickEncounterIdFromActivePool,
  _resetEncounterPoolCache,
  FALLBACK_ENCOUNTER_ID,
  type EncounterPoolEntry,
} from './encounter-pool'

const mockManifest = {
  manifestVersion: 1,
  entries: [
    { id: 'mob-a', yamlPath: 'encounters/tower/mob-a.yaml', kind: 'mob', scoutSummary: 'A', rewards: { crystals: 10 } },
    { id: 'mob-b', yamlPath: 'encounters/tower/mob-b.yaml', kind: 'mob', scoutSummary: 'B', rewards: { crystals: 10 } },
    { id: 'mob-c', yamlPath: 'encounters/tower/mob-c.yaml', kind: 'mob', scoutSummary: 'C', rewards: { crystals: 10 } },
    { id: 'mob-retired', yamlPath: 'encounters/tower/archive/mob-retired.yaml', kind: 'mob', scoutSummary: 'R', rewards: { crystals: 5 }, deprecated: '2026-05-01' },
    { id: 'mob-fallback', yamlPath: 'encounters/tower/mob-fallback.yaml', kind: 'mob', scoutSummary: 'fallback', rewards: { crystals: 10 }, deprecated: 'never-in-pool' },
  ] satisfies EncounterPoolEntry[],
}

beforeEach(() => {
  _resetEncounterPoolCache()
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => mockManifest,
  }) as any
})

describe('encounter-pool', () => {
  it('loadEncounterPool fetches and caches manifest', async () => {
    const first = await loadEncounterPool()
    const second = await loadEncounterPool()
    expect(first).toBe(second)  // same reference = cached
    expect((globalThis.fetch as any).mock.calls.length).toBe(1)
  })

  it('resolveEncounter returns found entry for live id', async () => {
    const entry = await resolveEncounter('mob-a')
    expect(entry.id).toBe('mob-a')
    expect(entry.scoutSummary).toBe('A')
  })

  it('resolveEncounter returns found entry for deprecated id (Registry walk)', async () => {
    const entry = await resolveEncounter('mob-retired')
    expect(entry.id).toBe('mob-retired')
    expect(entry.deprecated).toBe('2026-05-01')
  })

  it('resolveEncounter falls back to mob-fallback when id missing, and logs error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entry = await resolveEncounter('mob-nonexistent')
    expect(entry.id).toBe(FALLBACK_ENCOUNTER_ID)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('pickEncounterIdFromActivePool excludes deprecated entries', async () => {
    const picked = new Set<string>()
    for (let nodeId = 0; nodeId < 100; nodeId++) {
      const id = await pickEncounterIdFromActivePool('seed-1', nodeId, 'mob')
      picked.add(id)
    }
    expect(picked.has('mob-retired')).toBe(false)
    expect(picked.has('mob-fallback')).toBe(false)
    expect(picked.has('mob-a')).toBe(true)
  })

  it('pickEncounterIdFromActivePool is deterministic for same (seed, nodeId)', async () => {
    const a = await pickEncounterIdFromActivePool('seed-X', 42, 'mob')
    const b = await pickEncounterIdFromActivePool('seed-X', 42, 'mob')
    expect(a).toBe(b)
  })

  it('pickEncounterIdFromActivePool varies by nodeId', async () => {
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      ids.add(await pickEncounterIdFromActivePool('seed-vary', i, 'mob'))
    }
    expect(ids.size).toBeGreaterThan(1)
  })

  it('pickEncounterIdFromActivePool throws when kind has no active entries', async () => {
    await expect(pickEncounterIdFromActivePool('seed-1', 0, 'boss')).rejects.toThrow(/active pool/i)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/tower/pools/encounter-pool.test.ts --run`
Expected: FAIL (module does not exist)

- [ ] **Step 3: Implementation**

```ts
// src/tower/pools/encounter-pool.ts
//
// Encounter pool resolver.
// - Registry: all entries in manifest (including deprecated) — existing-save references
// - Active Pool: !deprecated entries — new-run rng picks from here
// - Fallback: resolveEncounter returns FALLBACK_ENCOUNTER_ID entry on miss + console.error
//
// 详见 docs/tower-engineering-principles.md §2 Pool Registry / Active Pool 分离。

import { createRng } from '@/tower/random'

export interface EncounterPoolEntry {
  id: string
  yamlPath: string
  kind: 'mob' | 'elite' | 'boss'
  scoutSummary: string
  rewards: { crystals: number }
  /** ISO date string or sentinel ('never-in-pool' for fallback entries). Non-undefined = excluded from Active Pool. */
  deprecated?: string
}

interface EncounterPoolManifest {
  manifestVersion: number
  entries: EncounterPoolEntry[]
}

export const FALLBACK_ENCOUNTER_ID = 'mob-fallback'
const MANIFEST_URL = `${import.meta.env.BASE_URL}tower/pools/encounter-pool.json`

let poolCache: EncounterPoolManifest | null = null
let inflight: Promise<EncounterPoolManifest> | null = null

/** Test-only: reset module-level cache. */
export function _resetEncounterPoolCache(): void {
  poolCache = null
  inflight = null
}

export async function loadEncounterPool(): Promise<EncounterPoolManifest> {
  if (poolCache) return poolCache
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch(MANIFEST_URL)
    if (!res.ok) {
      throw new Error(`[encounter-pool] manifest fetch failed: ${res.status}`)
    }
    const manifest = (await res.json()) as EncounterPoolManifest
    poolCache = manifest
    inflight = null
    return manifest
  })()
  return inflight
}

/**
 * Resolve an encounter id to its manifest entry. Walks the full Registry
 * (including deprecated entries). Falls back to FALLBACK_ENCOUNTER_ID
 * + console.error when id is missing.
 *
 * Normal operation (per append-only contract) should never hit the fallback;
 * only triggered by misconfiguration (deleted YAML / manifest entry).
 */
export async function resolveEncounter(id: string): Promise<EncounterPoolEntry> {
  const manifest = await loadEncounterPool()
  const found = manifest.entries.find((e) => e.id === id)
  if (found) return found
  console.error(
    `[encounter-pool] resolveEncounter('${id}') miss — Registry contract violated. ` +
      `Falling back to '${FALLBACK_ENCOUNTER_ID}'. Check manifest entry not deleted.`,
  )
  const fallback = manifest.entries.find((e) => e.id === FALLBACK_ENCOUNTER_ID)
  if (!fallback) {
    throw new Error(
      `[encounter-pool] FALLBACK entry '${FALLBACK_ENCOUNTER_ID}' missing from manifest — ` +
        `this is a hard project invariant violation.`,
    )
  }
  return fallback
}

/**
 * Pick an encounter id from Active Pool (!deprecated) deterministically by seed.
 * Used at startDescent() to crystallize encounterId into each battle node.
 */
export async function pickEncounterIdFromActivePool(
  seed: string,
  nodeId: number,
  kind: 'mob' | 'elite' | 'boss',
): Promise<string> {
  const manifest = await loadEncounterPool()
  const active = manifest.entries.filter((e) => !e.deprecated && e.kind === kind)
  if (active.length === 0) {
    throw new Error(
      `[encounter-pool] active pool for kind='${kind}' is empty — check manifest`,
    )
  }
  const rng = createRng(`${seed}::encounter::${nodeId}`)
  const idx = Math.floor(rng() * active.length)
  return active[idx].id
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/tower/pools/encounter-pool.test.ts --run`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tower/pools/encounter-pool.ts src/tower/pools/encounter-pool.test.ts
git commit -m "feat(tower): encounter pool resolver with Registry/Active Pool split"
```

---

## Phase C — Encounter Content

### Task 7: `mob-fallback.yaml` — defensive 兜底 encounter

**Files:**
- Create: `public/encounters/tower/mob-fallback.yaml`

**Context:** 从不进 Active Pool，但 Registry 永远含之；resolver 找不到目标 id 时兜底。内容极简（最小可战斗敌人）。

- [ ] **Step 1: Write the YAML**

```yaml
# public/encounters/tower/mob-fallback.yaml
#
# Defensive fallback encounter for tower mode.
# 当 resolveEncounter 找不到目标 id 时（Registry 契约被违反，通常是策划误删 YAML），
# 引擎 fallback 到这个 encounter，保证战斗可以进行而非白屏。
#
# 不进 Active Pool（manifest deprecated = 'never-in-pool'）；玩家正常运营永远不会打到这个。
# 若玩家 in-run 真的遇到（console.error 已 log），视作一次 bug report 触发点。

arena:
  name: 未知区域
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 20000
    attack: 150
    speed: 2
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_skills:
  boss_auto:
    name: 攻击
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0, action: enable_ai }
```

- [ ] **Step 2: Dev server smoke check**

Run: `pnpm dev` in background. Not consumed anywhere yet; confirm file parses by running encounter-loader test with this file path as input. Alternatively skip.

- [ ] **Step 3: Commit**

```bash
git add public/encounters/tower/mob-fallback.yaml
git commit -m "feat(tower): mob-fallback encounter (defensive resolver fallback)"
```

---

### Task 8: `mob-frost-sprite.yaml` — 冰主题小怪

**Files:**
- Create: `public/encounters/tower/mob-frost-sprite.yaml`

**Context:** 30s 读条圆形 AOE + 冰冻减速 debuff；近战风筝逼迫；90s 软超时叠愤怒 + loop。

- [ ] **Step 1: Write the YAML**

```yaml
# public/encounters/tower/mob-frost-sprite.yaml
#
# 冰主题小怪 — 30s 读条圆形 AOE（中央落地冰锥）+ 冰冻减速 debuff（踩中）。
# 90s 后启动软超时：叠一层"愤怒"（damage_increase 0.15，stackable），
# 机制循环回 5s 重演；每 90s 再叠一层。
# TTK 目标 ~90s（不含超时）。

arena:
  name: 冰封洞穴
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 45000
    attack: 180
    speed: 3
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_buffs:
  mob_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }
  frost_slow:
    name: 冰冻减速
    type: debuff
    stackable: false
    maxStacks: 1
    duration: 3000
    effects: []  # NOTE(phase 4): 速度下调暂无 effect type；placeholder，等速度词条/effect 扩展后再挂

local_skills:
  boss_auto:
    name: 冰拳
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  frost_ring:
    name: 冰锥落下
    type: spell
    castTime: 2500
    targetType: circle
    targetAnchor: boss
    aoeRadius: 6
    requiresTarget: false
    range: 0
    effects:
      - { type: damage, potency: 2.5 }
      - { type: apply_buff, buffId: frost_slow }
  mob_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: self
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: mob_enrage }

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0,     action: enable_ai }
      - { at: 15000, action: use, use: frost_ring }
      - { at: 45000, action: use, use: frost_ring }
      - { at: 75000, action: use, use: frost_ring }
      - { at: 90000, action: use, use: mob_enrage_stack }
      - { at: 90001, action: loop, loop: 15000 }
```

**Notes to implementer:**
- 若 `aoeRadius` 字段名在项目 schema 里是别的（如 `radius`），按实际 schema 调整。Grep `aoeRadius\|radius` in `src/config/schema.ts` to verify.
- `effects: []` on `frost_slow` 是 placeholder；phase 4 不扩 speed effect type，留注释。

- [ ] **Step 2: Implementer verification (schema field names)**

```bash
# Verify field name before commit
grep -n 'aoeRadius\|targetAnchor\|targetType' src/config/schema.ts | head -20
```

Adjust YAML fields if names differ.

- [ ] **Step 3: Commit**

```bash
git add public/encounters/tower/mob-frost-sprite.yaml
git commit -m "feat(tower): mob-frost-sprite encounter with soft-enrage loop"
```

---

### Task 9: `mob-fire-elemental.yaml` — 火主题小怪

**Files:**
- Create: `public/encounters/tower/mob-fire-elemental.yaml`

**Context:** 扇形 AOE（前方 180°）+ 十字 AOE（强制换位）交替；软超时同模式。

- [ ] **Step 1: Write the YAML**

Follow same structure as Task 8 (`mob-frost-sprite.yaml`) but with:

- arena name: `岩浆祭坛`
- HP: 45000, ATK 180 (same baseline)
- mechanics: two skills alternating:
  - `fire_cleave` — spell castTime 2000, targetType: cone (or fan — implementer verify correct enum), targetAnchor: boss, aoeAngle: 180, aoeRadius: 10, potency: 3.0
  - `fire_cross` — spell castTime 2500, targetType: rect / cross, targetAnchor: boss, length 20, width 4, potency: 2.8
- timeline:
  ```yaml
  - { at: 0,     action: enable_ai }
  - { at: 12000, action: use, use: fire_cleave }
  - { at: 30000, action: use, use: fire_cross }
  - { at: 55000, action: use, use: fire_cleave }
  - { at: 78000, action: use, use: fire_cross }
  - { at: 90000, action: use, use: mob_enrage_stack }
  - { at: 90001, action: loop, loop: 12000 }
  ```
- Include same `mob_enrage` + `mob_enrage_stack` as frost.

Full YAML content (write complete file, not partial):

```yaml
# public/encounters/tower/mob-fire-elemental.yaml
#
# 火主题小怪 — 扇形 AOE（面前 180°）+ 十字 AOE（强制换位）交替。
# 90s 软超时同 frost 模式。

arena:
  name: 岩浆祭坛
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 45000
    attack: 180
    speed: 3
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_buffs:
  mob_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }

local_skills:
  boss_auto:
    name: 火拳
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  fire_cleave:
    name: 烈焰扇击
    type: spell
    castTime: 2000
    targetType: cone
    targetAnchor: boss
    aoeRadius: 10
    aoeAngle: 180
    requiresTarget: false
    range: 0
    effects:
      - { type: damage, potency: 3.0 }
  fire_cross:
    name: 十字火焰
    type: spell
    castTime: 2500
    targetType: cross
    targetAnchor: boss
    aoeLength: 20
    aoeWidth: 4
    requiresTarget: false
    range: 0
    effects:
      - { type: damage, potency: 2.8 }
  mob_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: self
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: mob_enrage }

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0,     action: enable_ai }
      - { at: 12000, action: use, use: fire_cleave }
      - { at: 30000, action: use, use: fire_cross }
      - { at: 55000, action: use, use: fire_cleave }
      - { at: 78000, action: use, use: fire_cross }
      - { at: 90000, action: use, use: mob_enrage_stack }
      - { at: 90001, action: loop, loop: 12000 }
```

**Notes to implementer:**
- Verify `cone` / `cross` / `rect` targetType enum names against `src/core/types.ts` AoeShapeDef. Adjust field names if project uses different keys (e.g. `aoeRadius` vs `radius`, `aoeAngle` vs `angle`).

- [ ] **Step 2: Commit**

```bash
git add public/encounters/tower/mob-fire-elemental.yaml
git commit -m "feat(tower): mob-fire-elemental encounter with cleave/cross alternation"
```

---

### Task 10: `mob-chain-marker.yaml` — 点名主题小怪

**Files:**
- Create: `public/encounters/tower/mob-chain-marker.yaml`

**Context:** 15s 周期脚下圆圈落地（玩家当前脚下 = AOE 中心）；强制持续移动。

- [ ] **Step 1: Write YAML**

```yaml
# public/encounters/tower/mob-chain-marker.yaml
#
# 点名主题小怪 — 每 15s 读条"点名"，玩家当前脚下位置为 AOE 中心 2s 后落地。
# 强制玩家持续移动，不能站死。90s 软超时同其他小怪。

arena:
  name: 星象观测所
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 45000
    attack: 180
    speed: 2.5  # 略慢，补偿点名压力
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_buffs:
  mob_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }

local_skills:
  boss_auto:
    name: 星流拳
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  star_marker:
    name: 星之点名
    type: spell
    castTime: 2000
    targetType: circle
    targetAnchor: player  # 落在玩家脚下
    aoeRadius: 4
    requiresTarget: false
    range: 0
    effects:
      - { type: damage, potency: 2.5 }
  mob_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: self
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: mob_enrage }

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0,     action: enable_ai }
      - { at: 10000, action: use, use: star_marker }
      - { at: 25000, action: use, use: star_marker }
      - { at: 40000, action: use, use: star_marker }
      - { at: 55000, action: use, use: star_marker }
      - { at: 70000, action: use, use: star_marker }
      - { at: 85000, action: use, use: star_marker }
      - { at: 90000, action: use, use: mob_enrage_stack }
      - { at: 90001, action: loop, loop: 10000 }
```

**Note:** `targetAnchor: player` — verify project schema supports this. Grep `targetAnchor` in schema.ts. If only `self` / `boss` / `center` supported, extend schema OR use existing alternative (e.g. `targetType: circle_on_target` if available).

- [ ] **Step 2: Commit**

```bash
git add public/encounters/tower/mob-chain-marker.yaml
git commit -m "feat(tower): mob-chain-marker encounter with player-anchored markers"
```

---

### Task 11: `mob-arena-shrinker.yaml` — 场地收缩小怪

**Files:**
- Create: `public/encounters/tower/mob-arena-shrinker.yaml`

**Context:** 外圈死区逐步压缩；无独立 AOE，但场地压力足够；用 `add_death_zone` timeline action 实现。

- [ ] **Step 1: Write YAML**

```yaml
# public/encounters/tower/mob-arena-shrinker.yaml
#
# 场地收缩小怪 — 外圈死区分 3 段收缩（arena radius 15 → effective 10 → 7 → 5）。
# 每 30s 压缩一圈；90s 后超时，场地不再收缩（已到最小），叠愤怒 + 循环重演收缩。
# 核心考验：无安全输出点，玩家持续走位 + 拉近 boss。

arena:
  name: 坍缩空间
  shape: circle
  radius: 15
  boundary: lethal  # 场外坠落

entities:
  boss:
    type: mob
    group: boss
    hp: 40000  # 略低，机制本身压力大
    attack: 180
    speed: 3
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_buffs:
  mob_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }

local_skills:
  boss_auto:
    name: 重击
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  mob_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: self
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: mob_enrage }

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0, action: enable_ai }
      # 第一段收缩：r 15 → effective 10（外圈 5 单位死区）
      - at: 30000
        action: add_death_zone
        deathZone:
          id: shrink_ring_1
          center: { x: 0, y: 0 }
          facing: 0
          shape: { kind: ring, innerRadius: 10, outerRadius: 15 }
          behavior: lethal
      # 第二段：effective 7
      - at: 60000
        action: add_death_zone
        deathZone:
          id: shrink_ring_2
          center: { x: 0, y: 0 }
          facing: 0
          shape: { kind: ring, innerRadius: 7, outerRadius: 15 }
          behavior: lethal
      # 第三段：effective 5（最小）
      - at: 75000
        action: add_death_zone
        deathZone:
          id: shrink_ring_3
          center: { x: 0, y: 0 }
          facing: 0
          shape: { kind: ring, innerRadius: 5, outerRadius: 15 }
          behavior: lethal
      - at: 90000
        action: use
        use: mob_enrage_stack
      # 重置死区 + loop 回 0 重演收缩
      - { at: 90001, action: remove_death_zone, deathZoneId: shrink_ring_1 }
      - { at: 90002, action: remove_death_zone, deathZoneId: shrink_ring_2 }
      - { at: 90003, action: remove_death_zone, deathZoneId: shrink_ring_3 }
      - { at: 90004, action: loop, loop: 30000 }
```

**Note to implementer:**
- `shape: { kind: ring, innerRadius, outerRadius }` 字段名按 `src/core/types.ts` 的 `AoeShapeDef` discriminated union 核对。若项目用别的 tag（如 `type: annulus`），按实际调整。
- 若项目无 ring shape，降级为 "shape: circle 中心在外层，模拟外圈压缩" —— implementer 判断。

- [ ] **Step 2: Commit**

```bash
git add public/encounters/tower/mob-arena-shrinker.yaml
git commit -m "feat(tower): mob-arena-shrinker encounter with collapsing death zones"
```

---

### Task 12: Encounter pool manifest

**Files:**
- Create: `public/tower/pools/encounter-pool.json`

**Context:** Registry + Active Pool 合一 manifest；Phase 4 只含 5 个 mob entries（4 active + 1 fallback）。

- [ ] **Step 1: Write manifest**

```json
{
  "manifestVersion": 1,
  "entries": [
    {
      "id": "mob-frost-sprite",
      "yamlPath": "encounters/tower/mob-frost-sprite.yaml",
      "kind": "mob",
      "scoutSummary": "冰属性小精灵，会发动范围冰冻减速",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-fire-elemental",
      "yamlPath": "encounters/tower/mob-fire-elemental.yaml",
      "kind": "mob",
      "scoutSummary": "火属性元素，扇形与十字 AOE 交替",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-chain-marker",
      "yamlPath": "encounters/tower/mob-chain-marker.yaml",
      "kind": "mob",
      "scoutSummary": "星象点名，持续移动躲避落地 AOE",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-arena-shrinker",
      "yamlPath": "encounters/tower/mob-arena-shrinker.yaml",
      "kind": "mob",
      "scoutSummary": "坍缩空间，外圈死区分段压缩",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-fallback",
      "yamlPath": "encounters/tower/mob-fallback.yaml",
      "kind": "mob",
      "scoutSummary": "通用敌人",
      "rewards": { "crystals": 10 },
      "deprecated": "never-in-pool"
    }
  ]
}
```

- [ ] **Step 2: Integration smoke check via resolver test**

Already tested in Task 6 with mock. Now verify live manifest loads. Add integration test:

```ts
// src/tower/pools/encounter-pool.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadEncounterPool, _resetEncounterPoolCache, resolveEncounter } from './encounter-pool'

beforeEach(() => {
  _resetEncounterPoolCache()
})

describe('encounter-pool live manifest', () => {
  it('loads the actual manifest file', async () => {
    const manifest = await loadEncounterPool()
    expect(manifest.manifestVersion).toBe(1)
    expect(manifest.entries.length).toBeGreaterThanOrEqual(5)
  })

  it('contains mob-fallback entry', async () => {
    const fallback = await resolveEncounter('mob-fallback')
    expect(fallback.id).toBe('mob-fallback')
  })

  it('live manifest has 4 active mob entries', async () => {
    const manifest = await loadEncounterPool()
    const activeMobs = manifest.entries.filter((e) => !e.deprecated && e.kind === 'mob')
    expect(activeMobs.length).toBe(4)
  })
})
```

**Note:** Vitest in default config may not have `fetch` for file paths. Check project `vitest.config.ts` for test setup. If `fetch` unavailable for public assets, either:
- Add test helper that reads file directly via `fs.readFile` and mocks `fetch`, OR
- Mark integration test as `it.skip` + rely on Task 28 manual QA to catch breakage.

**Decision:** if fetch shim unavailable, delete this integration test file and rely on manual QA. The unit tests from Task 6 cover resolver logic; file existence is a build artifact verified by the dev server.

- [ ] **Step 3: Run tests (if integration test kept)**

Run: `pnpm test src/tower/pools/ --run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add public/tower/pools/encounter-pool.json
git add src/tower/pools/encounter-pool.integration.test.ts  # if kept
git commit -m "feat(tower): encounter pool manifest with 4 active mobs + fallback"
```

---

## Phase D — Store Actions

### Task 13: `startDescent` 填 encounterId

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/tower.test.ts`:

```ts
describe('tower store — startDescent crystallization', () => {
  beforeEach(() => {
    // Ensure encounter pool cache is clean + mock fetch to return manifest
    const { _resetEncounterPoolCache } = await import('@/tower/pools/encounter-pool')
    _resetEncounterPoolCache()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        manifestVersion: 1,
        entries: [
          { id: 'mob-a', yamlPath: 'encounters/tower/mob-a.yaml', kind: 'mob', scoutSummary: 'A', rewards: { crystals: 10 } },
          { id: 'mob-b', yamlPath: 'encounters/tower/mob-b.yaml', kind: 'mob', scoutSummary: 'B', rewards: { crystals: 10 } },
          { id: 'mob-fallback', yamlPath: 'encounters/tower/mob-fallback.yaml', kind: 'mob', scoutSummary: 'fb', rewards: { crystals: 10 }, deprecated: 'never-in-pool' },
        ],
      }),
    }) as any
  })

  it('fills encounterId on all mob nodes after startDescent', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'test-seed-1')
    await tower.startDescent()
    const mobNodes = Object.values(tower.run!.towerGraph.nodes).filter((n) => n.kind === 'mob')
    expect(mobNodes.length).toBeGreaterThan(0)
    for (const n of mobNodes) {
      expect(n.encounterId).toBeDefined()
      expect(['mob-a', 'mob-b']).toContain(n.encounterId)  // mob-fallback excluded
    }
  })

  it('does not fill encounterId on non-battle nodes', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'test-seed-2')
    await tower.startDescent()
    const nonBattle = Object.values(tower.run!.towerGraph.nodes).filter(
      (n) => n.kind === 'reward' || n.kind === 'campfire' || n.kind === 'event' || n.kind === 'start',
    )
    for (const n of nonBattle) {
      expect(n.encounterId).toBeUndefined()
    }
  })

  it('same seed produces same encounterId assignments', async () => {
    const tower1 = useTowerStore()
    tower1.startNewRun('swordsman', 'repro-seed')
    await tower1.startDescent()
    const ids1 = Object.values(tower1.run!.towerGraph.nodes)
      .filter((n) => n.kind === 'mob')
      .map((n) => `${n.id}:${n.encounterId}`)
      .sort()

    setActivePinia(createPinia())  // fresh store
    const tower2 = useTowerStore()
    tower2.startNewRun('swordsman', 'repro-seed')
    await tower2.startDescent()
    const ids2 = Object.values(tower2.run!.towerGraph.nodes)
      .filter((n) => n.kind === 'mob')
      .map((n) => `${n.id}:${n.encounterId}`)
      .sort()

    expect(ids1).toEqual(ids2)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL (startDescent doesn't fill encounterId)

- [ ] **Step 3: Implementation**

Edit `src/stores/tower.ts`:

1. Change `startDescent` signature to async:
```ts
async function startDescent(): Promise<void> {
```

2. Add import at top:
```ts
import { pickEncounterIdFromActivePool } from '@/tower/pools/encounter-pool'
```

3. Replace body with:
```ts
  async function startDescent(): Promise<void> {
    if (!run.value) {
      console.warn('[tower] startDescent called without active run')
      return
    }
    if (phase.value !== 'ready-to-descend') {
      console.warn(`[tower] startDescent called in wrong phase: ${phase.value}`)
      return
    }
    const graph = generateTowerGraph(run.value.seed)
    // Crystallize encounterId for each battle node (Phase 4: mob only; elite/boss
    // resolved in Phase 5 but pool-picker supports all three kinds already).
    const battleKinds: ReadonlyArray<'mob' | 'elite' | 'boss'> = ['mob', 'elite', 'boss']
    for (const node of Object.values(graph.nodes)) {
      if (battleKinds.includes(node.kind as any)) {
        try {
          node.encounterId = await pickEncounterIdFromActivePool(
            run.value.seed, node.id, node.kind as 'mob' | 'elite' | 'boss',
          )
        } catch (err) {
          // Empty pool for elite / boss in phase 4 is expected — leave encounterId undefined
          console.warn(`[tower] no active pool for kind='${node.kind}' (nodeId=${node.id}):`, err)
        }
      }
    }
    run.value.towerGraph = graph
    run.value.currentNodeId = graph.startNodeId
    phase.value = 'in-path'
  }
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): crystallize encounterId in startDescent (phase 4)"
```

---

### Task 14: Store action `scoutNode`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/stores/tower.test.ts`:

```ts
describe('tower store — scoutNode', () => {
  beforeEach(() => {
    // fetch mocked from previous suite; reusable.
  })

  it('scoutNode deducts 1 crystal and caches scoutInfo', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'scout-test')
    await tower.startDescent()
    tower.run!.crystals = 5
    // pick any mob node
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    const success = await tower.scoutNode(mobNode.id)
    expect(success).toBe(true)
    expect(tower.run!.crystals).toBe(4)
    expect(tower.run!.scoutedNodes[mobNode.id]).toBeDefined()
    expect(tower.run!.scoutedNodes[mobNode.id].enemySummary).toBeTruthy()
  })

  it('scoutNode returns false when crystals insufficient', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'scout-poor')
    await tower.startDescent()
    tower.run!.crystals = 0
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    const success = await tower.scoutNode(mobNode.id)
    expect(success).toBe(false)
    expect(tower.run!.scoutedNodes[mobNode.id]).toBeUndefined()
  })

  it('scoutNode is idempotent — re-scouting does not re-deduct', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'scout-idem')
    await tower.startDescent()
    tower.run!.crystals = 5
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    await tower.scoutNode(mobNode.id)
    await tower.scoutNode(mobNode.id)
    expect(tower.run!.crystals).toBe(4)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL (scoutNode does not exist)

- [ ] **Step 3: Implementation**

Edit `src/stores/tower.ts`:

1. Add import:
```ts
import { resolveEncounter } from '@/tower/pools/encounter-pool'
```

2. Add `scoutNode` action in the store setup function:
```ts
  async function scoutNode(nodeId: number): Promise<boolean> {
    if (!run.value) return false
    if (run.value.scoutedNodes[nodeId]) return true  // idempotent
    if (run.value.crystals < 1) return false
    const node = run.value.towerGraph.nodes[nodeId]
    if (!node) return false
    run.value.crystals -= 1
    // Build scoutInfo; for battle nodes with encounterId, resolve pool entry
    let enemySummary: string | null = null
    if (node.encounterId) {
      const entry = await resolveEncounter(node.encounterId)
      enemySummary = entry.scoutSummary
    }
    run.value.scoutedNodes[nodeId] = {
      scoutedAt: Date.now(),
      conditions: [],  // phase 5: battlefield conditions
      enemySummary,
    }
    void saveTowerRun(toRaw(run.value))
    return true
  }
```

3. Add `scoutNode` to the returned object at end of store.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): scoutNode action deducts crystal and caches scout info"
```

---

### Task 15: Store action `enterCombat`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('tower store — enterCombat', () => {
  it('enterCombat on a mob node switches phase to in-combat', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ec-1')
    await tower.startDescent()
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    // advanceTo the mob node (must be reachable from currentNodeId)
    const startNode = tower.run!.towerGraph.nodes[tower.run!.currentNodeId]
    const reachable = startNode.next.find((id) => tower.run!.towerGraph.nodes[id].kind === 'mob')
    if (reachable !== undefined) {
      tower.run!.currentNodeId = reachable  // directly set for test
      tower.enterCombat(reachable)
      expect(tower.phase).toBe('in-combat')
    }
  })

  it('enterCombat on non-battle node is a no-op', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ec-2')
    await tower.startDescent()
    const rewardNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'reward')
    if (rewardNode) {
      tower.run!.currentNodeId = rewardNode.id
      tower.enterCombat(rewardNode.id)
      expect(tower.phase).not.toBe('in-combat')
    }
  })

  it('enterCombat on elite/boss in phase 4 is no-op (phase 5 feature)', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ec-3')
    await tower.startDescent()
    const boss = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'boss')
    if (boss) {
      tower.run!.currentNodeId = boss.id
      tower.enterCombat(boss.id)
      expect(tower.phase).not.toBe('in-combat')
    }
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL (enterCombat does not exist)

- [ ] **Step 3: Implementation**

Add to `src/stores/tower.ts`:

```ts
  function enterCombat(nodeId: number): void {
    if (!run.value) return
    if (phase.value !== 'in-path') {
      console.warn(`[tower] enterCombat called in wrong phase: ${phase.value}`)
      return
    }
    const node = run.value.towerGraph.nodes[nodeId]
    if (!node) return
    // Phase 4: only mob kind enters combat; elite/boss are phase 5 stubs
    if (node.kind !== 'mob') {
      console.warn(`[tower] enterCombat on kind='${node.kind}' is not supported in phase 4`)
      return
    }
    if (!node.encounterId) {
      console.error(`[tower] enterCombat: mob node ${nodeId} has no encounterId (startDescent bug?)`)
      return
    }
    run.value.currentNodeId = nodeId
    phase.value = 'in-combat'
  }
```

Add to returned object.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): enterCombat action (phase 4: mob nodes only)"
```

---

### Task 16: Store actions `resolveVictory` + `deductDeterminationOnWipe`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('tower store — combat outcome actions', () => {
  it('resolveVictory marks completed + adds crystals + returns to in-path', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'rv-1')
    await tower.startDescent()
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    tower.run!.currentNodeId = mobNode.id
    tower.enterCombat(mobNode.id)
    const crystalsBefore = tower.run!.crystals
    tower.resolveVictory(mobNode.id, 10)
    expect(tower.run!.crystals).toBe(crystalsBefore + 10)
    expect(tower.run!.completedNodes).toContain(mobNode.id)
    expect(tower.phase).toBe('in-path')
  })

  it('deductDeterminationOnWipe subtracts from run.determination', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'dd-1')
    expect(tower.run!.determination).toBe(5)
    tower.deductDeterminationOnWipe(1)
    expect(tower.run!.determination).toBe(4)
  })

  it('deductDeterminationOnWipe does not go below 0', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'dd-2')
    tower.run!.determination = 1
    tower.deductDeterminationOnWipe(5)
    expect(tower.run!.determination).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL

- [ ] **Step 3: Implementation**

Add to `src/stores/tower.ts`:

```ts
  function resolveVictory(nodeId: number, crystalsReward: number): void {
    if (!run.value) return
    if (!run.value.completedNodes.includes(nodeId)) {
      run.value.completedNodes.push(nodeId)
    }
    run.value.crystals += crystalsReward
    phase.value = 'in-path'
    void saveTowerRun(toRaw(run.value))
  }

  function deductDeterminationOnWipe(amount: number): void {
    if (!run.value) return
    run.value.determination = Math.max(0, run.value.determination - amount)
    void saveTowerRun(toRaw(run.value))
  }
```

Add both to returned object.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): resolveVictory + deductDeterminationOnWipe actions"
```

---

### Task 17: Store actions `abandonCurrentCombat` + `checkEndedCondition`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe('tower store — abandon + checkEnded', () => {
  it('abandonCurrentCombat gives 50% crystals + marks completed + returns in-path', async () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ab-1')
    await tower.startDescent()
    const mobNode = Object.values(tower.run!.towerGraph.nodes).find((n) => n.kind === 'mob')!
    tower.run!.currentNodeId = mobNode.id
    tower.run!.crystals = 0
    tower.enterCombat(mobNode.id)
    tower.abandonCurrentCombat(mobNode.id, 10)  // full reward 10 → floor(10/2) = 5
    expect(tower.run!.crystals).toBe(5)
    expect(tower.run!.completedNodes).toContain(mobNode.id)
    expect(tower.phase).toBe('in-path')
  })

  it('checkEndedCondition flips phase to ended when determination <= 0', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ce-1')
    tower.run!.determination = 0
    tower.checkEndedCondition()
    expect(tower.phase).toBe('ended')
  })

  it('checkEndedCondition is no-op when determination > 0', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'ce-2')
    tower.run!.determination = 1
    tower.checkEndedCondition()
    expect(tower.phase).not.toBe('ended')
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: FAIL

- [ ] **Step 3: Implementation**

Add to `src/stores/tower.ts`:

```ts
  function abandonCurrentCombat(nodeId: number, crystalsRewardFull: number): void {
    if (!run.value) return
    if (!run.value.completedNodes.includes(nodeId)) {
      run.value.completedNodes.push(nodeId)
    }
    run.value.crystals += Math.floor(crystalsRewardFull / 2)
    phase.value = 'in-path'
    void saveTowerRun(toRaw(run.value))
  }

  function checkEndedCondition(): void {
    if (!run.value) return
    if (run.value.determination <= 0 && phase.value !== 'ended' && phase.value !== 'no-run') {
      phase.value = 'ended'
    }
  }
```

Add both to returned object.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/stores/tower.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): abandonCurrentCombat + checkEndedCondition actions"
```

---

### Task 18: Store regression — ensure non-test-mock paths do not break

**Files:**
- Modify: `src/stores/tower.ts` if needed

- [ ] **Step 1: Run full test suite regression**

Run: `pnpm test:run`
Expected: all pre-existing tests still pass; new tests pass

Run: `pnpm typecheck`
Expected: clean

If failures, inspect and fix minimal (e.g., missing imports, return signatures mismatching async).

- [ ] **Step 2: Commit any fixes**

```bash
git add src/stores/tower.ts
git commit -m "fix(tower): regression fixes after phase 4 store action batch"
```
(Skip commit if no changes needed.)

---

## Phase E — Battle Event Bridge

### Task 19: `combat:ended` 事件 payload 添加 `elapsed`

**Files:**
- Modify: `src/game/battle-runner.ts`

**Context:** 目前 `combat:ended` payload 是 `{ result: 'victory' | 'wipe' }`；tower 宿主需要 elapsed 做战斗统计。事件 bus 无类型 map，所以改 emit 点即可。

- [ ] **Step 1: Find emit sites and add elapsed**

Edit `src/game/battle-runner.ts`:

1. Find `s.bus.emit('combat:ended', { result: 'victory' })` (around line 261). Change to:
```ts
          s.bus.emit('combat:ended', { result: 'victory', elapsed: scheduler.combatElapsed })
```

2. Find `s.bus.emit('combat:ended', { result: 'wipe' })` (around line 269). Change to:
```ts
          s.bus.emit('combat:ended', { result: 'wipe', elapsed: scheduler.combatElapsed })
```

- [ ] **Step 2: Typecheck + regression**

Run: `pnpm typecheck`
Expected: clean

Run: `pnpm test:run`
Expected: no regression (event bus is untyped; consumers that previously only destructured `result` still work)

- [ ] **Step 3: Commit**

```bash
git add src/game/battle-runner.ts
git commit -m "feat(battle): include elapsed time in combat:ended payload"
```

---

## Phase F — UI Component Extraction

### Task 20: 抽出 `<EncounterRunner>` 组件

**Files:**
- Create: `src/components/tower/EncounterRunner.vue`

**Context:** 封装现有 `/encounter/[id].vue` 的 canvas + HUD + scene 生命周期；`combat:ended` 桥接为 Vue emit。

- [ ] **Step 1: Verify path aliases in components folder**

```bash
ls src/components/tower/
```

Confirm tower folder exists (should contain JobPicker.vue from phase 3). If unplugin-vue-components auto-registers with prefix, `<TowerEncounterRunner>` is the registered name.

- [ ] **Step 2: Create EncounterRunner.vue**

```vue
<!-- src/components/tower/EncounterRunner.vue -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useDebugStore } from '@/stores/debug'
import {
  startTimelineDemo,
  getActiveScene,
  disposeActiveScene,
  type BattleInitCallback,
} from '@/game/battle-runner'

interface Props {
  encounterUrl: string
  jobId: string
  onInit?: BattleInitCallback
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'combat-ended': [payload: { result: 'victory' | 'wipe'; elapsed: number }]
}>()

const { canvas } = useEngine()
const debug = useDebugStore()
const uiRootRef = useTemplateRef<HTMLDivElement>('ui-root')

let adapter: ReturnType<typeof useStateAdapter> | null = null
let combatEndedHandler: ((p: any) => void) | null = null

async function bootBattle() {
  adapter?.dispose()
  adapter = null
  disposeActiveScene()

  if (!canvas.value || !uiRootRef.value) return

  await startTimelineDemo(canvas.value, uiRootRef.value, props.encounterUrl, props.jobId, props.onInit)

  const scene = getActiveScene()
  if (!scene) return

  adapter = useStateAdapter(scene)

  // Bridge combat:ended bus event → Vue emit
  combatEndedHandler = (payload: { result: 'victory' | 'wipe'; elapsed: number }) => {
    emit('combat-ended', payload)
  }
  scene.bus.on('combat:ended', combatEndedHandler)

  let lastFpsUpdate = 0
  scene.onRenderTick = (delta) => {
    adapter!.writeFrame(delta)
    const now = performance.now()
    if (now - lastFpsUpdate > 250) {
      debug.fps = Math.round(scene.sceneManager.engine.getFps())
      lastFpsUpdate = now
    }
  }
}

onMounted(bootBattle)

onBeforeUnmount(() => {
  const scene = getActiveScene()
  if (scene && combatEndedHandler) {
    scene.bus.off('combat:ended', combatEndedHandler)
  }
  adapter?.dispose()
  adapter = null
  disposeActiveScene()
})

// Re-boot on encounterUrl / jobId change
watch(
  () => [props.encounterUrl, props.jobId],
  () => { void bootBattle() },
)
</script>

<template lang="pug">
#ui-root(ref="ui-root")
  HudHpBar(mode="boss")
  HudHpBar(mode="player")
  HudMpBar
  HudCastBar(mode="player")
  HudCastBar(mode="boss")
  HudSkillBar
  HudSkillPanelButton
  HudBuffBar
  HudDamageFloater
  HudCombatAnnounce
  HudDialogBox
  HudDebugInfo
  HudTimelineDisplay
  HudTooltip
  HudSkillPanel
  slot(name="overlay")
</template>

<style lang="scss" scoped>
#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
```

**Notes to implementer:**
- If `scene.bus` is not directly accessible (may need `scene.eventBus` or similar), grep existing code for the accessor and adjust. Phase 3 tests likely use `scene.bus` based on battle-runner.ts usage.
- The component intentionally does **NOT** render `HudPauseMenu` or `HudBattleEndOverlay` — these are host-responsibility (independent simulator hosts them; tower host replaces them with tower-specific overlays).
- The `<slot name="overlay">` allows host to inject custom overlays positioned inside `#ui-root`.

- [ ] **Step 3: Manual verification — dev server smoke**

Run: `pnpm dev`

Navigate to `/encounter/training-dummy` — should still work after Task 21 refactor. Task 20 alone cannot be verified until /encounter/[id].vue uses the component. **Defer full verification to Task 21.**

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean (new component has no external consumers yet)

- [ ] **Step 5: Commit**

```bash
git add src/components/tower/EncounterRunner.vue
git commit -m "feat(tower): extract EncounterRunner component from /encounter/[id]"
```

---

### Task 21: 重构 `/encounter/[id].vue` 使用 `<EncounterRunner>`

**Files:**
- Modify: `src/pages/encounter/[id].vue`

**Context:** 让独立模拟器成为 EncounterRunner 第一个消费者，验证组件工作。

- [ ] **Step 1: Inspect current /encounter/[id].vue**

Already read in Task 1 context. Structure: has canvas via useEngine + all HudX components in template + bootBattle function.

- [ ] **Step 2: Rewrite**

Replace entire `src/pages/encounter/[id].vue` content:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useJobStore } from '@/stores/job'
import { getJob, COMMON_BUFFS } from '@/jobs'
import type { BattleInitCallback } from '@/game/battle-runner'

const route = useRoute('/encounter/[id]')
const router = useRouter()
const jobStore = useJobStore()
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')
const gameKey = ref(0)

const isTutorial = computed(() => route.params.id === 'tutorial')
const isPractice = computed(() => {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).has('practice')
})

const encounterUrl = computed(() => {
  const base = import.meta.env.BASE_URL
  return `${base}encounters/${route.params.id}.yaml`
})

const jobId = computed(() => {
  if (isTutorial.value) return 'default'
  const j = getJob(jobStore.selectedJobId)
  if (j.id === 'default' && jobStore.selectedJobId !== 'default') {
    jobStore.select('default')
  }
  return jobStore.selectedJobId
})

const onInit = computed<BattleInitCallback | undefined>(() => {
  if (!isPractice.value) return undefined
  return (ctx) => {
    const buff = COMMON_BUFFS.practice_immunity
    ctx.registerBuffs({ practice_immunity: buff })
    ctx.buffSystem.applyBuff(ctx.player, buff, 'system')
  }
})

function handleRetry() {
  gameKey.value += 1
}

function handleResume() {
  // no-op; PauseMenu handles scene.resume() itself
}

function handleSkipTutorial() {
  tutorialSeen.value = '1'
  router.push('/')
}

// Mark tutorial as seen on mount
if (isTutorial.value) tutorialSeen.value = '1'
</script>

<template lang="pug">
TowerEncounterRunner(
  :encounter-url="encounterUrl"
  :job-id="jobId"
  :on-init="onInit"
  :key="gameKey"
)
  template(#overlay)
    HudPauseMenu(@resume="handleResume" @retry="handleRetry")
    HudBattleEndOverlay(@retry="handleRetry")
.skip-tutorial(v-if="isTutorial" @click="handleSkipTutorial") 跳过教程 &gt;
</template>

<style lang="scss" scoped>
.skip-tutorial {
  position: absolute;
  top: 16px;
  right: 16px;
  pointer-events: auto;
  cursor: pointer;
  padding: 6px 16px;
  font-size: 13px;
  color: #aaa;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
</style>
```

**Note:** Component name `<TowerEncounterRunner>` assumes unplugin-vue-components auto-registers with folder prefix `tower/`. Verify by checking phase 3 existing usage (`TowerJobPicker` in tower/index.vue). If different, adjust.

- [ ] **Step 3: Manual verification — dev server**

Run: `pnpm dev`

Test matrix in browser:
- `/encounter/training-dummy` — player spawns, skills work, no console errors
- `/encounter/tutorial` — tutorial runs, skip button visible + works
- `/encounter/ifrit` (normal) — full fight playable
- `/encounter/ifrit?practice` — practice mode buff applied (immunity + infinite MP)
- Retry button works (gameKey increments, scene restarts)

If anything breaks (black screen, null ref, HUD missing), likely causes:
- Component name mismatch (check `TowerEncounterRunner` vs whatever auto-registered name is)
- Scene.bus accessor name mismatch (grep `scene.bus` in EncounterRunner.vue vs how battle-runner exposes it)
- Missing HudPauseMenu/HudBattleEndOverlay in slot template

Fix by adjusting EncounterRunner.vue or [id].vue.

- [ ] **Step 4: Typecheck + regression**

Run: `pnpm typecheck`
Run: `pnpm test:run`
Expected: both clean

- [ ] **Step 5: Commit**

```bash
git add src/pages/encounter/[id].vue
git commit -m "refactor(encounter): /encounter/[id] consumes EncounterRunner component"
```

---

## Phase G — Tower UI Components

### Task 22: `RunStatusBar.vue` — 运行时常驻状态栏

**Files:**
- Create: `src/components/tower/RunStatusBar.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/tower/RunStatusBar.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import { getJob } from '@/jobs'

const tower = useTowerStore()

const jobName = computed(() => {
  if (!tower.run) return '—'
  const id = tower.run.advancedJobId ?? tower.run.baseJobId
  return getJob(id).name
})

const hearts = computed(() => {
  if (!tower.run) return { filled: 0, empty: 5 }
  const filled = Math.max(0, tower.run.determination)
  const empty = Math.max(0, tower.run.maxDetermination - filled)
  return { filled, empty }
})

const weaponLabel = computed(() => {
  if (!tower.run) return '—'
  // Phase 4 stub: no weapon system yet. Show category.
  if (tower.run.currentWeapon) return '装备中'  // phase 6 will show real weapon name
  return '基础'
})

const materiaSlots = computed(() => {
  if (!tower.run) return ['○', '○', '○', '○', '○']
  // Phase 4 stub: materia inventory not consumed yet; always show empty
  return ['○', '○', '○', '○', '○']  // phase 6: fill with activatedMateria
})
</script>

<template lang="pug">
.run-status-bar(v-if="tower.run")
  .seg.job
    span.label 职业
    span.value {{ jobName }}
  .seg.level
    span.label Lv
    span.value {{ tower.run.level }}/15
  .seg.determination
    span.label 决心
    span.hearts
      span.heart.filled(v-for="n in hearts.filled" :key="`f${n}`") ❤️
      span.heart.empty(v-for="n in hearts.empty" :key="`e${n}`") 🖤
  .seg.crystals
    span.label 水晶
    span.value 💎 {{ tower.run.crystals }}
  .seg.weapon
    span.label 装备
    span.value {{ weaponLabel }}
  .seg.materia
    span.label 魔晶石
    span.slots
      span.slot(v-for="(s, i) in materiaSlots" :key="i") {{ s }}
</template>

<style lang="scss" scoped>
.run-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px;
  margin-bottom: 12px;
  max-width: 900px;
  width: 95%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}

.seg {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .value, .hearts, .slots {
    color: #ddd;
    font-size: 13px;
  }
}

.hearts {
  display: inline-flex;
  gap: 2px;

  .heart {
    filter: grayscale(0);
    &.empty { filter: grayscale(1) opacity(0.4); }
  }
}

.slots {
  display: inline-flex;
  gap: 4px;

  .slot {
    color: #666;
  }
}
</style>
```

- [ ] **Step 2: Manual verification (deferred to Task 27 integration)**

Component consumed by Task 27. No isolation test.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/components/tower/RunStatusBar.vue
git commit -m "feat(tower): RunStatusBar component (职业/等级/❤️/💎/装备 stub/魔晶石 stub)"
```

---

### Task 23: `NodeConfirmPanel.vue` — 节点确认 / 侦察面板

**Files:**
- Create: `src/components/tower/NodeConfirmPanel.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/tower/NodeConfirmPanel.vue -->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useTowerStore } from '@/stores/tower'
import type { TowerNode } from '@/tower/types'

interface Props {
  node: TowerNode
}

const props = defineProps<Props>()

const emit = defineEmits<{
  scout: []
  enter: []
  cancel: []
}>()

const tower = useTowerStore()

const KIND_LABELS: Record<TowerNode['kind'], string> = {
  start: '起点',
  mob: '小怪战斗',
  elite: '精英战斗',
  boss: 'Boss 战斗',
  campfire: '篝火',
  reward: '奖励',
  event: '随机事件',
}

const kindLabel = computed(() => KIND_LABELS[props.node.kind] ?? props.node.kind)

const isBattleNode = computed(
  () => props.node.kind === 'mob' || props.node.kind === 'elite' || props.node.kind === 'boss',
)

const scoutInfo = computed(() => tower.run?.scoutedNodes?.[props.node.id])

const hasScoutInfo = computed(() => !!scoutInfo.value)

const canScout = computed(() => isBattleNode.value && !hasScoutInfo.value)

const canEnter = computed(() => {
  if (props.node.kind === 'mob') return true
  if (props.node.kind === 'elite' || props.node.kind === 'boss') return false  // phase 5
  return true  // non-battle (reward / campfire / event / start) — advanceTo stub
})

const enterLabel = computed(() => {
  if (props.node.kind === 'mob') return '进入战斗'
  if (props.node.kind === 'elite' || props.node.kind === 'boss') return '进入（phase 5 实装）'
  return '通过'
})

const crystalsInsufficient = computed(() => (tower.run?.crystals ?? 0) < 1)

function onScout() { emit('scout') }
function onEnter() { if (canEnter.value) emit('enter') }
function onCancel() { emit('cancel') }

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') onCancel()
}

onMounted(() => {
  window.addEventListener('keydown', handleKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
})
</script>

<template lang="pug">
.node-confirm-overlay(@click.self="onCancel")
  .panel(role="dialog")
    .panel-title {{ kindLabel }}
    .panel-body
      .scout-info(v-if="hasScoutInfo && scoutInfo?.enemySummary")
        .label 敌情
        .enemy-summary {{ scoutInfo.enemySummary }}
        .conditions(v-if="scoutInfo.conditions?.length")
          .label 场地机制
          ul
            li(v-for="(c, i) in scoutInfo.conditions" :key="i") {{ c.kind }}
      .unscouted(v-else-if="isBattleNode")
        | 情报未知，进入前可侦察。
      .non-battle-hint(v-else-if="node.kind === 'reward' || node.kind === 'campfire' || node.kind === 'event'")
        | 该节点将在后续 phase 实装；phase 4 通过即标记已完成。
    .panel-actions
      button.btn.scout(
        v-if="canScout"
        type="button"
        :disabled="crystalsInsufficient"
        @click="onScout"
      )
        span(v-if="!crystalsInsufficient") 侦察（1 💎）
        span(v-else) 水晶不足
      button.btn.enter(
        type="button"
        :disabled="!canEnter"
        @click="onEnter"
      ) {{ enterLabel }}
      button.btn.cancel(type="button" @click="onCancel") 取消
</template>

<style lang="scss" scoped>
.node-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
}

.panel {
  min-width: 320px;
  max-width: 440px;
  padding: 20px 24px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #ddd;
  font-size: 13px;
}

.panel-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #fff;
}

.panel-body {
  margin-bottom: 16px;
  min-height: 60px;

  .label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .enemy-summary {
    font-size: 13px;
    color: #ddd;
    margin-bottom: 8px;
  }

  .unscouted, .non-battle-hint {
    color: #aaa;
    font-style: italic;
  }
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn {
  padding: 8px 14px;
  font-size: 13px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &.enter { background: rgba(120, 180, 120, 0.18); }
  &.scout { background: rgba(120, 160, 200, 0.18); }
}
</style>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add src/components/tower/NodeConfirmPanel.vue
git commit -m "feat(tower): NodeConfirmPanel for node click — confirm/scout/enter/cancel"
```

---

### Task 24: `BattleResultOverlay.vue` — 爬塔战斗结束覆盖层

**Files:**
- Create: `src/components/tower/BattleResultOverlay.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/tower/BattleResultOverlay.vue -->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  result: 'victory' | 'wipe'
  encounterRewardCrystals: number
  currentDetermination: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  retry: []
  abandon: []
  continue: []
}>()

const canRetry = computed(() => props.currentDetermination > 0)
const abandonCrystals = computed(() => Math.floor(props.encounterRewardCrystals / 2))
</script>

<template lang="pug">
.result-overlay(role="dialog")
  .result-card
    .result-title.victory(v-if="result === 'victory'") 击败！
    .result-title.wipe(v-else) 你失败了
    .result-body
      template(v-if="result === 'victory'")
        .reward 获得 💎 {{ encounterRewardCrystals }}
      template(v-else)
        .status 当前决心：{{ currentDetermination }} ❤️
        .hint 已消耗 1 决心
    .result-actions
      template(v-if="result === 'victory'")
        button.btn.primary(type="button" @click="emit('continue')") 继续
      template(v-else)
        button.btn.primary(
          type="button"
          :disabled="!canRetry"
          @click="emit('retry')"
        )
          span(v-if="canRetry") 重试
          span(v-else) 决心已耗尽
        button.btn.secondary(type="button" @click="emit('abandon')")
          | 放弃（+{{ abandonCrystals }} 💎）
</template>

<style lang="scss" scoped>
.result-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 160;
  pointer-events: auto;
}

.result-card {
  min-width: 320px;
  padding: 28px 32px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  text-align: center;
}

.result-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 16px;

  &.victory { color: #ffd700; }
  &.wipe { color: #ff6666; }
}

.result-body {
  margin-bottom: 20px;
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;

  .reward { font-size: 16px; color: #ffdd88; }
  .status { font-size: 15px; }
  .hint { font-size: 12px; color: #888; margin-top: 4px; }
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  padding: 10px 16px;
  font-size: 13px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &.primary { background: rgba(255, 255, 255, 0.1); }
  &.secondary { background: rgba(255, 255, 255, 0.04); }
}
</style>
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`

```bash
git add src/components/tower/BattleResultOverlay.vue
git commit -m "feat(tower): BattleResultOverlay component — victory/wipe + retry/abandon"
```

---

### Task 25: `TowerEndedScreen.vue` — 最简尾屏

**Files:**
- Create: `src/components/tower/TowerEndedScreen.vue`

- [ ] **Step 1: Create component**

```vue
<!-- src/components/tower/TowerEndedScreen.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import { getJob } from '@/jobs'

const emit = defineEmits<{
  exit: []
}>()

const tower = useTowerStore()

const jobName = computed(() => {
  if (!tower.run) return '—'
  return getJob(tower.run.advancedJobId ?? tower.run.baseJobId).name
})

const elapsedText = computed(() => {
  if (!tower.run) return '—'
  const ms = Date.now() - tower.run.startedAt
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}分${secs}秒`
})

const completedCount = computed(() => tower.run?.completedNodes.length ?? 0)
</script>

<template lang="pug">
.ended-screen(v-if="tower.run")
  .ended-card
    .ended-title 你的攀登结束了
    .ended-subtitle 决心耗尽
    .ended-summary
      .summary-row
        span.label 职业
        span.value {{ jobName }}
      .summary-row
        span.label 等级
        span.value {{ tower.run.level }}
      .summary-row
        span.label 水晶
        span.value 💎 {{ tower.run.crystals }}
      .summary-row
        span.label 通过节点
        span.value {{ completedCount }}
      .summary-row
        span.label 耗时
        span.value {{ elapsedText }}
    .ended-note
      | 本局记录将在 phase 6 结算系统上线后转化为金币。
    .ended-actions
      button.btn.primary(type="button" @click="emit('exit')") 返回主菜单
</template>

<style lang="scss" scoped>
.ended-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 200px);
  width: 100%;
}

.ended-card {
  min-width: 360px;
  max-width: 440px;
  padding: 32px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  text-align: center;
}

.ended-title {
  font-size: 22px;
  font-weight: bold;
  color: #ccc;
  margin-bottom: 4px;
}

.ended-subtitle {
  font-size: 13px;
  color: #888;
  margin-bottom: 20px;
}

.ended-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  margin-bottom: 16px;
  font-family: monospace;
  font-size: 13px;

  .summary-row {
    display: flex;
    justify-content: space-between;
    .label { color: #888; }
    .value { color: #ddd; }
  }
}

.ended-note {
  font-size: 11px;
  color: #888;
  margin-bottom: 16px;
}

.btn {
  padding: 10px 20px;
  font-size: 13px;
  color: #ccc;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
}
</style>
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`

```bash
git add src/components/tower/TowerEndedScreen.vue
git commit -m "feat(tower): TowerEndedScreen minimal end-of-run summary"
```

---

## Phase H — Integration

### Task 26: `TowerMap.vue` 节点点击上浮给父组件

**Files:**
- Modify: `src/components/tower/TowerMap.vue`

**Context:** 当前 TowerMap 直接调 `tower.advanceTo(nodeId)`；改成 emit `node-click` 让父处理。

- [ ] **Step 1: Modify TowerMap.vue**

Edit `src/components/tower/TowerMap.vue`:

1. Replace the line:
```ts
function onNodeClick({ node }: NodeMouseEvent) {
  tower.advanceTo(Number(node.id))
}
```

with:

```ts
const emit = defineEmits<{
  'node-click': [nodeId: number]
}>()

function onNodeClick({ node }: NodeMouseEvent) {
  emit('node-click', Number(node.id))
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean (parent will be updated in Task 27)

- [ ] **Step 3: Commit**

```bash
git add src/components/tower/TowerMap.vue
git commit -m "refactor(tower): TowerMap emits node-click instead of calling advanceTo directly"
```

---

### Task 27: `/tower/index.vue` 接线所有 phase 4 组件

**Files:**
- Modify: `src/pages/tower/index.vue`

**Context:** 最终集成 —— status bar / confirm panel / encounter runner / result overlay / ended screen 全部接起来。这是 phase 4 最大的一次改动，请严格按步骤。

- [ ] **Step 1: Read existing file structure**

Already in context from earlier read. Current structure has branches for:
- `no-run` no save
- `no-run` with save
- `selecting-job`
- `ready-to-descend`
- `in-path`
- fallback

- [ ] **Step 2: Rewrite `/tower/index.vue`**

Replace entire file content:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimeAgo } from '@vueuse/core'
import { useTowerStore } from '@/stores/tower'
import type { BaseJobId } from '@/tower/types'
import { getJob, type PlayerJob } from '@/jobs'
import { resolveEncounter } from '@/tower/pools/encounter-pool'

const router = useRouter()
const tower = useTowerStore()

// ───────── save-summary state ─────────
const showAbandonDialog = ref(false)

const displayJobName = computed(() => {
  if (!tower.run) return ''
  const id = tower.run.advancedJobId ?? tower.run.baseJobId
  return getJob(id).name
})

const startedAtText = computed(() => {
  if (!tower.run) return ''
  return useTimeAgo(tower.run.startedAt).value
})

// ───────── node-click confirm panel state ─────────
const selectedNodeId = ref<number | null>(null)
const selectedNode = computed(() => {
  if (selectedNodeId.value === null || !tower.run) return null
  return tower.run.towerGraph.nodes[selectedNodeId.value] ?? null
})

function onMapNodeClick(nodeId: number) {
  if (!tower.run) return
  const current = tower.run.towerGraph.nodes[tower.run.currentNodeId]
  if (!current?.next.includes(nodeId)) return
  selectedNodeId.value = nodeId
}

async function onScout() {
  if (selectedNodeId.value === null) return
  await tower.scoutNode(selectedNodeId.value)
}

async function onEnter() {
  if (selectedNodeId.value === null || !tower.run) return
  const node = tower.run.towerGraph.nodes[selectedNodeId.value]
  if (!node) return
  // Non-battle nodes: stub (just advance + close panel)
  if (node.kind === 'reward' || node.kind === 'campfire' || node.kind === 'event' || node.kind === 'start') {
    tower.advanceTo(selectedNodeId.value)
    selectedNodeId.value = null
    return
  }
  // Mob: enter combat
  if (node.kind === 'mob') {
    tower.advanceTo(selectedNodeId.value)  // move token onto the node first
    tower.enterCombat(selectedNodeId.value)
    selectedNodeId.value = null
    return
  }
  // Elite / Boss: disabled in phase 4 (panel prevents click) — no-op
}

function onCancelConfirm() {
  selectedNodeId.value = null
}

// ───────── combat flow state ─────────
const currentEncounterUrl = ref('')
const currentRewardCrystals = ref(0)
const combatInstanceKey = ref(0)
const showResultOverlay = ref(false)
const lastCombatResult = ref<'victory' | 'wipe'>('victory')

const runJobId = computed(() => {
  if (!tower.run) return 'default'
  return tower.run.advancedJobId ?? tower.run.baseJobId
})

// When phase enters in-combat, resolve encounter URL + reward
async function prepareCombat() {
  if (!tower.run || tower.phase !== 'in-combat') return
  const node = tower.run.towerGraph.nodes[tower.run.currentNodeId]
  if (!node?.encounterId) return
  const entry = await resolveEncounter(node.encounterId)
  currentEncounterUrl.value = `${import.meta.env.BASE_URL}${entry.yamlPath}`
  currentRewardCrystals.value = entry.rewards.crystals
  combatInstanceKey.value += 1
  showResultOverlay.value = false
}

// Watch phase transitions to prepare combat
import { watch } from 'vue'
watch(
  () => tower.phase,
  (newPhase) => {
    if (newPhase === 'in-combat') void prepareCombat()
    if (newPhase !== 'in-combat') {
      currentEncounterUrl.value = ''
      showResultOverlay.value = false
    }
  },
)

function onCombatEnded(payload: { result: 'victory' | 'wipe'; elapsed: number }) {
  lastCombatResult.value = payload.result
  if (payload.result === 'wipe') {
    tower.deductDeterminationOnWipe(1)
  }
  showResultOverlay.value = true
}

function onRetryCombat() {
  if (!tower.run || tower.run.determination <= 0) return
  showResultOverlay.value = false
  combatInstanceKey.value += 1  // re-mount EncounterRunner → restart battle
}

function onAbandonCombat() {
  if (!tower.run || selectedNodeId.value === null && tower.run.currentNodeId === null) return
  const nodeId = tower.run!.currentNodeId
  tower.abandonCurrentCombat(nodeId, currentRewardCrystals.value)
  showResultOverlay.value = false
  tower.checkEndedCondition()  // may flip to 'ended'
}

function onContinueAfterVictory() {
  if (!tower.run) return
  const nodeId = tower.run.currentNodeId
  tower.resolveVictory(nodeId, currentRewardCrystals.value)
  showResultOverlay.value = false
}

// ───────── lifecycle ─────────
onMounted(async () => {
  await tower.hydrate()
})

function goHome() {
  router.push('/')
}

function onJobPick(job: PlayerJob): void {
  tower.startNewRun(job.id as BaseJobId)
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

async function onStartDescent() {
  await tower.startDescent()
}

function onAbandonFromSummary(): void {
  tower.resetRun()
  showAbandonDialog.value = false
}

function onExitEnded() {
  tower.resetRun()
  router.push('/')
}

// Show RunStatusBar only when run is active
const showStatusBar = computed(() => {
  if (!tower.run) return false
  return ['ready-to-descend', 'in-path', 'in-combat', 'ended'].includes(tower.phase)
})
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")

  .schema-reset-notice(v-if="tower.schemaResetNotice")
    span.notice-text 本迷宫版本已更新，之前的下潜已关闭
    button.notice-dismiss(type="button" @click="tower.dismissSchemaNotice()") 知道了

  TowerRunStatusBar(v-if="showStatusBar")

  //- no-run no save
  .tower-panel(v-if="tower.phase === 'no-run' && !tower.savedRunExists")
    .tower-title 爬塔模式
    .tower-subtitle 选择一个入口开始你的攀登
    .tower-actions
      button.tower-btn.primary(type="button" @click="tower.enterJobPicker()") 新游戏
      button.tower-btn.secondary(type="button" disabled) 教程
      button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单

  //- no-run with save
  .tower-panel(v-else-if="tower.phase === 'no-run' && tower.savedRunExists && tower.run")
    .tower-title 爬塔模式
    .tower-subtitle 进行中的下潜
    .run-summary
      .summary-row
        span.label 职业
        span.value {{ displayJobName }}
      .summary-row
        span.label 等级
        span.value {{ tower.run.level }}
      .summary-row
        span.label 水晶
        span.value {{ tower.run.crystals }}
      .summary-row
        span.label 开始于
        span.value {{ startedAtText }}
    .tower-actions
      button.tower-btn.primary(type="button" @click="onContinue") 继续
      button.tower-btn.secondary(type="button" @click="showAbandonDialog = true") 放弃并结算
      button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单
    CommonConfirmDialog(
      v-if="showAbandonDialog"
      title="确定放弃这次攀登吗？"
      message="所有进度将丢失。"
      confirm-text="放弃"
      cancel-text="取消"
      variant="danger"
      @confirm="onAbandonFromSummary"
      @cancel="showAbandonDialog = false"
    )

  //- selecting-job
  TowerJobPicker(
    v-else-if="tower.phase === 'selecting-job'"
    @pick="onJobPick"
    @back="tower.setPhase('no-run')"
  )

  //- ready-to-descend
  .tower-panel(v-else-if="tower.phase === 'ready-to-descend' && tower.run")
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

  //- in-path
  .tower-inpath(v-else-if="tower.phase === 'in-path' && tower.run")
    .tower-subtitle 点击可达节点前进
    TowerMap(@node-click="onMapNodeClick")
    .tower-actions-inline
      button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 放弃本局
    TowerNodeConfirmPanel(
      v-if="selectedNode"
      :node="selectedNode"
      @scout="onScout"
      @enter="onEnter"
      @cancel="onCancelConfirm"
    )

  //- in-combat
  .tower-combat(v-else-if="tower.phase === 'in-combat' && tower.run && currentEncounterUrl")
    TowerEncounterRunner(
      :encounter-url="currentEncounterUrl"
      :job-id="runJobId"
      :key="combatInstanceKey"
      @combat-ended="onCombatEnded"
    )
    TowerBattleResultOverlay(
      v-if="showResultOverlay"
      :result="lastCombatResult"
      :encounter-reward-crystals="currentRewardCrystals"
      :current-determination="tower.run.determination"
      @retry="onRetryCombat"
      @abandon="onAbandonCombat"
      @continue="onContinueAfterVictory"
    )

  //- ended
  TowerEndedScreen(
    v-else-if="tower.phase === 'ended'"
    @exit="onExitEnded"
  )

  //- fallback
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

.tower-combat {
  position: relative;
  width: 100%;
  height: 100%;
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

.run-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  margin-bottom: 12px;

  .summary-row {
    display: flex;
    justify-content: space-between;

    .label { color: #888; }
    .value { color: #ddd; }
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

**Notes to implementer:**
- Component names assume unplugin-vue-components `folder/File` → `FolderFile` naming: `<TowerRunStatusBar>` / `<TowerNodeConfirmPanel>` / `<TowerEncounterRunner>` / `<TowerBattleResultOverlay>` / `<TowerEndedScreen>`. Verify by checking phase 3 `<TowerJobPicker>` working. If naming differs, adjust all consumers.
- `onAbandonCombat` pulls `nodeId` from `tower.run.currentNodeId`; by this time `advanceTo` has already moved token onto the node. Verify this is correct by inspecting actual runtime state during manual QA.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/pages/tower/index.vue
git commit -m "feat(tower): integrate phase 4 combat node flow into /tower route"
```

---

### Task 28: Manual QA checklist + final regression

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Execute QA matrix**

Open browser, `/tower`, and run through:

**Flow A — Full run (happy path)**:
- [ ] `no-run` 无存档 → 点"新游戏" → `selecting-job` 卡片显示 3 职业
- [ ] 选一个卡片（如剑术师）→ `ready-to-descend` 显示 base job + seed
- [ ] 点"开始下潜" → `in-path` Vue Flow 地图显示
- [ ] **顶部出现 RunStatusBar**（职业 / 等级 / ❤️×5 / 💎 0 / 基础 / ○○○○○）
- [ ] 地图上第 1 步节点可点击 → NodeConfirmPanel 弹出
- [ ] Panel 显示"小怪战斗"/ "情报未知" / [侦察 (1💎)] disabled（水晶=0）/ [进入战斗] / [取消]
- [ ] 点 [取消] → panel 关闭
- [ ] 再次点击节点 → panel 重开
- [ ] 点 [进入战斗] → `in-combat` EncounterRunner 挂载 → 战斗开始
- [ ] 击败小怪 → BattleResultOverlay 胜利态 → "击败！+10 💎" → [继续]
- [ ] 点 [继续] → 回 `in-path`，节点标灰（completed），status bar 显示 💎 10

**Flow B — 侦察**:
- [ ] 回到 in-path，第 2 步节点 scout：由于水晶=10，[侦察] 可点
- [ ] 点 [侦察] → panel 状态刷新为 scouted 态（显示敌情文本）、[侦察] 按钮消失、水晶变 9
- [ ] 关闭 panel 再重新点同节点 → 直接显示 scouted 态（免费）

**Flow C — 失败 + 重试**:
- [ ] 进一场战斗 → 送死 → Overlay 失败态
- [ ] status bar ❤️ 立即扣减（5→4）
- [ ] 点 [重试] → 战斗重开，敌人满血
- [ ] 再胜利 / 或继续送死

**Flow D — 决心耗尽 → ended**:
- [ ] 连续送死到 ❤️=0 → [重试] 按钮 disabled + 文案"决心已耗尽" → 点 [放弃]
- [ ] phase 切 `ended` → TowerEndedScreen 显示（职业/等级/水晶/节点数/耗时/返回主菜单）
- [ ] 点 [返回主菜单] → `resetRun`，回到 `/tower` no-run 无存档态

**Flow E — 非战斗节点 stub**:
- [ ] 进一个 reward 节点 → panel 显示简化版（无 [侦察]）+ [进入] 按钮可点
- [ ] 点 [进入] → 直接标 completed + 回 in-path
- [ ] 进精英节点 → panel 显示 + [进入] disabled + 文案 "进入（phase 5 实装）"

**Flow F — 断点续玩**:
- [ ] 进战斗中途 → 刷新浏览器 → /tower 打开 → no-run 存档摘要显示
- [ ] 点 [继续] → 恢复到 in-path，当前节点可再点进战斗
- [ ] 决心 / 水晶 保持战斗前状态

**Flow G — 独立模拟器回归**:
- [ ] `/encounter/training-dummy` 正常 load
- [ ] `/encounter/ifrit` 正常战斗 + 胜利 / 失败 overlay + 重试
- [ ] `/encounter/tutorial` 教程 + 跳过按钮
- [ ] `/encounter/ifrit?practice` 练习模式 buff 生效

- [ ] **Step 3: Run full test suite**

```bash
pnpm test:run
pnpm typecheck
```

Expected: all green.

- [ ] **Step 4: If any issues — fix inline**

Typical fixes:
- Component name mismatch (unplugin-vue-components naming) — rename in consumers
- `scene.bus` vs `scene.eventBus` — adjust EncounterRunner
- 小怪 YAML 字段名对不上 schema → 调整 YAML field names
- BattleResultOverlay 不出现 — 检查 EncounterRunner 的 `combat-ended` emit 是否桥接成功

Commit each fix separately:
```bash
git add <files>
git commit -m "fix(tower): <specific issue>"
```

- [ ] **Step 5: Final commit (phase 4 ready)**

If all checks pass, tag / note no final commit needed (phase 4 series already committed task-by-task).

---

## Self-Review Notes

**Spec coverage verification** (each spec IN item → task):
- ✅ 战斗节点 NodeConfirmPanel → Task 23
- ✅ 侦察机制 → Task 14 (scoutNode) + Task 23 (panel)
- ✅ 战斗入口嵌入 EncounterRunner → Task 20-21
- ✅ 胜利/失败/重试/放弃 → Task 16-17 + 24
- ✅ 决心扣减时机（立即）→ Task 27 onCombatEnded
- ✅ Boss/Elite stub → Task 23 canEnter disabled
- ✅ 非战斗节点 advanceTo stub → Task 27 onEnter
- ✅ Pool Registry / Active Pool → Task 6
- ✅ TowerNode.encounterId + blueprintVersion → Task 2-3
- ✅ 开局固化 → Task 13
- ✅ encounter-loader local_buffs → Task 4-5
- ✅ combat:ended elapsed → Task 19
- ✅ Status bar → Task 22
- ✅ TowerMap 事件上浮 → Task 26
- ✅ EndedScreen → Task 25
- ✅ 4 个小怪 YAML + fallback → Task 7-11
- ✅ Manifest → Task 12

**Type consistency check**:
- `EncounterPoolEntry.kind: 'mob' | 'elite' | 'boss'` — used consistently in Task 6 / 13 / 23 ✓
- `combat:ended` payload `{ result: 'victory' | 'wipe'; elapsed: number }` — Task 19 emits, Task 20 bridges, Task 27 consumes ✓
- Store actions async vs sync: `startDescent` / `scoutNode` 是 async；`enterCombat` / `resolveVictory` / `deductDeterminationOnWipe` / `abandonCurrentCombat` / `checkEndedCondition` 是 sync ✓
- `TowerNode.encounterId?: string` optional consistently used (Task 2 type + Task 13 fill + Task 15 check) ✓

**Placeholder scan**: no "TBD" / "TODO" / "implement later" in this plan's step content. Each step contains actual code or exact commands.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| 小怪 YAML 的 AOE shape 字段名与 `src/core/types.ts` AoeShapeDef 不匹配 | Task 8/9/10/11 的 Notes 里写明 implementer 先 grep schema 核对 |
| `scene.bus` 访问路径与 EncounterRunner 假设不一致 | Task 20 Notes 里提示先 grep `scene.bus` 用法 |
| unplugin-vue-components 自注册名 mismatch | Task 27 Notes 指示参考 phase 3 `<TowerJobPicker>` 命名 |
| SCHEMA_VERSION 1→2 破坏 phase 3 测试存档 | 预期代价，Task 2 注释明示 |
| Vitest 环境下 `fetch` 无法读 public 资源 | Task 12 integration test 可跳过，依赖 Task 28 手测覆盖 |
| `local_buffs` BuffDef 解析时 effects 类型推断失败 | Task 4 实现里用 `def.effects ?? []`，consumer (Task 5) 依赖 combatResolver 已有的 BuffDef 消费路径 |
