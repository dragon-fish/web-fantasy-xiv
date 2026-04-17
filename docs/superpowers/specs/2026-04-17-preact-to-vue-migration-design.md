# Preact → Vue 全量迁移设计

Date: 2026-04-17
Status: Spec (awaiting implementation plan)
Scope: Full replacement of the Preact-based UI layer with Vue 3 + vue-router 5 + Pinia + @vueuse/core. Clean up game/UI layering violations as part of the same refactor.

---

## 1. 目标与动机

- 当前 UI 层基于 Preact + preact-iso + @preact/signals，共 ~17 个组件，涉及 5 条路由、20+ 个模块级 signals、跨层耦合（game 层直接写 UI state）。
- 本项目开发者更擅长 Vue 生态，切换至 Vue 可提升持续开发效率。
- 同时修正当前的分层破坏：让 `GameScene` 拥有完整战斗运行时状态，UI 变为无状态的只读渲染层，彻底解耦 renderer / engine / UI 三层。

## 2. 非目标 / 明确不做

- 不重写 `src/input/input-manager.ts`（核心层保持纯 TS，@vueuse/core 只进 UI 层）。
- 不引入 Vue 组件单元测试框架（现有 0 个 UI 测试，本次迁移不新增）。
- 不改动 `src/core/ entity/ combat/ skill/ timeline/ ai/ arena/ config/ jobs/ renderer/` 的内部逻辑（仅类型定义跨目录搬迁）。
- 不改动 `public/encounters/*.yaml` 配置 schema。
- 不新建 `useProfileStore`（无字段可放——未来持久玩家数据如等级/金币落地时再加）。
- 不引入 Vue 组件级 ErrorBoundary（使用 Vue 默认错误行为，YAGNI）。

## 3. 目录结构

```
src/
  core/ entity/ combat/ skill/ timeline/ ai/ arena/ config/ jobs/      # 不变（纯 TS）
  renderer/                                                             # 不变（Babylon）
  game/                                                                 # 保留但修正层级引用
  input/ devtools/                                                      # 不变（纯 TS）

  pages/                        # vue-router 5 file-based routing 入口
    index.vue                   #  /
    encounters.vue              #  /encounters
    job.vue                     #  /job
    about.vue                   #  /about
    encounter/[id].vue          #  /encounter/:id
  components/                   # 可复用 HUD 与菜单组件（按目录命名空间自动导入）
    hud/
      HpBar.vue                 # <HudHpBar />
      CastBar.vue               # <HudCastBar />
      SkillBar.vue              # <HudSkillBar />
      BuffBar.vue               # <HudBuffBar />
      DamageFloater.vue         # <HudDamageFloater />
      CombatAnnounce.vue        # <HudCombatAnnounce />
      DialogBox.vue             # <HudDialogBox />
      PauseMenu.vue             # <HudPauseMenu />
      BattleEndOverlay.vue      # <HudBattleEndOverlay />
      DebugInfo.vue             # <HudDebugInfo />
      TimelineDisplay.vue       # <HudTimelineDisplay />
      SkillPanel.vue            # <HudSkillPanel />
      DpsMeter.vue              # <HudDpsMeter />
      Tooltip.vue               # <HudTooltip />
      tooltip-builders.ts       # 纯 TS 工具函数（原 ui/tooltip-builders.ts）
    menu/
      MenuShell.vue             # <MenuShell />
      BackButton.vue            # <MenuBackButton />
      DifficultyBadge.vue       # <MenuDifficultyBadge />
      CompactSkillRow.vue       # <MenuCompactSkillRow />
  stores/
    battle.ts                   # useBattleStore
    job.ts                      # useJobStore
    debug.ts                    # useDebugStore
  composables/
    use-engine.ts               # provide/inject 封装 Babylon Engine + canvas
    use-tooltip.ts              # 单例跟随光标 tooltip 的 composable
    use-skill-panel.ts          # 单例技能面板开关（含 P 热键）
    use-state-adapter.ts        # 每帧读 scene.* → $patch 到 battleStore（唯一跨层胶水）
  styles/
    global.scss                 # 原 ui/global.css 迁入
    _mixins.scss                # 可选的复用 mixin
  App.vue
  main.ts
  typed-components.d.ts         # unplugin-vue-components 生成
  typed-router.d.ts             # vue-router/vite 生成
```

**原 `src/ui/` 目录整体删除**。

## 4. 依赖变更

