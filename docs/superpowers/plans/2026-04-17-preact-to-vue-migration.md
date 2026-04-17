# Preact → Vue 全量迁移 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 UI 层从 Preact + @preact/signals + preact-iso 全量迁移到 Vue 3 + Pinia + vue-router 5，并顺带修正 game/UI 层级耦合（GameScene 拥有战斗运行时状态，UI 无状态渲染）。

**Architecture:** 新建 `src/pages/ components/ stores/ composables/ styles/`，删除 `src/ui/`。`useBattleStore` 由 `use-state-adapter` 每帧 `$patch` 自 `GameScene.*` 镜像。UI 通过 `scene.xxx()` 方法触发游戏侧状态变更，不反向写入。

**Tech Stack:** Vue 3 + vue-router 5 (file-based routing via `vue-router/vite`) + Pinia + @vueuse/core + UnoCSS (Wind4 + Attributify) + pug + scss + unplugin-vue-components

**Reference spec:** `docs/superpowers/specs/2026-04-17-preact-to-vue-migration-design.md`

---

## 分支准备

在开始前创建 `refactor/preact-to-vue` 分支。所有任务都在该分支上提交。提交信息使用英文 Conventional Commits，不加 co-author 尾行（match 现有项目风格）。

```bash
git checkout -b refactor/preact-to-vue
```

## 任务依赖与执行顺序

**关键依赖关系：**
- Task 26（encounter/[id].vue）引用 Task 30-39 创建的 `Hud*` 组件 → 执行 Task 26 时这些组件尚不存在；若希望 Task 26 完成后即可 dev 预览战斗页，可将 Task 26 推迟到 Task 39 之后执行。否则按编号顺序执行，中间态 dev 战斗页会报组件缺失，但 typecheck（配合 unplugin-vue-components 生成的 d.ts）不会阻塞后续任务。
- Task 22-25（非战斗页）引用 Task 27-28 的 `Menu*` 组件 → 建议先 27-28 再 22-25，或容忍中间 dev 警告。

**推荐执行顺序**（对执行者稳妥）：
1-21 按编号顺序  
27-28（Menu 组件）  
22-25（非战斗页）  
29-39（HUD 组件）  
26（encounter 页）  
40-44（切换与清理）

如果用 subagent-driven-development，每个任务间的 review 可以调整顺序。

---

## 阶段 A：依赖与构建配置

### Task 1: 更新 package.json 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 编辑 package.json 添加 Vue 侧依赖、保留 Preact 以便阶段性迁移**

（先不删除 Preact，方便在中间阶段保留 `ui/state.ts` 作为过渡读源；阶段 K 再统一删除。）

```json
{
  "dependencies": {
    "@babylonjs/core": "^9.2.0",
    "@preact/signals": "^2.9.0",
    "@vueuse/core": "^11.0.0",
    "minimist": "^1.2.8",
    "pinia": "^2.2.0",
    "preact": "^10.29.1",
    "preact-iso": "^2.11.1",
    "vue": "^3.5.0",
    "vue-router": "^5.0.0",
    "yaml": "^2.8.3"
  },
  "devDependencies": {
    "@preact/preset-vite": "^2.10.5",
    "@types/minimist": "^1.2.5",
    "@types/node": "^24.12.2",
    "@unocss/preset-attributify": "^66.6.8",
    "@unocss/preset-wind4": "^66.6.8",
    "@vitejs/plugin-vue": "^5.1.0",
    "@vitejs/plugin-vue-jsx": "^4.0.0",
    "pug": "^3.0.0",
    "sass": "^1.80.0",
    "typescript": "^6.0.2",
    "unocss": "^66.6.8",
    "unplugin-vue-components": "^0.27.0",
    "vite": "^8.0.8",
    "vitest": "^4.1.4"
  }
}
```

（以上版本号为参考；执行 `pnpm install` 时按 latest stable 解析。）

- [ ] **Step 2: 安装依赖**

```bash
pnpm install
```

Expected: 成功安装，无错误。可能有 peer-dep 警告（Vue 侧新包可能对 Node 版本提要求），按需处理。

- [ ] **Step 3: 验证核心层测试依然通过**

```bash
pnpm test:run
```

Expected: 28 个测试全部通过。

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add vue ecosystem deps alongside preact for migration"
```

---

### Task 2: 更新 Vite 配置

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 用新配置替换 `vite.config.ts` 全文**

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import preact from '@preact/preset-vite'
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
    VueRouter({ routesFolder: 'src/pages' }),
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
    preact(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
```

注意：`VueRouter({...})` **必须** 在 `Vue()` 之前。`preact()` 保留至阶段 K 删除。

- [ ] **Step 2: Commit**

```bash
git add vite.config.ts
git commit -m "chore: configure vite for vue plugin chain"
```

---

### Task 3: UnoCSS 启用 Attributify

**Files:**
- Modify: `uno.config.ts`

- [ ] **Step 1: 追加 Attributify preset**

```ts
import { defineConfig } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'
import presetAttributify from '@unocss/preset-attributify'

export default defineConfig({
  presets: [presetWind4(), presetAttributify()],
})
```

- [ ] **Step 2: Commit**

```bash
git add uno.config.ts
git commit -m "chore: enable unocss attributify preset"
```

---

### Task 4: tsconfig 包含自动生成的类型声明

**Files:**
- Modify: `tsconfig.app.json`

- [ ] **Step 1: 将生成的类型声明纳入 include，并确保 moduleResolution: "Bundler"**

（先查看当前 tsconfig.json 看 moduleResolution 是否已是 Bundler。）

```bash
cat tsconfig.json | grep moduleResolution || echo "need to add"
```

编辑 `tsconfig.app.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsxImportSource": "vue",
    "types": ["vite/client"]
  },
  "include": [
    "src",
    "src/typed-router.d.ts",
    "src/typed-components.d.ts"
  ],
  "exclude": ["src/**/*.test.ts"]
}
```

如果 `tsconfig.json` 里 `moduleResolution` 不是 `"Bundler"`，在 `tsconfig.json` 里改成 `"Bundler"`。

注意：`jsxImportSource: "vue"` 这里暂时与现有 Preact JSX 冲突——可暂留 `"jsxImportSource": "preact"`，等阶段 K 删 Preact 后再改为 `"vue"`。为避免 Preact 侧类型报错，此任务**先暂不设置 jsxImportSource**：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["vite/client"]
  },
  "include": [
    "src",
    "src/typed-router.d.ts",
    "src/typed-components.d.ts"
  ],
  "exclude": ["src/**/*.test.ts"]
}
```

（阶段 K 完成 Preact 删除后，单独任务中再切换 jsxImportSource 并删除 jsxImportSource: preact。）

- [ ] **Step 2: 验证 typecheck（会因类型声明文件尚未生成而报缺失，允许）**

```bash
pnpm typecheck 2>&1 | head -20
```

Expected: 可能报 `typed-router.d.ts` / `typed-components.d.ts` 找不到。这是预期的——这两个文件会在后续首次 `pnpm dev` 启动时生成。

- [ ] **Step 3: Commit**

```bash
git add tsconfig.app.json tsconfig.json
git commit -m "chore: include auto-generated d.ts in tsconfig"
```

---

## 阶段 B：类型搬迁

### Task 5: `SkillBarEntry` 类型迁至 `@/jobs/shared.ts`

**Files:**
- Modify: `src/jobs/shared.ts`
- Modify: `src/ui/state.ts`

- [ ] **Step 1: 在 `src/jobs/shared.ts` 顶部添加类型定义，删除从 `@/ui/state` 的 import**

编辑 `src/jobs/shared.ts`：

```ts
import type { SkillDef } from '@/core/types'
// 删除：import type { SkillBarEntry } from '@/ui/state'

export interface SkillBarEntry {
  key: string
  skill: SkillDef
}

// ...其余现有内容不动
```

- [ ] **Step 2: 更新 `src/ui/state.ts` 从 `@/jobs/shared` re-export**

在 `src/ui/state.ts` 顶部：

```ts
// 把原先的 interface SkillBarEntry { ... } 改为 re-export
export type { SkillBarEntry } from '@/jobs/shared'
```

- [ ] **Step 3: 验证 typecheck 通过**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -20
```

Expected: 与 `typed-*` 无关的错误应为 0。

- [ ] **Step 4: 验证测试仍通过**

```bash
pnpm test:run
```

Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/jobs/shared.ts src/ui/state.ts
git commit -m "refactor: move SkillBarEntry type to jobs/shared"
```

---

### Task 6: 新建 `src/timeline/types.ts` 并迁入 `TimelineEntry`

**Files:**
- Create: `src/timeline/types.ts`
- Modify: `src/ui/state.ts`

- [ ] **Step 1: 创建 `src/timeline/types.ts`**

```ts
export interface TimelineEntry {
  key: string
  skillName: string
  state: 'upcoming' | 'casting' | 'flash'
  /** Time until activation in ms (positive = upcoming, negative = past) */
  timeUntil: number
  /** Skill cast time in ms (0 for instant) */
  castTime: number
  /** Flash elapsed in ms */
  flashElapsed: number
}
```

- [ ] **Step 2: `src/ui/state.ts` 改为 re-export**

将 `src/ui/state.ts` 中 `TimelineEntry` 接口定义删除，替换为：

```ts
export type { TimelineEntry } from '@/timeline/types'
```

- [ ] **Step 3: 验证**

```bash
pnpm typecheck && pnpm test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/timeline/types.ts src/ui/state.ts
git commit -m "refactor: move TimelineEntry type to timeline/types"
```

---

### Task 7: 新建 `src/game/types.ts` 并迁入 `DamageLogEntry`

**Files:**
- Create: `src/game/types.ts`
- Modify: `src/ui/state.ts`

- [ ] **Step 1: 创建 `src/game/types.ts`**

```ts
export interface DamageLogEntry {
  time: number
  sourceName: string
  skillName: string
  amount: number
  hpAfter: number
  mitigation: number
}
```

- [ ] **Step 2: `src/ui/state.ts` 改为 re-export**

删除原 `DamageLogEntry` 定义，替换为：

```ts
export type { DamageLogEntry } from '@/game/types'
```

- [ ] **Step 3: 验证**

```bash
pnpm typecheck && pnpm test:run
```

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/ui/state.ts
git commit -m "refactor: move DamageLogEntry type to game/types"
```

---

## 阶段 C：GameScene 扩展（新状态字段 + 方法）

### Task 8: `GameScene` 添加新字段

**Files:**
- Modify: `src/game/game-scene.ts`

- [ ] **Step 1: 在 `GameScene` 类中追加新字段**

在 `src/game/game-scene.ts` 的 `// State` 段（paused/battleOver 附近）追加字段。保留现有 `paused` 和 `battleOver`，新增：