### 新增
- `vue`（^3.x）
- `vue-router`（^5.x，自带 file-based routing；Vite 插件来自 `vue-router/vite`，routes 从 `vue-router/auto-routes` 导入；无需单独安装 `unplugin-vue-router`）
- `pinia`
- `@vueuse/core`
- `sass`（SCSS 支持）
- `pug`（pug 模板支持）

### devDeps 新增
- `@vitejs/plugin-vue`
- `@vitejs/plugin-vue-jsx`
- `unplugin-vue-components`
- `@unocss/preset-attributify`

### 删除
- `preact`
- `preact-iso`
- `@preact/signals`
- `@preact/preset-vite`（devDep）

## 5. 构建配置

### `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import Components from 'unplugin-vue-components/vite'
import UnoCSS from 'unocss/vite'
import { resolve } from 'node:path'

export default defineConfig({
  server: {
    forwardConsole: { logLevels: ['error', 'warn', 'info'] },
  },
  plugins: [
    VueRouter({ routesFolder: 'src/pages' }),   // 必须在 Vue() 之前
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
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
})
```

### `uno.config.ts`

```ts
import { defineConfig } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'
import presetAttributify from '@unocss/preset-attributify'

export default defineConfig({
  presets: [presetWind4(), presetAttributify()],
})
```

### `tsconfig.app.json`
增加 `typed-router.d.ts` 和 `typed-components.d.ts` 到 `include`，确保 `moduleResolution: "Bundler"`。

### `main.ts`（替换原 `main.tsx`）

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import 'virtual:uno.css'
import './styles/global.scss'
import App from './App.vue'

const router = createRouter({ history: createWebHistory(), routes })
createApp(App).use(createPinia()).use(router).mount('#app')

const loading = document.getElementById('loading-screen')
if (loading) {
  loading.classList.add('fade-out')
  loading.addEventListener('transitionend', () => loading.remove())
}
```

## 6. 分层原则（核心）

```
UI Layer (Vue + Pinia)
  ├─ pages/ components/ stores/ composables/
  ├─ 通过 use-state-adapter 读 GameScene 状态 → $patch 到 store
  └─ 通过调用 scene.pause() / scene.resume() / scene.endBattle() 等方法触发游戏侧变化

           ▲               │
           │ 读状态        │ 调方法
           │               ▼

Game Layer (pure TS)
  ├─ game/battle-runner.ts  ← 战斗启动编排
  ├─ game/game-scene.ts     ← 状态与系统容器
  ├─ game/combat-resolver.ts / camera-controller / ...
  ├─ ai/ timeline/ combat/ skill/ entity/ arena/ core/ config/ jobs/
  ├─ renderer/ (Babylon)
  └─ 不 import @/ui/* / @/stores/* / @/composables/* / vue / pinia
```

### 强约束
- 重构完成后 `grep -rn "from ['\"]@/ui" src/`（非 UI 目录）必须 0 命中
- `grep -rn "@preact|preact" src/ package.json` 必须 0 命中
- 游戏层不感知 Vue / Pinia / vue-router / @vueuse 的存在

### 关于 `battle-runner`
属于 **Game Layer / 编排子层**，不是跨层胶水。职责："如何从 YAML + job + canvas 拼出一个能跑的战斗"。重构后：
- 不再 import `@/ui/*` 的任何符号
- 所有原先写入 UI signal 的语句改为写入 `scene.*` 字段（如 `scene.announceText = '...'`）
- `uiRoot: HTMLDivElement` 参数保留——只是"游戏侧要一块 DOM 挂 DevTerminal"，是 DOM 元素而非 UI 框架依赖

### 唯一真·跨层胶水
`src/composables/use-state-adapter.ts` —— 每帧读 `scene.*` 并 `battleStore.$patch(...)`；订阅 `scene.bus` 离散事件写 store。

## 7. GameScene 状态重划

`GameScene` 在重构后成为**战斗运行时状态的唯一源头**。新增/保留字段：

```ts
class GameScene {
  // 已有
  paused = false
  battleOver = false
  player: Entity
  bossEntity: Entity | null = null

  // 从 ui/state.ts 迁入的新字段
  battleResult: 'victory' | 'wipe' | null = null
  announceText: string | null = null
  dialogText = ''
  timelineEntries: TimelineEntry[] = []
  currentPhaseInfo: { label: string; showLabel: boolean } | null = null
  damageLog: DamageLogEntry[] = []
  practiceMode = false
  skillBarEntries: SkillBarEntry[] = []   // 由 battle-runner 在 initScene 中设置
  buffDefs: Map<string, BuffDef> = new Map()

  // 新增方法（UI 通过这些方法修改游戏状态）
  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  togglePause(): void { this.paused = !this.paused }
  endBattle(result: 'victory' | 'wipe'): void {
    this.battleOver = true
    this.battleResult = result
  }
  setAnnounce(text: string | null): void { this.announceText = text }
  setDialog(text: string): void { this.dialogText = text }
}
```

### 类型跨目录移动

| 类型 | 原位置 | 新位置 | 理由 |
|---|---|---|---|
| `TimelineEntry` | `ui/state.ts` | `@/timeline/types.ts`（或 `@/game/types.ts`） | 时间线概念 |
| `DamageLogEntry` | `ui/state.ts` | `@/game/types.ts` | 战斗记录概念 |
| `SkillBarEntry` | `ui/state.ts` | `@/jobs/shared.ts` | 职业层概念，原本就被 jobs/shared.ts 引用 |
| `HpState` / `CastInfo` / `DamageEvent` / `BuffSnapshot` / `DpsSkillEntry` | `ui/state.ts` | `@/stores/battle.ts` | 纯 UI 渲染 DTO，随 store 一起定义 |

## 8. Pinia Stores 拆分

### `useBattleStore`（stores/battle.ts）
所有"一场战斗内有效"的状态。由 `use-state-adapter` 每帧 `$patch`，UI 只读。

| 分组 | 字段 |
|---|---|
| HP/MP | `playerHp`, `playerMp`, `bossHp` |
| 施法/GCD | `gcdState`, `playerCast`, `bossCast` |
| Buff | `buffs`, `buffDefs`, `cooldowns` |
| 伤害表现 | `damageEvents`, `damageLog`, `dpsMeter` |
| 播报 | `announceText`, `dialogText` |
| 控制 | `paused`, `battleResult`, `battleOver`, `practiceMode`, `combatElapsed` |
| 场景配置 | `skillBarEntries`, `tooltipContext` |
| 时间线 | `timelineEntries`, `currentPhaseInfo` |
| 调试 | `debugPlayerPos` |

Actions：`$reset()`（Pinia 内置；scene dispose 时调用）。

### `useJobStore`（stores/job.ts）
用户持久化偏好。

```ts
export const useJobStore = defineStore('job', () => {
  const selectedJobId = useLocalStorage('xiv-selected-job', 'default')
  const job = computed(() => getJob(selectedJobId.value))
  function select(id: string) { selectedJobId.value = id }
  return { selectedJobId, job, select }
})
```

### `useDebugStore`（stores/debug.ts）
引擎级计数，留扩展余地。

```ts
export const useDebugStore = defineStore('debug', () => {
  const fps = ref(0)
  return { fps }
})
```

### 不单独开 store
- `timelineCollapsed` → `HudTimelineDisplay.vue` 内 `useLocalStorage('xiv-timeline-collapsed', false)`
- `xiv-tutorial-seen` → 在首页与 encounter 组件内 `useLocalStorage('xiv-tutorial-seen', '')`

### Future extensions
- 将来添加持久玩家数据（等级、金币、已解锁内容、进度成就）时新建 `stores/profile.ts` → `useProfileStore`，与 `useJobStore` 保持分离（job 是可切换的 UI 选择，profile 是永久进度）。届时 `xiv-tutorial-seen` 等进度 flag 可从内联 `useLocalStorage` 迁入 profile store。

### Pinia 在 Vue 组件外调用的注意事项
由于 `src/game/*.ts` 运行时不触及 Pinia（已在第 6 节解耦），因此实际上只有 UI 层内部会调用 `useBattleStore()` 等。全部调用都在 Vue 组件或 composable 的 setup 上下文中，安全。

## 9. 路由

vue-router 5 自带 file-based routing（官方 2026-03 的 v5.0 已把 `unplugin-vue-router` 吞并进核心）。

### 映射

```
src/pages/index.vue              →  /
src/pages/encounters.vue         →  /encounters
src/pages/job.vue                →  /job
src/pages/about.vue              →  /about
src/pages/encounter/[id].vue     →  /encounter/:id
```

### 类型安全
`vue-router/vite` 自动生成 `typed-router.d.ts`。组件内：

```ts
const route = useRoute('/encounter/[id]')
route.params.id    // string，自动推导
```

### 导航
统一用路径字符串 `router.push('/encounters')` / `<RouterLink to="/encounters">`。本次不使用 `definePage({ name: '...' })` 宏——未来若要按组件粒度命名再加。

## 10. Babylon Engine 生命周期

### `composables/use-engine.ts`

```ts
import { inject, provide, shallowRef, onMounted, onBeforeUnmount, type InjectionKey, type Ref } from 'vue'
import { Engine } from '@babylonjs/core'
import { useEventListener } from '@vueuse/core'

interface EngineCtx {
  engine: Ref<Engine | null>
  canvas: Ref<HTMLCanvasElement | null>
}

const KEY = Symbol('xiv-engine') as InjectionKey<EngineCtx>

export function provideEngine(canvas: Ref<HTMLCanvasElement | null>) {
  const engine = shallowRef<Engine | null>(null)
  onMounted(() => {
    engine.value = new Engine(canvas.value!, true, { preserveDrawingBuffer: true })
  })
  useEventListener(window, 'resize', () => engine.value?.resize())
  onBeforeUnmount(() => {
    engine.value?.dispose()
    engine.value = null
  })
  provide(KEY, { engine, canvas })
  return { engine, canvas }
}

export function useEngine(): EngineCtx {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('useEngine must be used within <App>')
  return ctx
}
```

### `App.vue`

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
  position: absolute; inset: 0;
  pointer-events: none;
  font-family: 'Segoe UI', sans-serif;
  color: #fff;
  :deep(> *) { pointer-events: auto; }
}
</style>
```

**注意** `shallowRef(Engine)` 避免深度响应化外部类实例。

## 11. Tooltip / SkillPanel composable 单例

### `use-tooltip.ts`（跟随光标）

```ts
import { ref, readonly } from 'vue'