```ts
import type { BuffDef } from '@/core/types'
import type { TimelineEntry } from '@/timeline/types'
import type { DamageLogEntry } from '@/game/types'
import type { SkillBarEntry } from '@/jobs/shared'

export class GameScene {
  // ...existing imports/fields...
  
  // State (现有)
  paused = false
  battleOver = false
  player!: Entity
  
  // State (新增 - 从 ui/state 迁入)
  battleResult: 'victory' | 'wipe' | null = null
  announceText: string | null = null
  dialogText = ''
  timelineEntries: TimelineEntry[] = []
  currentPhaseInfo: { label: string; showLabel: boolean } | null = null
  damageLog: DamageLogEntry[] = []
  practiceMode = false
  skillBarEntries: SkillBarEntry[] = []
  buffDefs: Map<string, BuffDef> = new Map()
  
  // ...rest unchanged...
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -20
```

Expected: 0 相关错误。

- [ ] **Step 3: 验证测试**

```bash
pnpm test:run
```

Expected: 全部通过（新增字段不影响现有行为）。

- [ ] **Step 4: Commit**

```bash
git add src/game/game-scene.ts
git commit -m "feat(game): extend GameScene with battle runtime state fields"
```

---

### Task 9: `GameScene` 添加控制方法

**Files:**
- Modify: `src/game/game-scene.ts`

- [ ] **Step 1: 在 `GameScene` 类末尾（`dispose()` 之前）追加方法**

```ts
  /** Set pause state explicitly */
  pause(): void { this.paused = true }
  
  /** Clear pause state */
  resume(): void { this.paused = false }
  
  /** Toggle pause state */
  togglePause(): void { this.paused = !this.paused }
  
  /** Mark battle ended with result */
  endBattle(result: 'victory' | 'wipe'): void {
    this.battleOver = true
    this.battleResult = result
  }
  
  /** Set combat announce text (null to clear) */
  setAnnounce(text: string | null): void { this.announceText = text }
  
  /** Set dialog text */
  setDialog(text: string): void { this.dialogText = text }
```

- [ ] **Step 2: 验证**

```bash
pnpm typecheck && pnpm test:run
```

- [ ] **Step 3: Commit**

```bash
git add src/game/game-scene.ts
git commit -m "feat(game): add GameScene control methods (pause/resume/endBattle/setAnnounce/setDialog)"
```

---

### Task 10: `GameScene` 内部停止从 UI signal 读 paused

**Files:**
- Modify: `src/game/game-scene.ts`

- [ ] **Step 1: 删除 `src/game/game-scene.ts` 顶部的 ui/state import**

```ts
// 删除此行：
// import { paused as pausedSignal, battleResult } from '@/ui/state'
```

- [ ] **Step 2: 修改 `watchPlayerDeath()` 方法**

原代码（第 123 行附近）：
```ts
  watchPlayerDeath(): void {
    this.bus.on('damage:dealt', (payload: { target: Entity }) => {
      if (payload.target.id === this.player.id && payload.target.hp <= 0) {
        if (this.battleOver) return
        this.battleOver = true
        this.bus.emit('combat:ended', { result: 'wipe' })
        battleResult.value = 'wipe'  // 旧：写 signal
      }
    })
  }
```

改为（统一通过 `endBattle` 方法，不再手写 `this.battleOver = true`）：
```ts
  watchPlayerDeath(): void {
    this.bus.on('damage:dealt', (payload: { target: Entity }) => {
      if (payload.target.id === this.player.id && payload.target.hp <= 0) {
        if (this.battleOver) return
        this.endBattle('wipe')
        this.bus.emit('combat:ended', { result: 'wipe' })
      }
    })
  }
```

- [ ] **Step 3: 修改 `start()` 方法的 game loop**

原代码（`start()` 方法内，136-150 行附近）：
```ts
    this.gameLoop.onUpdate((dt) => {
      if (this.paused || this.battleOver) return
      if (this.devTerminal.isVisible()) return

      // Sync pause state from Preact signal
      if (pausedSignal.value !== this.paused) this.paused = pausedSignal.value

      const result = this.playerDriver.update(dt)
      if (result === 'pause') { this.paused = true; pausedSignal.value = true; return }

      this.onLogicTick?.(dt)

      this.displacer.update(dt)
      this.zoneMgr.update(dt)
    })
```

改为：
```ts
    this.gameLoop.onUpdate((dt) => {
      if (this.paused || this.battleOver) return
      if (this.devTerminal.isVisible()) return

      const result = this.playerDriver.update(dt)
      if (result === 'pause') { this.pause(); return }

      this.onLogicTick?.(dt)

      this.displacer.update(dt)
      this.zoneMgr.update(dt)
    })
```

- [ ] **Step 4: 验证**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -20
pnpm test:run
```

Expected: typecheck 仅剩 `typed-*` 缺失警告；测试全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/game/game-scene.ts
git commit -m "refactor(game): remove UI state signal coupling from GameScene"
```

---

## 阶段 D：`battle-runner` 去 UI 耦合

### Task 11: `battle-runner` 改为写 `scene.*` 字段

**Files:**
- Modify: `src/game/battle-runner.ts`

- [ ] **Step 1: 读 battle-runner 当前内容确定所有写 ui-state 的位置**

```bash
cat src/game/battle-runner.ts | grep -n "\.value\s*="
```

- [ ] **Step 2: 删除顶部 `@/ui/state` import**

原第 9 行：
```ts
import { announceText, battleResult, damageLog, combatElapsed as combatElapsedSignal, timelineEntries, dialogText, currentPhaseInfo, selectedJobId, type TimelineEntry } from '@/ui/state'
```

替换为：
```ts
import type { TimelineEntry } from '@/timeline/types'
```

- [ ] **Step 3: 所有 signal 写入改为 scene 字段写入**

用查找替换（或手工）在整个文件内做以下替换。**对每一处使用它的函数**，确保可以访问 `scene` 变量（某些位置可能需要从闭包或参数取）：

| 原 | 新 |
|---|---|
| `announceText.value = X` | `scene.setAnnounce(X)` |
| `dialogText.value = X` | `scene.setDialog(X)` |
| `timelineEntries.value = X` | `scene.timelineEntries = X` |
| `currentPhaseInfo.value = X` | `scene.currentPhaseInfo = X` |
| `damageLog.value = X` | `scene.damageLog = X` |
| `battleResult.value = X` | `scene.endBattle(X)` 统一使用该方法（X 为 `'victory'` 或 `'wipe'`） |
| `selectedJobId.value` | 作为参数传入的 `jobOverride` 替代；不再从 UI 读 |
| `combatElapsedSignal.value = X` | 现有 `scene.getCombatElapsed` 机制保留 |

注意 `startTimelineDemo` 已经接受 `jobOverride: string` 参数——把 UI 层传入的 `selectedJobId` 作为该参数值即可。`initScene` 函数里原先 `getJob(jobOverride ?? selectedJobId.value)` 的部分，由于 UI 层会总是传入 jobId，改为：

```ts
const job = getJob(jobOverride ?? 'default')
```

（把 fallback 从 `selectedJobId.value` 改为硬编码 `'default'`，因为这是"没传 job"时的合理兜底；UI 层调用方保证传入。）

另外，battle-runner 现在持有 scene 引用（`let scene: GameScene | null = null`），所以内部函数都能访问。检查每处 `.value =` 写入，确保那时 `scene` 已被赋值（应该都是在 `initScene()` 之后的回调里）。

- [ ] **Step 4: `initScene` 或战斗启动后将 job 信息写入 scene**

在 `initScene()` 函数里，`scene = new GameScene(...)` 之后，添加：

```ts
scene.skillBarEntries = job.skillBar
scene.buffDefs = job.buffMap
```

（`job.buffMap` 的类型如果不精确匹配，做合理类型断言。）

- [ ] **Step 5: 验证 typecheck**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -30
```

Expected: 与 `@/ui/state` 相关的"未定义引用"错误应已解决。

- [ ] **Step 6: 验证测试**

```bash
pnpm test:run
```

Expected: 全部通过（battle-runner 没有直接测试，且它的行为改变不影响核心逻辑层）。

- [ ] **Step 7: Commit**

```bash
git add src/game/battle-runner.ts
git commit -m "refactor(game): battle-runner writes to scene fields instead of ui signals"
```

---

## 阶段 E：Pinia Stores

### Task 12: 创建 `src/stores/battle.ts`

**Files:**
- Create: `src/stores/battle.ts`

- [ ] **Step 1: 创建 battle store**

```ts
import { defineStore } from 'pinia'
import type { BuffDef } from '@/core/types'
import type { TimelineEntry } from '@/timeline/types'
import type { DamageLogEntry } from '@/game/types'
import type { SkillBarEntry } from '@/jobs/shared'

export interface HpState {
  current: number
  max: number
  shield?: number
}

export interface CastInfo {
  name: string
  elapsed: number
  total: number
}

export interface DamageEvent {
  id: number
  screenX: number
  screenY: number
  amount: number
  isHeal: boolean
  isInvulnerable?: boolean
}

export interface BuffSnapshot {
  defId: string
  name: string
  description?: string
  icon?: string
  iconPerStack?: Record<number, string>
  type: 'buff' | 'debuff'
  stacks: number
  remaining: number
  effects: BuffDef['effects']
}

export interface DpsSkillEntry {
  name: string
  total: number
  percent: number
}

export interface DpsMeterState {
  skills: DpsSkillEntry[]
  totalDamage: number
  dps: number
}

export const useBattleStore = defineStore('battle', {
  state: () => ({
    // HP/MP
    playerHp: { current: 0, max: 0 } as HpState,
    playerMp: { current: 0, max: 0 } as HpState,
    bossHp: { current: 0, max: 0 } as HpState,
    // 施法/GCD
    gcdState: { remaining: 0, total: 0 },
    playerCast: null as CastInfo | null,
    bossCast: null as CastInfo | null,
    // Buff
    buffs: [] as BuffSnapshot[],
    buffDefs: new Map<string, BuffDef>(),
    cooldowns: new Map<string, number>(),
    // 伤害表现
    damageEvents: [] as DamageEvent[],
    damageLog: [] as DamageLogEntry[],
    dpsMeter: { skills: [], totalDamage: 0, dps: 0 } as DpsMeterState,
    // 播报
    announceText: null as string | null,
    dialogText: '',
    // 控制
    paused: false,
    battleOver: false,
    battleResult: null as 'victory' | 'wipe' | null,
    practiceMode: false,
    combatElapsed: null as number | null,
    // 场景配置
    skillBarEntries: [] as SkillBarEntry[],
    tooltipContext: { gcdDuration: 2500, haste: 0 },
    // 时间线
    timelineEntries: [] as TimelineEntry[],
    currentPhaseInfo: null as { label: string; showLabel: boolean } | null,
    // 调试
    debugPlayerPos: { x: 0, y: 0 },
  }),
})
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/battle.ts
git commit -m "feat(stores): add useBattleStore for battle runtime state"
```

---

### Task 13: 创建 `src/stores/job.ts`

**Files:**
- Create: `src/stores/job.ts`

- [ ] **Step 1: 创建 job store**

```ts
import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { getJob } from '@/jobs'

export const useJobStore = defineStore('job', () => {
  const selectedJobId = useLocalStorage('xiv-selected-job', 'default')
  const job = computed(() => getJob(selectedJobId.value))
  function select(id: string) { selectedJobId.value = id }
  return { selectedJobId, job, select }
})
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -10
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/job.ts
git commit -m "feat(stores): add useJobStore for persisted job selection"
```

---

### Task 14: 创建 `src/stores/debug.ts`

**Files:**
- Create: `src/stores/debug.ts`

- [ ] **Step 1: 创建 debug store**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDebugStore = defineStore('debug', () => {
  const fps = ref(0)
  return { fps }
})
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/debug.ts
git commit -m "feat(stores): add useDebugStore for engine-level counters"
```

---

## 阶段 F：Composables

### Task 15: 创建 `src/composables/use-engine.ts`

**Files:**
- Create: `src/composables/use-engine.ts`

- [ ] **Step 1: 创建 engine composable**

```ts
import { inject, provide, shallowRef, onMounted, onBeforeUnmount, type InjectionKey, type Ref } from 'vue'
import { Engine } from '@babylonjs/core'
import { useEventListener } from '@vueuse/core'

interface EngineCtx {
  engine: Ref<Engine | null>
  canvas: Ref<HTMLCanvasElement | null>
}

const KEY = Symbol('xiv-engine') as InjectionKey<EngineCtx>

export function provideEngine(canvas: Ref<HTMLCanvasElement | null>): EngineCtx {
  const engine = shallowRef<Engine | null>(null)
  onMounted(() => {
    if (canvas.value) {
      engine.value = new Engine(canvas.value, true, { preserveDrawingBuffer: true })
    }
  })
  useEventListener(window, 'resize', () => engine.value?.resize())
  onBeforeUnmount(() => {
    engine.value?.dispose()
    engine.value = null
  })
  const ctx: EngineCtx = { engine, canvas }
  provide(KEY, ctx)
  return ctx
}

export function useEngine(): EngineCtx {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('useEngine must be used within <App>')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/use-engine.ts
git commit -m "feat(composables): add use-engine for babylon engine lifecycle"
```

---

### Task 16: 创建 `src/composables/use-tooltip.ts`

**Files:**
- Create: `src/composables/use-tooltip.ts`

- [ ] **Step 1: 创建 tooltip composable（单例）**

```ts
import { ref, readonly } from 'vue'

interface TooltipState {
  html: string
  x: number
  y: number
}

const state = ref<TooltipState | null>(null)

export function useTooltip() {
  return {
    state: readonly(state),
    show: (html: string, x: number, y: number) => {
      state.value = { html, x, y }
    },
    hide: () => {
      state.value = null
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/use-tooltip.ts
git commit -m "feat(composables): add use-tooltip cursor-following singleton"
```

---

### Task 17: 创建 `src/composables/use-skill-panel.ts`

**Files:**
- Create: `src/composables/use-skill-panel.ts`

- [ ] **Step 1: 创建 skill panel composable**

```ts
import { ref } from 'vue'
import { useMagicKeys, whenever } from '@vueuse/core'

const isOpen = ref(false)

export function useSkillPanel() {
  return {
    isOpen,
    toggle: () => {
      isOpen.value = !isOpen.value
    },
    close: () => {
      isOpen.value = false
    },
  }
}

/** 仅在战斗场景内调用，绑定 P 键。不要在主菜单调用。 */
export function useSkillPanelHotkey() {
  const keys = useMagicKeys()
  const { toggle } = useSkillPanel()
  whenever(keys.p, toggle)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/composables/use-skill-panel.ts
git commit -m "feat(composables): add use-skill-panel singleton with P hotkey"
```

---

### Task 18: 创建 `src/composables/use-state-adapter.ts`（跨层胶水）

**Files:**
- Create: `src/composables/use-state-adapter.ts`

- [ ] **Step 1: 创建 state adapter composable**

```ts
import { useBattleStore } from '@/stores/battle'
import type { GameScene } from '@/game/game-scene'
import type { Entity } from '@/entity/entity'
import type { BuffDef } from '@/core/types'
import type { DamageEvent } from '@/stores/battle'

export function useStateAdapter(scene: GameScene) {
  const battle = useBattleStore()
  let dmgIdCounter = 0
  const playerDamageBySkill = new Map<string, number>()

  const onDamage = (payload: { target: Entity; amount: number; source?: Entity; skill?: { name: string } | null }) => {
    if (payload.source?.type === 'player' && payload.amount > 0 && payload.skill?.name) {
      const name = payload.skill.name
      playerDamageBySkill.set(name, (playerDamageBySkill.get(name) ?? 0) + payload.amount)
    }
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2
    const projected = scene.sceneManager.worldToScreen(
      payload.target.position.x,
      payload.target.position.y,
      2,
    )
    if (projected) {
      sx = projected.x
      sy = projected.y
    }
    sx += (Math.random() - 0.5) * 40
    sy += (Math.random() - 0.5) * 20
    const isHeal = payload.amount < 0
    const ev: DamageEvent = {
      id: ++dmgIdCounter,
      screenX: sx,
      screenY: sy,
      amount: Math.abs(payload.amount),
      isHeal,
    }
    battle.damageEvents = [...battle.damageEvents, ev]
  }

  const onInvulnerable = (payload: { target: Entity }) => {
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2
    const projected = scene.sceneManager.worldToScreen(
      payload.target.position.x,
      payload.target.position.y,
      2,
    )
    if (projected) {
      sx = projected.x
      sy = projected.y
    }
    sx += (Math.random() - 0.5) * 40
    sy += (Math.random() - 0.5) * 20
    const ev: DamageEvent = {
      id: ++dmgIdCounter,
      screenX: sx,
      screenY: sy,
      amount: 0,
      isHeal: false,
      isInvulnerable: true,
    }
    battle.damageEvents = [...battle.damageEvents, ev]
  }

  const onCastStart = (payload: { caster: Entity; skill: { name: string } }) => {
    const name = payload.skill?.name ?? 'Casting...'
    if (payload.caster.type === 'player') {
      battle.playerCast = { name, elapsed: 0, total: 0 }
    } else {
      battle.bossCast = { name, elapsed: 0, total: 0 }
    }
  }

  const onCastComplete = (payload: { caster: Entity }) => {
    if (payload.caster.type === 'player') battle.playerCast = null
    else battle.bossCast = null
  }

  const onCastInterrupted = (payload: { caster: Entity }) => {
    if (payload.caster?.type === 'player') battle.playerCast = null
    else battle.bossCast = null
  }

  scene.bus.on('damage:dealt', onDamage)
  scene.bus.on('damage:invulnerable', onInvulnerable)
  scene.bus.on('skill:cast_start', onCastStart)
  scene.bus.on('skill:cast_complete', onCastComplete)
  scene.bus.on('skill:cast_interrupted', onCastInterrupted)

  function writeFrame(_delta: number): void {
    const player = scene.player
    const boss = scene.bossEntity ?? scene.player
    const shield = scene.buffSystem.getShieldTotal(player)
    const haste = scene.buffSystem.getHaste(player)

    const cdMap = new Map<string, number>()
    for (const entry of scene.skillBarEntries) {
      cdMap.set(entry.skill.id, scene.skillResolver.getCooldown(player.id, entry.skill.id))
    }

    const totalDamage = [...playerDamageBySkill.values()].reduce((s, v) => s + v, 0)
    const elapsed = scene.getCombatElapsed()
    const dps = elapsed && elapsed > 0 ? totalDamage / (elapsed / 1000) : 0
    const sortedSkills = [...playerDamageBySkill.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({
        name,
        total,
        percent: totalDamage > 0 ? total / totalDamage : 0,
      }))

    battle.$patch({
      paused: scene.paused,
      battleOver: scene.battleOver,
      battleResult: scene.battleResult,
      announceText: scene.announceText,
      dialogText: scene.dialogText,
      timelineEntries: scene.timelineEntries,
      currentPhaseInfo: scene.currentPhaseInfo,
      damageLog: scene.damageLog,
      practiceMode: scene.practiceMode,
      skillBarEntries: scene.skillBarEntries,
      buffDefs: scene.buffDefs,
      combatElapsed: elapsed,
      playerHp: {
        current: player.hp,
        max: player.maxHp,
        shield: shield > 0 ? shield : undefined,
      },
      playerMp: player.maxMp > 0 ? { current: player.mp, max: player.maxMp } : battle.playerMp,
      bossHp: { current: boss.hp, max: boss.maxHp },
      gcdState: { remaining: player.gcdTimer, total: player.gcdDuration },
      playerCast: player.casting
        ? {
            name: battle.playerCast?.name ?? '',
            elapsed: player.casting.elapsed,
            total: player.casting.castTime,
          }
        : battle.playerCast,
      bossCast: boss.casting
        ? {
            name: battle.bossCast?.name ?? '',
            elapsed: boss.casting.elapsed,
            total: boss.casting.castTime,
          }
        : null,
      buffs: player.buffs.map((inst) => {
        const def = scene.buffSystem.getDef(inst.defId)
        return {
          defId: inst.defId,
          name: def?.name ?? inst.defId,
          description: def?.description,
          icon: def?.icon,
          iconPerStack: def?.iconPerStack,
          type: (def?.type ?? 'buff') as 'buff' | 'debuff',
          stacks: inst.stacks,
          remaining: inst.remaining,
          effects: def?.effects ?? [],
        }
      }),
      cooldowns: cdMap,
      tooltipContext: { gcdDuration: player.gcdDuration, haste },
      debugPlayerPos: { x: player.position.x, y: player.position.y },
      dpsMeter: { skills: sortedSkills, totalDamage, dps },
    })
  }

  function dispose(): void {
    scene.bus.off('damage:dealt', onDamage)
    scene.bus.off('damage:invulnerable', onInvulnerable)
    scene.bus.off('skill:cast_start', onCastStart)
    scene.bus.off('skill:cast_complete', onCastComplete)
    scene.bus.off('skill:cast_interrupted', onCastInterrupted)
    playerDamageBySkill.clear()
    battle.$reset()
  }

  return { writeFrame, dispose }
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck 2>&1 | grep -v "typed-" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/composables/use-state-adapter.ts
git commit -m "feat(composables): add use-state-adapter as game→store glue"
```

---

## 阶段 G：Vue 应用壳 + 样式