interface TooltipState { html: string; x: number; y: number }
const state = ref<TooltipState | null>(null)   // 模块级单例

export function useTooltip() {
  return {
    state: readonly(state),
    show: (html: string, x: number, y: number) => { state.value = { html, x, y } },
    hide: () => { state.value = null },
  }
}
```

- `<HudTooltip />` 挂在 `App.vue` 或 `encounter/[id].vue` 顶层一次，读 `state` 跟随光标渲染（`v-if="state"` + `:style="{ left: ..., top: ... }"`）
- `<HudSkillBar />` 在 `@mouseenter/@mousemove/@mouseleave` 调 `useTooltip().show / hide`
- Tooltip 内容仍是 HTML 字符串（`buildSkillTooltip()` 输出），模板里 `<div v-html="state.html" />`

### `use-skill-panel.ts`

```ts
import { ref } from 'vue'
import { useMagicKeys, whenever } from '@vueuse/core'

const isOpen = ref(false)

export function useSkillPanel() {
  return {
    isOpen,
    toggle: () => { isOpen.value = !isOpen.value },
    close: () => { isOpen.value = false },
  }
}

/** 仅在战斗场景内调用，绑定 P 键。不要在主菜单调用。 */
export function useSkillPanelHotkey() {
  const keys = useMagicKeys()
  const { toggle } = useSkillPanel()
  whenever(keys.p, toggle)
}
```

`<HudSkillPanel />` 挂载时调 `useSkillPanelHotkey()`；主菜单不挂，避免 P 键误触。

## 12. `use-state-adapter.ts`（跨层胶水）

替代原 `src/ui/state-adapter.ts`。职责：
1. 订阅 `scene.bus` 上的离散事件（damage:dealt / skill:cast_start/complete/interrupted / damage:invulnerable）→ 计算 DPS / DamageFloater 坐标 → 写 store
2. `writeFrame` 每帧从 `scene.*` 与 `scene.player/boss` 读出全部渲染所需状态 → 一次性 `battleStore.$patch({...})`

```ts
export function useStateAdapter(scene: GameScene) {
  const battle = useBattleStore()
  let dmgIdCounter = 0
  const playerDamageBySkill = new Map<string, number>()

  const onDamage = (payload) => { /* ... push damageEvents, accumulate DPS ... */ }
  const onInvulnerable = (payload) => { /* ... */ }
  const onCastStart = (payload) => { /* ... */ }
  const onCastComplete = (payload) => { /* ... */ }
  const onCastInterrupted = (payload) => { /* ... */ }

  scene.bus.on('damage:dealt', onDamage)
  scene.bus.on('damage:invulnerable', onInvulnerable)
  scene.bus.on('skill:cast_start', onCastStart)
  scene.bus.on('skill:cast_complete', onCastComplete)
  scene.bus.on('skill:cast_interrupted', onCastInterrupted)

  function writeFrame(delta: number): void {
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
      combatElapsed: scene.getCombatElapsed(),   // GameScene 已有的 getter hook，不引入新字段
      playerHp: { current: scene.player.hp, max: scene.player.maxHp, shield: /* ... */ },
      playerMp: /* ... */,
      bossHp: /* ... */,
      gcdState: /* ... */,
      playerCast: /* ... */,
      bossCast: /* ... */,
      buffs: /* ... */,
      cooldowns: /* ... */,
      tooltipContext: /* ... */,
      debugPlayerPos: { x: scene.player.position.x, y: scene.player.position.y },
      dpsMeter: /* ... */,
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

`encounter/[id].vue` 里（`onBeforeUnmount` 必须在 setup 同步注册，不能嵌在 onMounted 里）：
```ts
const { canvas } = useEngine()
let adapter: ReturnType<typeof useStateAdapter> | null = null

onMounted(async () => {
  await startTimelineDemo(canvas.value!, uiRoot.value!, encounterUrl, jobId, onInit)
  const scene = getActiveScene()
  if (!scene) return
  adapter = useStateAdapter(scene)
  scene.onRenderTick = (delta) => adapter!.writeFrame(delta)
})

onBeforeUnmount(() => {
  adapter?.dispose()
  disposeActiveScene()
})
```

## 13. 组件迁移映射

### 路由页（从 `MainMenu.tsx` 拆出 4 个 + `GameView.tsx` 转 1 个）

| 原文件 | 新位置 | 主要变化 |
|---|---|---|
| `MainMenu.tsx::MainMenu` | `pages/index.vue` | 首访 tutorial 重定向用 `router.replace`；tutorial-seen 用 `useLocalStorage` |
| `MainMenu.tsx::EncounterListPage` | `pages/encounters.vue` | `fetch` 改成 `useFetch('/encounters/index.json').json()`（@vueuse） |
| `MainMenu.tsx::JobPage` | `pages/job.vue` | 通过 `useJobStore()` 读写 |
| `MainMenu.tsx::AboutPage` | `pages/about.vue` | 纯静态 |
| `GameView.tsx` | `pages/encounter/[id].vue` | 编排：配 `useJobStore` → `startTimelineDemo` → `useStateAdapter` → 挂所有 HUD |

### 共享菜单组件
- `components/menu/MenuShell.vue`（标题 + crystal 背景）
- `components/menu/BackButton.vue`
- `components/menu/DifficultyBadge.vue`
- `components/menu/CompactSkillRow.vue`

### HUD 组件（直译为主）

| 原文件 | 新位置 | 变化点 |
|---|---|---|
| `HpBar.tsx` | `components/hud/HpBar.vue` | 读 `battleStore.playerHp/bossHp/playerMp` |
| `CastBar.tsx` | `components/hud/CastBar.vue` | 读 `battleStore.playerCast/bossCast` |
| `BuffBar.tsx` | `components/hud/BuffBar.vue` | 读 `battleStore.buffs` |
| `DpsMeter.tsx` | `components/hud/DpsMeter.vue` | 读 `battleStore.dpsMeter` |
| `CombatAnnounce.tsx` | `components/hud/CombatAnnounce.vue` | 读 `battleStore.announceText` |
| `DialogBox.tsx` | `components/hud/DialogBox.vue` | 读 `battleStore.dialogText` |
| `DebugInfo.tsx` | `components/hud/DebugInfo.vue` | 读 `debugStore.fps` + `battleStore.debugPlayerPos` |
| `BattleEndOverlay.tsx` | `components/hud/BattleEndOverlay.vue` | 读 `battleStore.battleResult`，重试按钮 emit |
| `PauseMenu.tsx` | `components/hud/PauseMenu.vue` | 读 `battleStore.paused`，按钮调 `scene.resume()` / `scene.endBattle()` |
| `SkillBar.tsx` | `components/hud/SkillBar.vue` | `onMouseEnter/Move/Leave` 调 `useTooltip().show/hide` |
| `Tooltip.tsx` | `components/hud/Tooltip.vue` | 读 `useTooltip().state`，`v-html` 渲染 |
| `SkillPanel.tsx` | `components/hud/SkillPanel.vue` | 读 `useSkillPanel().isOpen`；setup 内调 `useSkillPanelHotkey()` |
| `TimelineDisplay.tsx` | `components/hud/TimelineDisplay.vue` | 折叠状态用 `useLocalStorage('xiv-timeline-collapsed', false)` |
| `DamageFloater.tsx` | `components/hud/DamageFloater.vue` | 读 `battleStore.damageEvents`，动画完移除（通过 scene 侧或本地 `setTimeout`） |

### UI 对 scene 的方法调用

- `PauseMenu` 继续按钮 → `scene.resume()`
- `PauseMenu` 重试按钮 → emit `retry`（父组件 `encounter/[id].vue` 重新挂载战斗）
- `BattleEndOverlay` 返回主菜单 → `router.push('/')`
- `BattleEndOverlay` 重试 → 同上 emit
- `encounter/[id].vue` 跳过教程按钮 → `router.push('/')` + 写 localStorage

### `tooltip-builders.ts`
纯 TS 工具函数，移到 `components/hud/tooltip-builders.ts`，签名不变，由 `HudSkillBar` / `HudTooltip` / `MenuCompactSkillRow` 导入调用。

## 14. 样式策略

所有 Vue 组件一致采用：

- **布局/间距/颜色等静态样式** → **pug attributify**
  ```pug
  div(pos="absolute" flex="~ items-center gap-2" bg="black/80" border="1 white/40 rounded")
  ```
- **动态数值绑定** → `:style="{ height: cdPct + '%' }"`
- **动画 keyframes、复用 mixin、复杂选择器、`:deep()` 穿透** → `<style scoped lang="scss">`
- **不再出现 JSX 式 `style={{ ... }}` 对象字面量**

### pug + attributify UnoCSS 的已知约束
**pug 属性值如果包含 `[...]`（UnoCSS 任意值），必须加引号。**

```pug
// ✗ 错误（pug 会把 [50px] 当作属性名的一部分，解析失败）
div(top-[50px])

// ✓ 正确（引号包裹后 pug 视为普通字符串值，attributify 仍然生效）
div(top="[50px]")
div(pos="absolute" top="[50px]")

// ✓ 也可以退回到显式 class（混用场景方便）
div(pos="absolute" class="top-[50px]")
```

默认规则：**凡 attributify 值含 `[` `(` 或其它 pug 特殊字符，一律加引号。**

### 入口样式
- 原 `src/ui/global.css` 迁为 `src/styles/global.scss`
- 原先 `index.html` 内嵌的 `#loading-screen` / `#ui-overlay` 样式保持不变（不迁 Vue）
- `main.ts` 顶部 `import './styles/global.scss'`

## 15. 游戏侧改动

### `src/game/game-scene.ts`
- 删除 `import { paused, battleResult } from '@/ui/state'`
- 删除 `paused` 的 signal 同步逻辑（line 141、144）
- `watchPlayerDeath` 里 `battleResult.value = 'wipe'` → `this.battleResult = 'wipe'`（通过方法或直接赋值）
- 新增第 7 节列出的字段和方法

### `src/game/battle-runner.ts`
- 删除 `import { ... } from '@/ui/state'`（9 行）
- 所有 `announceText.value = x` → `scene.announceText = x`
- 所有 `dialogText.value = x` → `scene.dialogText = x`
- 所有 `timelineEntries.value = x` → `scene.timelineEntries = x`
- 所有 `currentPhaseInfo.value = x` → `scene.currentPhaseInfo = x`
- 所有 `damageLog.value = x` → `scene.damageLog = x`
- 原先写 `combatElapsedSignal.value = x` 的位置：`GameScene` 已有 `getCombatElapsed: (() => number | null)` 字段（一个可重置的 getter hook），battle-runner 继续按原样 `scene.getCombatElapsed = () => ...`，无需新增 setter；`use-state-adapter` 每帧调 `scene.getCombatElapsed()` 得到数值
- `battleResult.value = x` → `scene.battleResult = x` / `scene.endBattle(x)`
- `selectedJobId.value` → `startTimelineDemo` 参数传入（`jobOverride` 机制已存在，UI 层负责传值）
- `TimelineEntry` 类型从内部定义或 `@/timeline/types` 取

### `src/jobs/shared.ts`
- `SkillBarEntry` 类型定义从 `ui/state.ts` 迁过来
- 该文件成为类型的来源之处

### `src/devtools/commands.ts` / `dev-terminal.ts`
- 若有命令改变 battle 状态（如 pause 命令），通过全局 `getActiveScene()` 访问 scene 方法，不走 Pinia store
- 现阶段 grep 未发现跨层引用，风险低

## 16. `index.html`
- `<script type="module" src="/src/main.tsx">` → `<script type="module" src="/src/main.ts">`
- 其余内嵌 loading screen 样式 / `#app` 容器保持不变

## 17. 分支与提交策略

- 新建分支 `refactor/preact-to-vue`
- 一次性完整替换（big-bang），PR 合并时同时删除所有 `.tsx`
- 避免 Preact 与 Vue 两套插件共存导致的构建冲突
- CLAUDE.md 中"UI Layer"的描述（Preact + @preact/signals）在 PR 末期同步更新为 Vue 3 + Pinia

## 18. 验证清单

### 基础
- [ ] `pnpm install` 成功，无 peer-dep 警告
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm build` 成功
- [ ] `pnpm test:run` 全部 28 个核心层测试通过

### 分层清洁度
- [ ] `grep -rn "from ['\"]@/ui" src/` 在非 `src/pages/`、`src/components/`、`src/composables/`、`src/stores/`、`src/App.vue`、`src/main.ts` 中 0 命中
- [ ] `grep -rn "@preact\|preact-iso\|preact/hooks" src/` 0 命中
- [ ] `grep -rn "preact" package.json` 0 命中
- [ ] `src/ui/` 目录已删除
- [ ] `src/main.tsx` 已删除

### 功能烟雾测试（`pnpm dev` 手工过）
- [ ] `/` 主菜单：crystal 标题动画、3 个菜单按钮
- [ ] `/encounters`：副本列表加载、`DifficultyBadge` 渲染、选中后详情/练习/进入按钮工作
- [ ] `/job`：职业列表渲染、切换后 localStorage 保存
- [ ] `/about`：静态页面
- [ ] `/encounter/tutorial`：教程副本，跳过按钮可用
- [ ] `/encounter/training-dummy`：试玩 dummy 有效
- [ ] `/encounter/paladin-boss`（或其它完整副本）：
  - [ ] Boss/Player HP/MP 条实时更新
  - [ ] SkillBar 图标 + CD 进度 + MP/Buff 锁
  - [ ] Tooltip 鼠标悬浮跟随光标，HTML 渲染正确
  - [ ] BuffBar 挂载/倒计时/层数
  - [ ] DamageFloater 飘字
  - [ ] CastBar 起手条
  - [ ] TimelineDisplay 技能预告 + 折叠持久化
  - [ ] DpsMeter
  - [ ] Announce / Dialog 弹出
  - [ ] SkillPanel `P` 开关
  - [ ] PauseMenu `Esc` 暂停/恢复（调 `scene.togglePause()`）
  - [ ] BattleEndOverlay 胜利/失败 + 重试
  - [ ] DebugInfo（dev 模式）
- [ ] `?practice` 参数生效（无敌 buff 挂载）
- [ ] `~` 键打开 DevTerminal，基础命令可用

---

## 附录：迁移影响面速览

| 文件/目录 | 处理 |
|---|---|
| `src/ui/**` | **删除** |
| `src/main.tsx` | **删除**，新建 `src/main.ts` |
| `src/game/game-scene.ts` | 修改：去 `@/ui` import，扩展字段/方法 |
| `src/game/battle-runner.ts` | 修改：去 `@/ui` import，写入改走 `scene.*` |
| `src/jobs/shared.ts` | 修改：接收 `SkillBarEntry` 类型定义 |
| `src/devtools/**` | 基本不变（若有 pause 类命令改走 scene） |
| `src/input/`、`src/renderer/`、`src/core/` 等 | 不变 |
| `src/pages/ components/ stores/ composables/ styles/` | **新建** |
| `vite.config.ts` | 整体替换插件链 |
| `uno.config.ts` | 追加 `presetAttributify` |
| `tsconfig.app.json` | 确保 include 类型声明文件 |
| `package.json` | 依赖增删如第 4 节 |
| `index.html` | 改入口 script 引用 |
| CLAUDE.md | PR 末同步更新 UI Layer 段落 |