### Task 19: 全局 SCSS

**Files:**
- Create: `src/styles/global.scss`
- Reference: `src/ui/global.css`

- [ ] **Step 1: 读原 global.css 内容**

```bash
cat src/ui/global.css
```

- [ ] **Step 2: 创建 `src/styles/global.scss`，内容 1:1 拷自 `src/ui/global.css`**

（将 global.css 的内容完整复制到 global.scss。如果现有是纯 CSS，直接 copy；scss 是超集，不改动。）

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.scss
git commit -m "chore(styles): migrate global stylesheet to scss"
```

---

### Task 20: 创建 `src/App.vue`

**Files:**
- Create: `src/App.vue`

- [ ] **Step 1: 创建根组件**

```vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { provideEngine } from '@/composables/use-engine'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
provideEngine(canvas)
</script>

<template lang="pug">
canvas#game-canvas(ref="canvas")
#ui-overlay
  RouterView
</template>

<style lang="scss" scoped>
#ui-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'Segoe UI', sans-serif;
  color: #fff;

  :deep(> *) {
    pointer-events: auto;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/App.vue
git commit -m "feat(ui): add App.vue root with engine provider"
```

---

### Task 21: 创建 `src/main.ts`（保留 main.tsx 不动）

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: 创建 Vue 入口**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import 'virtual:uno.css'
import './styles/global.scss'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

createApp(App).use(createPinia()).use(router).mount('#app')

const loading = document.getElementById('loading-screen')
if (loading) {
  loading.classList.add('fade-out')
  loading.addEventListener('transitionend', () => loading.remove())
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main.ts
git commit -m "feat(ui): add Vue main.ts entry alongside existing main.tsx"
```

---

## 阶段 H：Pages（5 个路由页）

### Task 22: `src/pages/about.vue`（最简单的页面，先验证 pug + attributify 工作）

**Files:**
- Create: `src/pages/about.vue`

- [ ] **Step 1: 参考 `src/ui/components/MainMenu.tsx::AboutPage` 创建 Vue 版**

```vue
<script setup lang="ts">
// No script needed — purely static
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .about-card
    .about-title 关于本游戏
    p 灵感来源于 Final Fantasy XIV。玩家使用 WASD 操控角色在场地中移动，观察并躲避 Boss 释放的 AOE 攻击预兆，同时尽可能快速地输出以击杀 Boss 通关。
    .about-divider
      .about-section-title 作者
      div
        | dragon-fish |&nbsp;
        a(href="https://github.com/dragon-fish/web-fantasy-xiv" target="_blank" rel="noopener") GitHub
      .about-license GPL-3.0 License
</template>

<style lang="scss" scoped>
.about-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 16px 20px;
  max-width: 440px;
  width: 90%;
  font-size: 12px;
  color: #999;
  line-height: 2;

  a { color: #6af; text-decoration: none; }
}
.about-title {
  font-size: 14px;
  color: #ccc;
  font-weight: bold;
  margin-bottom: 8px;
}
.about-divider {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 12px;
  padding-top: 12px;
}
.about-section-title {
  color: #ccc;
  margin-bottom: 4px;
}
.about-license {
  margin-top: 4px;
  color: #666;
}
</style>
```

注意：该页引用了 `MenuShell` 和 `MenuBackButton` —— 这些还未创建，typecheck 会报缺失。允许暂时跳过，等 Task 26-27 创建后再跑。

- [ ] **Step 2: Commit**

```bash
git add src/pages/about.vue
git commit -m "feat(pages): add about page"
```

---

### Task 23: `src/pages/index.vue`（主菜单）

**Files:**
- Create: `src/pages/index.vue`

- [ ] **Step 1: 创建主菜单页**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useJobStore } from '@/stores/job'

const router = useRouter()
const jobStore = useJobStore()
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')

onMounted(() => {
  if (!tutorialSeen.value) {
    router.replace('/encounter/tutorial')
  }
})
</script>

<template lang="pug">
MenuShell
  RouterLink.menu-btn(to="/encounters" class="menu-btn-primary") ▶ &nbsp;开始关卡
  RouterLink.menu-btn(to="/job" class="menu-btn-secondary")
    | ⚔ &nbsp;查看职业
    span.job-name {{ jobStore.job.name }}
  RouterLink.menu-btn(to="/about" class="menu-btn-tertiary") ◆ &nbsp;帮助 & 关于
</template>

<style lang="scss" scoped>
.menu-btn {
  display: block;
  min-width: 240px;
  padding: 12px 32px;
  margin: 4px 0;
  font-size: 14px;
  color: #aaa;
  letter-spacing: 0.05em;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  transition: all 0.15s ease;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  &.menu-btn-primary { background: rgba(255, 255, 255, 0.10); }
  &.menu-btn-secondary { background: rgba(255, 255, 255, 0.08); }
  &.menu-btn-tertiary { background: rgba(255, 255, 255, 0.04); }
}
.job-name {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/index.vue
git commit -m "feat(pages): add main menu page"
```

---

### Task 24: `src/pages/encounters.vue`

**Files:**
- Create: `src/pages/encounters.vue`

- [ ] **Step 1: 参考 `src/ui/components/MainMenu.tsx::EncounterListPage` 写 Vue 版本**

读原组件获取必要数据结构：

```bash
sed -n '101,294p' src/ui/components/MainMenu.tsx
```

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFetch } from '@vueuse/core'

interface EncounterEntry {
  label: string
  description: string
  file: string
  difficulty?: string
  duration?: string
  dpsCheck?: number
  hidden?: boolean
}

const isDev = import.meta.env.DEV
const base = import.meta.env.BASE_URL
const selectedIdx = ref(0)
const levels = ref<EncounterEntry[]>([])

onMounted(async () => {
  const res = await fetch(`${base}encounters/index.json`)
  levels.value = await res.json()
})

const visible = computed(() =>
  isDev ? levels.value : levels.value.filter((lv) => !lv.hidden)
)
const selected = computed(() => visible.value[selectedIdx.value])
const encId = computed(() => selected.value?.file.replace(/\.yaml$/, ''))
const showPracticeBtn = computed(
  () =>
    selected.value &&
    selected.value.difficulty !== 'tutorial' &&
    selected.value.difficulty !== 'ultimate'
)
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .encounter-layout
    .encounter-list
      button.encounter-item(
        v-for="(lv, i) in visible"
        :key="lv.file"
        :class="{ selected: i === selectedIdx }"
        @click="selectedIdx = i"
      )
        MenuDifficultyBadge(:difficulty="lv.difficulty")
        span.encounter-item-label {{ lv.label }}
        span.encounter-hidden-marker(v-if="lv.hidden") [HIDDEN]
    .encounter-detail
      template(v-if="selected")
        .encounter-detail-header
          MenuDifficultyBadge(:difficulty="selected.difficulty")
          span.encounter-detail-title {{ selected.label }}
        .encounter-info-grid
          div
            span(class="text-#666") 难度：
            | {{ difficultyMeta(selected.difficulty).label }}
          div(v-if="selected.duration")
            span(class="text-#666") 耗时：
            | {{ selected.duration }}
          div(v-if="selected.dpsCheck")
            span(class="text-#666") DPS 门槛：
            | {{ selected.dpsCheck }}
        .encounter-description
          | {{ selected.description }}
        .encounter-actions
          RouterLink.btn-practice(
            v-if="showPracticeBtn"
            :to="`/encounter/${encId}?practice`"
          ) 练习模式
          RouterLink.btn-start(:to="`/encounter/${encId}`") ▶ &nbsp;进入副本
      .encounter-empty(v-else) 选择一个副本查看详情
</template>

<script lang="ts">
// 保留非 `<script setup>` 块用于 computed 里引用的 difficultyMeta helper
const DIFFICULTY_META: Record<string, { short: string; label: string; color: string }> = {
  tutorial: { short: '教学', label: '教学关卡', color: '#6a8' },
  normal:   { short: '歼灭', label: '歼灭战',   color: '#8ab' },
  extreme:  { short: '歼殛', label: '歼殛战',   color: '#c86' },
  savage:   { short: '零式', label: '零式',     color: '#c66' },
  ultimate: { short: '绝境', label: '绝境战',   color: '#d4a' },
}
function difficultyMeta(d?: string) {
  return DIFFICULTY_META[d ?? 'normal'] ?? DIFFICULTY_META.normal
}
export { difficultyMeta }
</script>

<style lang="scss" scoped>
.encounter-layout {
  display: flex;
  gap: 16px;
  max-width: 700px;
  width: 90%;
  height: 60vh;
}
.encounter-list {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.encounter-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #888;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;

  &.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
}
.encounter-item-label { flex: 1; }
.encounter-hidden-marker {
  font-size: 9px;
  color: #a86;
}
.encounter-detail {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.encounter-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.encounter-detail-title {
  font-size: 16px;
  color: #ddd;
  font-weight: bold;
}
.encounter-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 12px;
  color: #999;
  line-height: 1.8;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.encounter-description {
  flex: 1;
  overflow-y: auto;
  font-size: 12px;
  color: #aaa;
  line-height: 2;
  white-space: pre-line;
}
.encounter-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
.btn-practice {
  padding: 8px 16px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #999;
  text-decoration: none;
  transition: all 0.15s;

  &:hover { background: rgba(255, 255, 255, 0.12); }
}
.btn-start {
  padding: 8px 24px;
  font-size: 13px;
  background: rgba(184, 160, 106, 0.15);
  border: 1px solid rgba(184, 160, 106, 0.4);
  border-radius: 4px;
  color: #b8a06a;
  text-decoration: none;
  transition: all 0.15s;

  &:hover { background: rgba(184, 160, 106, 0.3); }
}
.encounter-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 13px;
}
</style>
```

（`MenuDifficultyBadge` 的 `difficultyMeta` helper 与 `encounters.vue` 共享，此处 export 以便子组件用。若子组件自己持有一份副本，删除此 export 即可。）

- [ ] **Step 2: Commit**

```bash
git add src/pages/encounters.vue
git commit -m "feat(pages): add encounter list page"
```

---

### Task 25: `src/pages/job.vue`

**Files:**
- Create: `src/pages/job.vue`
- Reference: `src/ui/components/MainMenu.tsx::JobPage` (lines ~296-427)

- [ ] **Step 1: 参考 JobPage 创建 Vue 版**

```bash
sed -n '296,427p' src/ui/components/MainMenu.tsx
```

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { JOBS, JOB_CATEGORY_LABELS, classJobIcon } from '@/jobs'
import { useJobStore } from '@/stores/job'

const jobStore = useJobStore()
const viewId = ref(jobStore.selectedJobId)
const job = computed(() => JOBS.find((j) => j.id === viewId.value) ?? JOBS[0])
const isActive = computed(() => viewId.value === jobStore.selectedJobId)
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .job-layout
    .job-list
      button.job-item(
        v-for="j in JOBS"
        :key="j.id"
        :class="{ selected: j.id === viewId }"
        @click="viewId = j.id"
      )
        span {{ j.name }}
        span.job-equipped-marker(v-if="j.id === jobStore.selectedJobId") ✓
    .job-detail
      .job-detail-header
        img.job-icon(:src="classJobIcon(job.category)" :alt="JOB_CATEGORY_LABELS[job.category]")
        span.job-name {{ job.name }}
        span.job-category {{ JOB_CATEGORY_LABELS[job.category] }}
      .job-description(v-if="job.description") {{ job.description }}
      .job-stats
        | HP {{ job.stats.hp }} | ATK {{ job.stats.attack }} | SPD {{ job.stats.speed }}
        template(v-if="job.stats.mp > 0")  &nbsp;| MP {{ job.stats.mp }}
        |  | Range {{ job.stats.autoAttackRange }}m
      .job-skills
        MenuCompactSkillRow(
          v-for="entry in job.skillBar"
          :key="entry.key"
          :key-label="entry.key"
          :skill="entry.skill"
          :buff-defs="job.buffMap"
          :gcd-duration="job.stats.gcdDuration"
        )
      .job-actions
        RouterLink.btn-trial(
          to="/encounter/training-dummy"
          @click="jobStore.select(job.id)"
        ) 试玩
        button.btn-equip(
          :disabled="isActive"
          @click="!isActive && jobStore.select(job.id)"
        ) {{ isActive ? '已选择' : '切换为此职业' }}
</template>

<style lang="scss" scoped>
.job-layout {
  display: flex;
  gap: 16px;
  max-width: 700px;
  width: 90%;
  height: 60vh;
}
.job-list {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.job-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #888;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;

  &.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
}
.job-equipped-marker {
  font-size: 10px;
  color: #6a6;
  margin-left: 4px;
}
.job-detail {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.job-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.job-icon { width: 20px; height: 20px; }
.job-name { font-size: 14px; color: #ccc; font-weight: bold; }
.job-category { font-size: 11px; color: #666; }
.job-description {
  font-size: 11px;
  color: #777;
  line-height: 1.6;
  margin-bottom: 8px;
}
.job-stats {
  font-size: 11px;
  color: #888;
  line-height: 1.8;
  margin-bottom: 12px;
}
.job-skills {
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.job-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
.btn-trial {
  padding: 6px 16px;
  font-size: 12px;
  background: rgba(184, 160, 106, 0.15);
  border: 1px solid rgba(184, 160, 106, 0.4);
  border-radius: 4px;
  color: #b8a06a;
  text-decoration: none;
}
.btn-equip {
  padding: 6px 16px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  color: #ddd;
  cursor: pointer;

  &:disabled {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
    color: #666;
    cursor: default;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/job.vue
git commit -m "feat(pages): add job selection page"
```

---

### Task 26: `src/pages/encounter/[id].vue`（战斗主入口，最复杂）

**Files:**
- Create: `src/pages/encounter/[id].vue`

- [ ] **Step 1: 参考 `src/ui/components/GameView.tsx` 写 Vue 版本**

```bash
cat src/ui/components/GameView.tsx
```

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useBattleStore } from '@/stores/battle'
import { useJobStore } from '@/stores/job'
import { startTimelineDemo, getActiveScene, disposeActiveScene } from '@/game/battle-runner'
import type { BattleInitCallback } from '@/game/battle-runner'
import { getJob, COMMON_BUFFS } from '@/jobs'

const route = useRoute('/encounter/[id]')
const router = useRouter()
const { canvas } = useEngine()
const battle = useBattleStore()
const jobStore = useJobStore()
const uiRoot = useTemplateRef<HTMLDivElement>('ui-root')
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')
const gameKey = ref(0)

const isTutorial = computed(() => route.params.id === 'tutorial')
const isPractice = computed(() =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('practice')
)

let adapter: ReturnType<typeof useStateAdapter> | null = null

async function bootBattle() {
  const id = route.params.id
  const base = import.meta.env.BASE_URL
  const encounterUrl = `${base}encounters/${id}.yaml`

  let jobId: string | undefined = jobStore.selectedJobId
  if (isTutorial.value) {
    jobId = 'default'
  } else {
    // Validate — if stored id is invalid, fall back
    const j = getJob(jobStore.selectedJobId)
    if (j.id === 'default' && jobStore.selectedJobId !== 'default') {
      jobStore.select('default')
    }
  }

  let onInit: BattleInitCallback | undefined
  if (isPractice.value) {
    onInit = (ctx) => {
      const buff = COMMON_BUFFS.practice_immunity
      ctx.registerBuffs({ practice_immunity: buff })
      ctx.buffSystem.applyBuff(ctx.player, buff, 'system')
    }
  }

  await startTimelineDemo(canvas.value!, uiRoot.value!, encounterUrl, jobId, onInit)
  const scene = getActiveScene()
  if (!scene) return
  scene.practiceMode = isPractice.value

  adapter = useStateAdapter(scene)
  scene.onRenderTick = (delta) => adapter!.writeFrame(delta)
}

onMounted(() => {
  bootBattle()
})

onBeforeUnmount(() => {
  adapter?.dispose()
  disposeActiveScene()
})

// Retry: re-trigger boot by changing gameKey + re-running
watch(gameKey, () => {
  adapter?.dispose()
  disposeActiveScene()
  bootBattle()
})

function handleRetry() {
  gameKey.value += 1
}

function handleSkipTutorial() {
  tutorialSeen.value = '1'
  router.push('/')
}

// Mark tutorial seen on enter
onMounted(() => {
  if (isTutorial.value) {
    tutorialSeen.value = '1'
  }
})
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
  HudPauseMenu(@resume="battle.paused = false")
  HudBattleEndOverlay(@retry="handleRetry")
  HudDebugInfo
  HudTimelineDisplay
  HudTooltip
  HudSkillPanel
  .skip-tutorial(v-if="isTutorial" @click="handleSkipTutorial") 跳过教程 &gt;
</template>

<style lang="scss" scoped>
#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
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

注意：
- 引用了 `HudMpBar` / `HudHpBar(mode)` / `HudCastBar(mode)` 等；原项目里 HpBar 和 MpBar 是分开的 `PlayerHpBar` / `BossHpBar` / `PlayerMpBar`。**此 plan 采用统一的 `HudHpBar` 并接受 `mode` prop**——具体见 Task 29。
- `HudSkillPanelButton` 是原 `GameView.tsx` 内嵌的小按钮，独立为组件（Task 33）
- `HudMpBar` 可以复用 `HudHpBar` 并用 prop 控制；此处分开组件更清晰，放 Task 29

- [ ] **Step 2: Commit**

```bash
git add src/pages/encounter/\[id\].vue
git commit -m "feat(pages): add encounter battle page"
```

---

## 阶段 I：Menu 共用组件

### Task 27: `src/components/menu/MenuShell.vue`

**Files:**
- Create: `src/components/menu/MenuShell.vue`

- [ ] **Step 1: 参考 `MainMenu.tsx::MenuShell` 创建**

```bash
sed -n '11,59p' src/ui/components/MainMenu.tsx
```

```vue
<script setup lang="ts"></script>

<template lang="pug">
.menu-shell
  .menu-title-block
    .menu-crystal-bg
      .menu-crystal
    h1.menu-title Web Fantasy XIV
    p.menu-subtitle 最终页游14
  slot
</template>

<style lang="scss" scoped>
.menu-shell {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  background: #000;
  pointer-events: auto;
}
.menu-title-block {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40px;
}
.menu-crystal-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 180px;
  opacity: 0.3;
  filter: blur(1px);
  pointer-events: none;
}
.menu-crystal {
  width: 100%;
  height: 100%;
  clip-path: polygon(50% 0%, 85% 35%, 50% 100%, 15% 35%);
  background: linear-gradient(160deg, #a8d8ff 0%, #4a7fff 40%, #2244aa 70%, #1a1a5e 100%);
}
.menu-title {
  position: relative;
  font-family: 'Cormorant Garamond', 'Playfair Display', 'Georgia', serif;
  font-size: 42px;
  font-weight: 400;
  letter-spacing: -1px;
  text-transform: uppercase;
  color: #d0dce8;
  text-shadow: 0 0 20px rgba(120, 160, 255, 0.4), 0 0 40px rgba(80, 120, 220, 0.2), 0 0 2px rgba(200, 220, 255, 0.5);
  margin: 0;
}
.menu-subtitle {
  position: relative;
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: rgba(140, 160, 190, 0.6);
  margin-top: 2px;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/menu/MenuShell.vue
git commit -m "feat(ui): add MenuShell component"
```

---

### Task 28: `src/components/menu/BackButton.vue`、`DifficultyBadge.vue`、`CompactSkillRow.vue`

**Files:**
- Create: `src/components/menu/BackButton.vue`
- Create: `src/components/menu/DifficultyBadge.vue`
- Create: `src/components/menu/CompactSkillRow.vue`

- [ ] **Step 1: `BackButton.vue`**

```vue
<script setup lang="ts">
defineProps<{ to: string }>()
</script>

<template lang="pug">
RouterLink.back-button(:to="to")
  | &lt; 返回
</template>

<style lang="scss" scoped>
.back-button {
  font-size: 12px;
  color: #777;
  text-decoration: none;
  cursor: pointer;
  margin-bottom: 16px;
  transition: color 0.15s;

  &:hover { color: #ddd; }
}
</style>
```

- [ ] **Step 2: `DifficultyBadge.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ difficulty?: string }>()

const DIFFICULTY_META: Record<string, { short: string; label: string; color: string }> = {
  tutorial: { short: '教学', label: '教学关卡', color: '#6a8' },
  normal:   { short: '歼灭', label: '歼灭战',   color: '#8ab' },
  extreme:  { short: '歼殛', label: '歼殛战',   color: '#c86' },
  savage:   { short: '零式', label: '零式',     color: '#c66' },
  ultimate: { short: '绝境', label: '绝境战',   color: '#d4a' },
}

const meta = computed(
  () => DIFFICULTY_META[props.difficulty ?? 'normal'] ?? DIFFICULTY_META.normal
)
</script>

<template lang="pug">
span.badge(:style="{ color: meta.color, borderColor: meta.color }")
  | {{ meta.short }}
</template>

<style lang="scss" scoped>
.badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  border: 1px solid;
  border-radius: 3px;
  line-height: 16px;
}
</style>
```

- [ ] **Step 3: `CompactSkillRow.vue`**

参考 `MainMenu.tsx::CompactSkillRow`（约 471-512 行）:

```bash
sed -n '471,512p' src/ui/components/MainMenu.tsx
```

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { SkillDef, BuffDef } from '@/core/types'
import { buildSkillTooltip } from '@/components/hud/tooltip-builders'

const props = defineProps<{
  keyLabel: string
  skill: SkillDef
  buffDefs: Map<string, BuffDef>
  gcdDuration?: number
}>()

const html = computed(() =>
  buildSkillTooltip(
    props.skill,
    props.buffDefs.size > 0 ? props.buffDefs : undefined,
    { gcdDuration: props.gcdDuration ?? 2500, haste: 0 }
  )
)
</script>

<template lang="pug">
.skill-row
  .skill-icon
    img(v-if="skill.icon" :src="skill.icon" :key="skill.icon")
    span.skill-icon-fallback(v-else) {{ skill.name.slice(0, 3) }}
    span.skill-key {{ keyLabel }}
  .skill-tooltip(v-html="html")
</template>

<style lang="scss" scoped>
.skill-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.skill-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
}
.skill-icon-fallback {
  font-size: 10px;
  color: #888;
}
.skill-key {
  position: absolute;
  top: 1px;
  left: 3px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-shadow: 0 0 2px #000, 0 0 2px #000;
  line-height: 1;
}
.skill-tooltip {
  font-size: 11px;
  line-height: 1.5;
  color: #bbb;
  flex: 1;
}
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/menu/
git commit -m "feat(ui): add Menu shared components (BackButton, DifficultyBadge, CompactSkillRow)"
```

---

## 阶段 J：HUD 组件

### Task 29: 迁移 `tooltip-builders.ts`

**Files:**
- Move: `src/ui/tooltip-builders.ts` → `src/components/hud/tooltip-builders.ts`

- [ ] **Step 1: 复制文件到新位置**

```bash
cp src/ui/tooltip-builders.ts src/components/hud/tooltip-builders.ts
```

- [ ] **Step 2: 验证没有 path alias 问题**

```bash
grep "from '@" src/components/hud/tooltip-builders.ts
```

Expected: 相对 `@/core/types` 等 alias 仍然有效（只要是绝对 alias）。

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/tooltip-builders.ts
git commit -m "chore(ui): copy tooltip-builders to new components path"
```

---

### Task 30: `HudHpBar.vue`（player + boss 双模式）

**Files:**
- Create: `src/components/hud/HpBar.vue`
- Reference: `src/ui/components/HpBar.tsx`

- [ ] **Step 1: 读原组件**

```bash
cat src/ui/components/HpBar.tsx
```

- [ ] **Step 2: 创建 `src/components/hud/HpBar.vue`**

接受 `mode` prop（`'player' | 'boss'`）切换样式。保留原 `PlayerHpBar` 和 `BossHpBar` 的样式数值。

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
const props = defineProps<{ mode: 'player' | 'boss' }>()
const battle = useBattleStore()
const hp = computed(() => props.mode === 'player' ? battle.playerHp : battle.bossHp)
const pct = computed(() => hp.value.max > 0 ? (hp.value.current / hp.value.max) * 100 : 0)
const shieldPct = computed(() =>
  hp.value.shield && hp.value.max > 0 ? (hp.value.shield / hp.value.max) * 100 : 0
)
</script>

<template lang="pug">
//- 参考 src/ui/components/HpBar.tsx 中 PlayerHpBar / BossHpBar 的布局与样式
//- Player: 底部左侧；Boss: 顶部居中
.hp-bar(:class="mode")
  .hp-bar-fill(:style="{ width: pct + '%' }")
  .hp-bar-shield(v-if="shieldPct > 0" :style="{ width: shieldPct + '%' }")
  .hp-bar-text {{ Math.round(hp.current) }} / {{ Math.round(hp.max) }}
</template>

<style lang="scss" scoped>
/* 按原 HpBar.tsx 的内联 style 重写为 scss。
   player 模式定位在底部左侧，boss 模式在顶部居中。
   颜色：player HP 绿色，boss HP 红色。 */

.hp-bar {
  position: absolute;
  pointer-events: auto;

  &.player {
    bottom: 80px;
    left: 20px;
    width: 240px;
    height: 14px;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  &.boss {
    top: 40px;
    left: 50%;
    transform: translateX(-50%);
    width: 400px;
    height: 20px;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.4);
  }
}
.hp-bar-fill {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: linear-gradient(to bottom, #4ec94e, #2a8c2a);
  transition: width 0.15s ease-out;

  .boss & {
    background: linear-gradient(to bottom, #e84c4c, #952626);
  }
}
.hp-bar-shield {
  position: absolute;
  top: 0; left: 0; bottom: 0;
  background: rgba(255, 220, 100, 0.4);
}
.hp-bar-text {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: #fff;
  text-shadow: 1px 1px 2px #000;
  z-index: 1;
}
</style>
```

> 注意：**实际数值（坐标、颜色值、过渡时长）应从原 `HpBar.tsx` 精确复制，此处结构是示意。** 执行本任务时，打开 `src/ui/components/HpBar.tsx`，把 `PlayerHpBar` 和 `BossHpBar` 中的 style 数值逐项搬进 scss。

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/HpBar.vue
git commit -m "feat(hud): add HpBar component"
```

---

### Task 31: `HudMpBar.vue`

**Files:**
- Create: `src/components/hud/MpBar.vue`
- Reference: `src/ui/components/HpBar.tsx::PlayerMpBar`

- [ ] **Step 1: 创建 MP 条**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
const battle = useBattleStore()
const pct = computed(() => battle.playerMp.max > 0 ? (battle.playerMp.current / battle.playerMp.max) * 100 : 0)
const show = computed(() => battle.playerMp.max > 0)
</script>

<template lang="pug">
.mp-bar(v-if="show")
  .mp-bar-fill(:style="{ width: pct + '%' }")
  .mp-bar-text {{ Math.round(battle.playerMp.current) }} / {{ Math.round(battle.playerMp.max) }}
</template>

<style lang="scss" scoped>
/* 参考 src/ui/components/HpBar.tsx 中 PlayerMpBar 的原始样式逐项复制 */
.mp-bar { /* ... */ }
.mp-bar-fill { /* ... */ }
.mp-bar-text { /* ... */ }
</style>
```

打开 `src/ui/components/HpBar.tsx` 找到 `PlayerMpBar`，复制其 style。

- [ ] **Step 2: Commit**

```bash
git add src/components/hud/MpBar.vue
git commit -m "feat(hud): add MpBar component"
```

---

### Task 32: `HudCastBar.vue`（player + boss 双模式）

**Files:**
- Create: `src/components/hud/CastBar.vue`
- Reference: `src/ui/components/CastBar.tsx`

- [ ] **Step 1: 读原组件**

```bash
cat src/ui/components/CastBar.tsx
```

- [ ] **Step 2: 创建 Vue 版，支持 mode prop**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
const props = defineProps<{ mode: 'player' | 'boss' }>()
const battle = useBattleStore()
const cast = computed(() => props.mode === 'player' ? battle.playerCast : battle.bossCast)
const pct = computed(() => (cast.value && cast.value.total > 0) ? (cast.value.elapsed / cast.value.total) * 100 : 0)
</script>

<template lang="pug">
.cast-bar(v-if="cast" :class="mode")
  .cast-bar-name {{ cast.name }}
  .cast-bar-track
    .cast-bar-fill(:style="{ width: pct + '%' }")
</template>

<style lang="scss" scoped>
/* 参考 src/ui/components/CastBar.tsx 中 PlayerCastBar / BossCastBar 的样式原样搬入 */
.cast-bar { /* ... */ }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/CastBar.vue
git commit -m "feat(hud): add CastBar component"
```

---

### Task 33: `HudSkillBar.vue` + `HudSkillPanelButton.vue`

**Files:**
- Create: `src/components/hud/SkillBar.vue`
- Create: `src/components/hud/SkillPanelButton.vue`
- Reference: `src/ui/components/SkillBar.tsx`, `GameView.tsx::SkillPanelButton`

- [ ] **Step 1: 读原 SkillBar**

```bash
cat src/ui/components/SkillBar.tsx
```

- [ ] **Step 2: 创建 `HudSkillBar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { useTooltip } from '@/composables/use-tooltip'
import { buildSkillTooltip } from '@/components/hud/tooltip-builders'

const battle = useBattleStore()
const tooltip = useTooltip()

const activeBuffIds = computed(() => new Set(battle.buffs.map((b) => b.defId)))

function isLocked(entry: { skill: any }) {
  const skill = entry.skill
  const reqBuffs = (skill as any).requiresBuffs as string[] | undefined
  const reqStacks = (skill as any).requiresBuffStacks as { buffId: string; stacks: number } | undefined
  const lockedByBuffs = reqBuffs ? !reqBuffs.every((id) => activeBuffIds.value.has(id)) : false
  const lockedByStacks = reqStacks
    ? (battle.buffs.find((b) => b.defId === reqStacks.buffId)?.stacks ?? 0) < reqStacks.stacks
    : false
  const lockedByMp = skill.mpCost > 0 && battle.playerMp.current < skill.mpCost
  return lockedByBuffs || lockedByStacks || lockedByMp
}

function cdTotal(entry: { skill: any }) {
  return entry.skill.gcd ? battle.gcdState.total : (entry.skill.cooldown ?? 0)
}
function activeCd(entry: { skill: any }) {
  return entry.skill.gcd ? battle.gcdState.remaining : (battle.cooldowns.get(entry.skill.id) ?? 0)
}
function cdPct(entry: { skill: any }) {
  const t = cdTotal(entry)
  const a = activeCd(entry)
  return t > 0 && a > 0 ? (a / t) * 100 : 0
}
function cdText(entry: { skill: any }) {
  const a = activeCd(entry)
  return a > 0 ? (a / 1000).toFixed(1) : null
}

function onEnter(e: MouseEvent, entry: { skill: any }) {
  const html = buildSkillTooltip(
    entry.skill,
    battle.buffDefs.size > 0 ? battle.buffDefs : undefined,
    battle.tooltipContext
  )
  tooltip.show(html, e.clientX, e.clientY)
}
function onMove(e: MouseEvent, entry: { skill: any }) {
  onEnter(e, entry)
}
function onLeave() {
  tooltip.hide()
}
</script>

<template lang="pug">
.skill-bar
  .skill-slot(
    v-for="entry in battle.skillBarEntries"
    :key="entry.key"
    :class="{ locked: isLocked(entry) }"
    @mouseenter="(e) => onEnter(e, entry)"
    @mousemove="(e) => onMove(e, entry)"
    @mouseleave="onLeave"
  )
    span.slot-key {{ entry.key }}
    img.slot-icon(v-if="entry.skill.icon" :src="entry.skill.icon")
    span.slot-fallback(v-else) {{ entry.skill.name.slice(0, 3) }}
    .slot-cd-overlay(v-if="cdPct(entry) > 0" :style="{ height: cdPct(entry) + '%' }")
    span.slot-cd-text(v-if="cdText(entry)") {{ cdText(entry) }}
</template>

<style lang="scss" scoped>
/* 参考 src/ui/components/SkillBar.tsx 的内联 style 数值。
   关键点：position absolute bottom:20 left:50% translateX(-50%),
   flex gap:6, slot 48x48 圆角 border 变化。 */
.skill-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  pointer-events: auto;
}
.skill-slot {
  width: 48px;
  height: 48px;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-size: 12px;
  cursor: default;

  &.locked {
    border-color: rgba(255, 50, 50, 0.4);
    opacity: 0.5;
  }
}
.slot-key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}
.slot-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  pointer-events: none;
}
.slot-fallback {
  font-size: 9px;
  text-align: center;
}
.slot-cd-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(0, 0, 0, 0.7);
}
.slot-cd-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: bold;
  z-index: 1;
  text-shadow: 1px 1px 2px #000;
}
</style>
```

- [ ] **Step 3: 创建 `HudSkillPanelButton.vue`**

```vue
<script setup lang="ts">
import { useSkillPanel } from '@/composables/use-skill-panel'
const { toggle } = useSkillPanel()
</script>

<template lang="pug">
.skill-panel-button(title="技能一览 (P)" @click="toggle") ?
</template>

<style lang="scss" scoped>
.skill-panel-button {
  position: absolute;
  bottom: 74px;
  left: calc(50% + 180px);
  transform: translateX(-50%);
  pointer-events: auto;
  cursor: pointer;
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #aaa;
}
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/hud/SkillBar.vue src/components/hud/SkillPanelButton.vue
git commit -m "feat(hud): add SkillBar and SkillPanelButton"
```

---

### Task 34: `HudTooltip.vue`

**Files:**
- Create: `src/components/hud/Tooltip.vue`
- Reference: `src/ui/components/Tooltip.tsx`

- [ ] **Step 1: 读原组件**

```bash
cat src/ui/components/Tooltip.tsx
```

- [ ] **Step 2: 创建 Vue 版（光标跟随）**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useTooltip } from '@/composables/use-tooltip'
const { state } = useTooltip()
const style = computed(() => {
  if (!state.value) return {}
  const { x, y } = state.value
  const margin = 12
  return {
    left: (x + margin) + 'px',
    top: (y + margin) + 'px',
  }
})
</script>

<template lang="pug">
.tooltip(v-if="state" :style="style")
  div(v-html="state.html")
</template>

<style lang="scss" scoped>
/* 参考原 Tooltip.tsx 的样式（background/border/padding/max-width 等）逐项搬入 */
.tooltip {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: #ddd;
  max-width: 320px;
  line-height: 1.5;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/Tooltip.vue
git commit -m "feat(hud): add Tooltip component (cursor-following)"
```

---

### Task 35: `HudBuffBar.vue`、`HudDpsMeter.vue`、`HudCombatAnnounce.vue`、`HudDialogBox.vue`（批量直译）

**Files:**
- Create: `src/components/hud/BuffBar.vue`
- Create: `src/components/hud/DpsMeter.vue`
- Create: `src/components/hud/CombatAnnounce.vue`
- Create: `src/components/hud/DialogBox.vue`

- [ ] **Step 1: BuffBar（读 `src/ui/components/BuffBar.tsx` 逐项迁移）**

```bash
cat src/ui/components/BuffBar.tsx
```

按 `src/ui/components/BuffBar.tsx` 结构创建 Vue 版，信号读取替换为 `useBattleStore()`：

```vue
<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'
const battle = useBattleStore()
// 其余逻辑 1:1 移植自原组件
</script>

<template lang="pug">
//- 参考原 JSX 结构逐项迁移为 pug
</template>

<style lang="scss" scoped>
/* 参考原组件 style */
</style>
```

> 由于 BuffBar 内部有分类/排序/层数角标等细节，此处不展开全部 Vue 代码——原文件约 80 行，完整移植需要按原逻辑用 pug + scss 重写。**执行本任务时请阅读并逐段对应迁移。**

- [ ] **Step 2: DpsMeter（`src/ui/components/DpsMeter.tsx`）**

同上逻辑，读原组件移植。

- [ ] **Step 3: CombatAnnounce（`src/ui/components/CombatAnnounce.tsx`）**

读 `battle.announceText`，显示弹幕风格文本。移植动画用 scss keyframes。

- [ ] **Step 4: DialogBox（`src/ui/components/DialogBox.tsx`）**

读 `battle.dialogText`。

- [ ] **Step 5: Commit**

```bash
git add src/components/hud/BuffBar.vue src/components/hud/DpsMeter.vue src/components/hud/CombatAnnounce.vue src/components/hud/DialogBox.vue
git commit -m "feat(hud): add BuffBar, DpsMeter, CombatAnnounce, DialogBox"
```

---

### Task 36: `HudPauseMenu.vue`、`HudBattleEndOverlay.vue`、`HudDebugInfo.vue`

**Files:**
- Create: `src/components/hud/PauseMenu.vue`
- Create: `src/components/hud/BattleEndOverlay.vue`
- Create: `src/components/hud/DebugInfo.vue`

- [ ] **Step 1: PauseMenu**

```vue
<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useBattleStore } from '@/stores/battle'
import { getActiveScene } from '@/game/battle-runner'

const battle = useBattleStore()
const emit = defineEmits<{ retry: []; resume: [] }>()

onKeyStroke('Escape', () => {
  getActiveScene()?.togglePause()
})

function onResume() {
  getActiveScene()?.resume()
  emit('resume')
}
function onRetry() {
  emit('retry')
}
</script>

<template lang="pug">
.pause-menu(v-if="battle.paused && !battle.battleOver")
  .pause-title 已暂停
  button.btn(@click="onResume") 继续
  button.btn(@click="onRetry") 重试
  RouterLink.btn(to="/") 返回主菜单
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/PauseMenu.tsx 样式 */
.pause-menu {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 50;
  pointer-events: auto;
  gap: 12px;
}
.pause-title {
  font-size: 32px;
  color: #fff;
  margin-bottom: 20px;
}
.btn {
  padding: 10px 32px;
  font-size: 14px;
  color: #ddd;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
  min-width: 200px;
  text-align: center;

  &:hover { background: rgba(255, 255, 255, 0.15); }
}
</style>
```

- [ ] **Step 2: BattleEndOverlay**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const emit = defineEmits<{ retry: [] }>()

const title = computed(() =>
  battle.battleResult === 'victory' ? '胜利' :
  battle.battleResult === 'wipe' ? '全灭' : ''
)
</script>

<template lang="pug">
.end-overlay(v-if="battle.battleResult")
  .end-title(:class="battle.battleResult") {{ title }}
  button.btn(@click="emit('retry')") 重试
  RouterLink.btn(to="/") 返回主菜单
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/BattleEndOverlay.tsx */
.end-overlay { /* ... */ }
</style>
```

- [ ] **Step 3: DebugInfo**

```vue
<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'
import { useDebugStore } from '@/stores/debug'

const battle = useBattleStore()
const debug = useDebugStore()

const isDev = import.meta.env.DEV
</script>

<template lang="pug">
.debug-info(v-if="isDev")
  div FPS: {{ debug.fps }}
  div Pos: ({{ battle.debugPlayerPos.x.toFixed(1) }}, {{ battle.debugPlayerPos.y.toFixed(1) }})
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/DebugInfo.tsx */
.debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  font-family: monospace;
  font-size: 11px;
  color: #8f8;
  background: rgba(0, 0, 0, 0.5);
  padding: 4px 8px;
  border-radius: 2px;
}
</style>
```

注：原来 `debugFps` 是在 UI 层 signal 里；新设计里放到 `useDebugStore`。需要更新 `use-state-adapter` 或其他地方把引擎的 FPS 值写入 debug store。看原项目里 `debugFps` 的写入点：

```bash
grep -rn "debugFps" src/
```

找到写入点后，改为写 `useDebugStore().fps`。若 FPS 只在 engine 里计算，可以在 App.vue 或 encounter 页的 onRenderTick 里写入：`debug.fps = scene.engine.getFps()`。

- [ ] **Step 4: Commit**

```bash
git add src/components/hud/PauseMenu.vue src/components/hud/BattleEndOverlay.vue src/components/hud/DebugInfo.vue
git commit -m "feat(hud): add PauseMenu, BattleEndOverlay, DebugInfo"
```

---

### Task 37: `HudTimelineDisplay.vue`

**Files:**
- Create: `src/components/hud/TimelineDisplay.vue`
- Reference: `src/ui/components/TimelineDisplay.tsx`

- [ ] **Step 1: 读原组件（"SidePanel" export，注意命名）**

```bash
cat src/ui/components/TimelineDisplay.tsx
```

- [ ] **Step 2: 创建 Vue 版**

```vue
<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const collapsed = useLocalStorage('xiv-timeline-collapsed', false)

function toggle() {
  collapsed.value = !collapsed.value
}
</script>

<template lang="pug">
.timeline-panel(:class="{ collapsed }")
  button.timeline-toggle(@click="toggle") {{ collapsed ? '◀' : '▶' }}
  //- 其余内容参考原 TimelineDisplay.tsx
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/TimelineDisplay.tsx */
</style>
```

完整逻辑包括 timelineEntries 排序、currentPhaseInfo 标签显示等，逐项从原组件移植。

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/TimelineDisplay.vue
git commit -m "feat(hud): add TimelineDisplay component"
```

---

### Task 38: `HudDamageFloater.vue`

**Files:**
- Create: `src/components/hud/DamageFloater.vue`
- Reference: `src/ui/components/DamageFloater.tsx`

- [ ] **Step 1: 读原组件**

```bash
cat src/ui/components/DamageFloater.tsx
```

- [ ] **Step 2: 创建 Vue 版（每条飘字按 id 唯一、动画完移除）**

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()

// 当新 event 进来，启动 setTimeout 800ms 后从数组移除（match 原动画时长）
watch(() => battle.damageEvents, (newList, oldList) => {
  const newlyAdded = newList.filter(
    (e) => !oldList?.some((o) => o.id === e.id)
  )
  for (const ev of newlyAdded) {
    setTimeout(() => {
      battle.damageEvents = battle.damageEvents.filter((x) => x.id !== ev.id)
    }, 800)
  }
}, { deep: false })
</script>

<template lang="pug">
.damage-floater
  .dmg-text(
    v-for="ev in battle.damageEvents"
    :key="ev.id"
    :class="{ heal: ev.isHeal, invulnerable: ev.isInvulnerable }"
    :style="{ left: ev.screenX + 'px', top: ev.screenY + 'px' }"
  )
    template(v-if="ev.isInvulnerable") 无敌
    template(v-else) {{ ev.isHeal ? '+' : '' }}{{ ev.amount }}
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/DamageFloater.tsx 的 keyframes 动画 */
.damage-floater {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.dmg-text {
  position: absolute;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  text-shadow: 1px 1px 2px #000, 0 0 4px rgba(0,0,0,0.8);
  animation: dmg-float 0.8s ease-out forwards;
  transform: translate(-50%, -50%);

  &.heal { color: #4ea; }
  &.invulnerable { color: #888; font-size: 14px; }
}
@keyframes dmg-float {
  0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  20%  { opacity: 1; transform: translate(-50%, -75%) scale(1.2); }
  80%  { opacity: 1; transform: translate(-50%, -120%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -150%) scale(1); }
}
</style>
```

> 关键：**原组件的 keyframes 和 timing 需要从 `src/ui/components/DamageFloater.tsx` 精确复制。** 执行时请参考原文件。

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/DamageFloater.vue
git commit -m "feat(hud): add DamageFloater component"
```

---

### Task 39: `HudSkillPanel.vue`（全屏技能一览，含 P 热键）

**Files:**
- Create: `src/components/hud/SkillPanel.vue`
- Reference: `src/ui/components/SkillPanel.tsx`

- [ ] **Step 1: 读原组件**

```bash
cat src/ui/components/SkillPanel.tsx
```

- [ ] **Step 2: 创建 Vue 版**

```vue
<script setup lang="ts">
import { useSkillPanel, useSkillPanelHotkey } from '@/composables/use-skill-panel'
import { useBattleStore } from '@/stores/battle'

const { isOpen, close } = useSkillPanel()
useSkillPanelHotkey()

const battle = useBattleStore()
</script>

<template lang="pug">
.skill-panel(v-if="isOpen")
  .skill-panel-header
    span 技能一览
    button.close-btn(@click="close") ✕
  .skill-panel-body
    MenuCompactSkillRow(
      v-for="entry in battle.skillBarEntries"
      :key="entry.key"
      :key-label="entry.key"
      :skill="entry.skill"
      :buff-defs="battle.buffDefs"
      :gcd-duration="battle.tooltipContext.gcdDuration"
    )
</template>

<style lang="scss" scoped>
/* 参考原 src/ui/components/SkillPanel.tsx */
.skill-panel {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 600px;
  max-height: 80vh;
  background: rgba(0, 0, 0, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  z-index: 200;
  pointer-events: auto;
}
.skill-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 14px;
  color: #ddd;
}
.close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 16px;
}
.skill-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/SkillPanel.vue
git commit -m "feat(hud): add SkillPanel component with P hotkey"
```

---

## 阶段 K：切换入口 + 清理

### Task 40: 切换 HTML 入口到 main.ts

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 修改 script src**

```html
<!-- old: <script type="module" src="/src/main.tsx"></script> -->
<script type="module" src="/src/main.ts"></script>
```

- [ ] **Step 2: 启动 dev server 验证**

```bash
pnpm dev
```

手动浏览器测试：
- 访问 `http://localhost:5173/`，看主菜单
- 访问 `/encounters`、`/job`、`/about` 各一次
- 进一个副本（如 `/encounter/training-dummy`），验证战斗可以进入、HUD 显示、暂停菜单、退出

如果看到控制台报错，按错误信息修，**不 commit**，直到所有报错清零。

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: switch entry from main.tsx to main.ts"
```

---

### Task 41: 删除 Preact UI 与相关代码

**Files:**
- Delete: `src/ui/**`
- Delete: `src/main.tsx`

- [ ] **Step 1: 删除旧 UI 目录与入口**

```bash
rm -rf src/ui/
rm src/main.tsx
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck
```

Expected: 通过。若有残留引用到 `@/ui/...` 的文件，按错误信息修复。

- [ ] **Step 3: 验证测试**

```bash
pnpm test:run
```

Expected: 全部通过。

- [ ] **Step 4: 运行 dev server 再次烟雾测试**

```bash
pnpm dev
```

走一遍完整路径（主菜单 → 副本 → 暂停/重试/退出），没有问题再 commit。

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: remove preact ui layer"
```

---

### Task 42: 从 package.json 删除 Preact 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 编辑 package.json 删除 Preact 相关项**

```json
{
  "dependencies": {
    "@babylonjs/core": "^9.2.0",
    "@vueuse/core": "^11.0.0",
    "minimist": "^1.2.8",
    "pinia": "^2.2.0",
    "vue": "^3.5.0",
    "vue-router": "^5.0.0",
    "yaml": "^2.8.3"
  },
  "devDependencies": {
    // 删除 @preact/preset-vite
    // 保留其它
  }
}
```

- [ ] **Step 2: 重新安装以刷新 lockfile**

```bash
pnpm install
```

- [ ] **Step 3: 修改 `vite.config.ts` 删除 `preact()` 插件**

```ts
// 删除：import preact from '@preact/preset-vite'
// 在 plugins 数组中删除 preact()
```

- [ ] **Step 4: 验证**

```bash
pnpm typecheck && pnpm test:run && pnpm build
```

- [ ] **Step 5: 全局 grep 验证无 preact 残留**

```bash
grep -rn "preact\|@preact" src/ package.json vite.config.ts || echo "clean"
```

Expected: 输出 `clean`。

- [ ] **Step 6: 验证分层清洁**

```bash
grep -rn "from ['\"]@/ui" src/ || echo "no ui imports"
```

Expected: 输出 `no ui imports`。

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts
git commit -m "chore: remove preact deps and vite plugin"
```

---

### Task 43: 更新 CLAUDE.md UI Layer 描述

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 找到 UI Layer 描述段落**

```bash
grep -n "UI Layer\|Preact\|preact" CLAUDE.md
```

- [ ] **Step 2: 更新为 Vue 版本**

在 `CLAUDE.md` 的 Architecture 段落中，将原 UI Layer 描述：

```
**UI Layer** (Preact + @preact/signals):
- `src/ui/` — HP bars, skill bar, cast bar, damage floaters, buff bar, timeline display
- `src/input/` — Keyboard/mouse input handling
- `src/devtools/` — Developer terminal (~ key), event log, command system
```

改为：

```
**UI Layer** (Vue 3 + Pinia + vue-router 5):
- `src/pages/` — File-based route pages (index, encounters, job, about, encounter/[id])
- `src/components/` — HUD + menu components (folder-namespaced auto-imports via unplugin-vue-components)
- `src/stores/` — Pinia stores (useBattleStore / useJobStore / useDebugStore)
- `src/composables/` — use-engine, use-tooltip, use-skill-panel, use-state-adapter
- `src/styles/` — Global scss + mixins
- `src/input/` — Keyboard/mouse input handling (pure TS, unchanged)
- `src/devtools/` — Developer terminal (~ key), event log, command system (pure TS, unchanged)
```

同时更新 Tech Stack 段落：把 Preact/preact-iso/@preact/signals 替换为 Vue 3 + pinia + vue-router 5 + @vueuse/core + pug + scss + UnoCSS Attributify。

同时更新 Key Patterns：
```
- **State**: Pinia stores; UI reads store values mirrored from GameScene via use-state-adapter per frame. UI never writes to stores directly; mutations flow through GameScene methods (scene.pause(), scene.endBattle(), etc.)
- **Template style**: pug + scss with UnoCSS Attributify; arbitrary-value utilities like `top-[50px]` must be quoted: `div(top="[50px]")` (pug requires it)
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for vue migration"
```

---

### Task 44: 最终验证（验证清单全走一遍）

**Files:** 无代码修改

- [ ] **Step 1: Typecheck / Build / Tests**

```bash
pnpm typecheck
pnpm build
pnpm test:run
```

全部通过。

- [ ] **Step 2: 分层清洁度检查**

```bash
# 非 UI 目录下不能 import @/ui
grep -rn "from ['\"]@/ui" src/ && echo "FAIL" || echo "PASS"

# 任何位置不能再有 preact
grep -rn "@preact\|preact-iso\|preact/hooks" src/ package.json && echo "FAIL" || echo "PASS"

# src/ui/ 必须不存在
[ -d src/ui ] && echo "FAIL" || echo "PASS"

# src/main.tsx 必须不存在
[ -f src/main.tsx ] && echo "FAIL" || echo "PASS"
```

所有 PASS。

- [ ] **Step 3: 功能烟雾测试（手工过）**

`pnpm dev`，按 spec 第 18 节清单逐项验证：
- `/` 主菜单
- `/encounters` 副本列表
- `/job` 职业切换
- `/about` 静态页
- `/encounter/tutorial` 教程（skip 按钮）
- `/encounter/training-dummy` 试玩
- 一个完整副本：
  - HP/MP 条、CastBar、SkillBar（含 MP/Buff 锁）、Tooltip 跟随光标、BuffBar、DamageFloater、TimelineDisplay（含折叠持久化）、DpsMeter、Announce/Dialog、SkillPanel (P)、PauseMenu (Esc)、BattleEndOverlay、DebugInfo
- `?practice` 模式
- `~` DevTerminal

每项通过打勾，遇到问题补修并 commit。

- [ ] **Step 4: 如果有修复 commit，总结性 commit 或合并**

若 Task 44 过程中打了若干 `fix:` commit，都留在分支历史里即可，不 squash。PR 合并时由 reviewer 决定压缩策略。

---

## 完成标志

- [ ] 分支 `refactor/preact-to-vue` 上所有 44 个任务完成
- [ ] `pnpm typecheck && pnpm test:run && pnpm build` 三连通过
- [ ] 所有烟雾测试项通过
- [ ] 分层清洁度检查通过
- [ ] CLAUDE.md 已更新

准备好提 PR 到 master。

---

## 附录：常见问题

### Q: `vue-router/vite` 首次启动 typed-router.d.ts 还没生成，typecheck 报错怎么办？
A: 先跑一次 `pnpm dev`（等加载完成后 Ctrl+C），它会生成 `src/typed-router.d.ts` 和 `src/typed-components.d.ts`。之后 `pnpm typecheck` 即可通过。

### Q: 中途某个 Vue 组件渲染出错，dev server 报错看不懂？
A: 优先检查：
1. pug 模板里是否有未加引号的 `[...]`（UnoCSS 任意值必须 `class="top-[50px]"` 或 `div(top="[50px]")`）
2. 是否在 `setup` 外调用了 Vue lifecycle hook（onMounted/onBeforeUnmount 必须同步调用）
3. `useBattleStore()` 是否在 Vue setup 或 composable 内调用，不能在模块顶层

### Q: 某一任务中 commit 的范围出现不相关改动？
A: 遵循项目 global rule：如发现改动涉及多个不相关功能，先 `git stash` 拆分后再分别 commit。
