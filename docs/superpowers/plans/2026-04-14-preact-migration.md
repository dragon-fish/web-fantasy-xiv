# Preact + preact-iso UI Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all vanilla DOM UI components to Preact with signals-based state bridging, preact-iso routing, and UnoCSS styling.

**Architecture:** Babylon.js Engine persists at the top level via Preact Context. preact-iso Router handles `/` (main menu) and `/encounter/:id` (game view). A signals state layer bridges game loop data to reactive Preact components. UnoCSS preset-wind4 for static styles, inline style for dynamic values.

**Tech Stack:** Preact, preact-iso, @preact/signals, @preact/preset-vite, UnoCSS (preset-wind4), Vite, TypeScript, Babylon.js

**Spec:** `docs/superpowers/specs/2026-04-14-preact-migration-design.md`

---

### Task 1: Install dependencies and configure build tooling

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `tsconfig.app.json`
- Create: `uno.config.ts`

- [ ] **Step 1: Install Preact ecosystem and UnoCSS**

```bash
pnpm add preact preact-iso @preact/signals
pnpm add -D @preact/preset-vite unocss @unocss/preset-wind4
```

- [ ] **Step 2: Create `uno.config.ts`**

```ts
import { defineConfig } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'

export default defineConfig({
  presets: [presetWind4()],
})
```

- [ ] **Step 3: Update `vite.config.ts`**

Replace the current content with:

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  base: './',
  plugins: [preact(), UnoCSS()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
```

- [ ] **Step 4: Update `tsconfig.json`**

Add JSX config to the base `compilerOptions`:

```jsonc
{
  "compilerOptions": {
    // ... existing options ...
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

- [ ] **Step 5: Verify build works**

```bash
pnpm run typecheck
pnpm run build
```

Expected: Both pass with no errors. The app still works exactly as before (no Preact code yet).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts tsconfig.json tsconfig.app.json uno.config.ts
git commit -m "build: add preact, preact-iso, signals, unocss dependencies and config"
```

---

### Task 2: Create Engine context and Preact app shell

**Files:**
- Create: `src/ui/engine-context.tsx`
- Create: `src/ui/App.tsx`
- Rename: `src/main.ts` → `src/main.tsx`
- Modify: `index.html`

This task creates the Preact mount point and the shared Babylon.js Engine context. The Engine and canvas are created once and persist across route changes.

- [ ] **Step 1: Create `src/ui/engine-context.tsx`**

This module creates a `<canvas>` element, instantiates the Babylon.js Engine, and provides both via Preact Context. It also handles window resize.

```tsx
import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import { Engine } from '@babylonjs/core'

interface EngineCtx {
  engine: Engine
  canvas: HTMLCanvasElement
}

const Ctx = createContext<EngineCtx | null>(null)

export function useEngine(): EngineCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEngine must be used within EngineProvider')
  return ctx
}

export function EngineProvider({ children }: { children: preact.ComponentChildren }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<EngineCtx | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;'
    container.prepend(canvas)

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true })
    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    setCtx({ engine, canvas })

    return () => {
      window.removeEventListener('resize', onResize)
      engine.dispose()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {ctx && <Ctx.Provider value={ctx}>{children}</Ctx.Provider>}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/ui/App.tsx`**

A minimal shell with EngineProvider wrapping a placeholder. No routing yet — just prove Preact mounts correctly alongside the engine.

```tsx
import { EngineProvider } from './engine-context'

export function App() {
  return (
    <EngineProvider>
      <GameShell />
    </EngineProvider>
  )
}

/** Temporary placeholder — will be replaced by Router in Task 3 */
function GameShell() {
  return (
    <div
      id="ui-overlay"
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', fontFamily: "'Segoe UI', sans-serif", color: '#fff',
      }}
    >
      {/* Route outlet will go here */}
    </div>
  )
}
```

- [ ] **Step 3: Rename `src/main.ts` to `src/main.tsx` and rewrite**

```tsx
import { render } from 'preact'
import 'virtual:uno.css'
import { App } from './ui/App'

render(<App />, document.getElementById('app')!)
```

- [ ] **Step 4: Update `index.html`**

Replace the body content:

```html
<body>
  <div id="app" style="width:100%;height:100%;"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

Keep the existing `<style>` block in `<head>` (global resets).

- [ ] **Step 5: Run dev server, verify canvas renders**

```bash
pnpm run dev
```

Open in browser. Expected: black canvas fills the screen, no errors in console. The old game UI is gone (expected — we'll re-add it via Preact components).

- [ ] **Step 6: Commit**

```bash
git add src/ui/engine-context.tsx src/ui/App.tsx src/main.tsx index.html
git rm src/main.ts
git commit -m "feat: preact app shell with EngineProvider context"
```

---

### Task 3: SceneManager accepts external Engine

**Files:**
- Modify: `src/renderer/scene-manager.ts`
- Modify: `src/game/game-scene.ts:29-39` (GameSceneConfig interface)

Currently `SceneManager` creates its own `Engine` in its constructor. Since the Engine now lives in EngineProvider, SceneManager must accept it externally.

- [ ] **Step 1: Modify `SceneManager` constructor to accept Engine**

In `src/renderer/scene-manager.ts`, change the constructor from:

```ts
constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true })
```

to:

```ts
constructor(engine: Engine) {
    this.engine = engine
```

Remove the `private canvas: HTMLCanvasElement` field. The canvas reference for `setupRollModifier` comes from `engine.getRenderingCanvas()`:

Change the field and `setupRollModifier` call:

```ts
private canvas: HTMLCanvasElement

constructor(engine: Engine) {
    this.engine = engine

    this.scene = new Scene(this.engine)
    this.scene.clearColor.set(0.12, 0.12, 0.14, 1)

    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      (28 * Math.PI) / 180,
      40,
      Vector3.Zero(),
      this.scene,
    )
    const canvas = engine.getRenderingCanvas()!
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene)
    ambient.intensity = 0.5

    const sun = new DirectionalLight('sun', new Vector3(-1, -2, -1).normalize(), this.scene)
    sun.intensity = 0.6

    this.canvas = canvas
    this.setupRollModifier()
  }
```

- [ ] **Step 2: Update `dispose()` in SceneManager**

Change `dispose()` to only dispose the Scene, not the Engine (Engine is now owned by EngineProvider):

```ts
dispose(): void {
    this.scene.dispose()
  }
```

- [ ] **Step 3: Update `GameSceneConfig` to accept Engine instead of canvas**

In `src/game/game-scene.ts`, change the config interface:

```ts
export interface GameSceneConfig {
  engine: Engine
  canvas: HTMLCanvasElement
  uiRoot: HTMLDivElement
  arena: ArenaDef
  // ... rest unchanged
}
```

And update the constructor where SceneManager is created (line ~105):

From:
```ts
this.sceneManager = new SceneManager(config.canvas)
```
To:
```ts
this.sceneManager = new SceneManager(config.engine)
```

And where InputManager is created (line ~112):

```ts
this.input = new InputManager(config.canvas)
```

This stays the same — `config.canvas` is still passed for input binding.

- [ ] **Step 4: Update `GameScene.dispose()`**

Remove `window.removeEventListener('resize', this.onResizeHandler)` and the `onResizeHandler` field — resize is now handled by EngineProvider. Also remove the `uiRoot` child cleanup (Preact owns the DOM now):

```ts
dispose(): void {
    this.sceneManager.dispose()
    this.input.dispose()
  }
```

Remove the `onResizeHandler` field and its assignment in the constructor (line ~151-152):

```ts
// DELETE these lines:
this.onResizeHandler = () => this.sceneManager.engine.resize()
window.addEventListener('resize', this.onResizeHandler)
```

And remove the field declaration:

```ts
// DELETE:
private onResizeHandler: () => void
```

- [ ] **Step 5: Update `demo-timeline.ts` call site**

In `src/demo/demo-timeline.ts:46`, update the `GameScene` constructor call. For now, temporarily create a local Engine to keep things working until Task 4 connects it to EngineProvider:

Actually — we'll keep passing `canvas` and create Engine from it in `demo-timeline.ts` temporarily. The full connection happens in Task 4. So change the config to include `engine`:

In `startTimelineDemo`, the `scene = new GameScene({...})` call at line 46 needs updating. But since we don't have the EngineProvider wired yet, defer this to Task 4.

For now, verify typecheck passes with the interface change by temporarily adding `engine` to the call site:

```ts
import { Engine } from '@babylonjs/core'

// At top of initScene function:
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true })

scene = new GameScene({
    engine,
    canvas, uiRoot, arena: enc.arena,
    // ... rest unchanged
})
```

Note: This creates a second Engine temporarily. Task 4 will clean this up by wiring through EngineProvider.

- [ ] **Step 6: Verify**

```bash
pnpm run typecheck
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/scene-manager.ts src/game/game-scene.ts src/demo/demo-timeline.ts
git commit -m "refactor: SceneManager accepts external Engine instance"
```

---

### Task 4: Routing shell with MainMenu and GameView

**Files:**
- Create: `src/ui/components/MainMenu.tsx`
- Create: `src/ui/components/GameView.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/demo/demo-timeline.ts`

This task adds preact-iso routing. MainMenu fetches encounter list and navigates to `/encounter/:id`. GameView creates/disposes GameScene using the Engine from context. The old UI components still render via vanilla DOM inside GameScene (coexistence phase).

- [ ] **Step 1: Create `src/ui/components/MainMenu.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'

interface EncounterEntry {
  label: string
  description: string
  file: string
}

export function MainMenu() {
  const [levels, setLevels] = useState<EncounterEntry[]>([])
  const base = import.meta.env.BASE_URL

  useEffect(() => {
    fetch(`${base}encounters/index.json`)
      .then((r) => r.json())
      .then(setLevels)
  }, [])

  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center z-100"
      style={{ background: 'rgba(0, 0, 0, 0.85)', pointerEvents: 'auto' }}
    >
      <h1 class="text-4xl text-gray-200 mb-2 font-light tracking-widest">Web Fantasy XIV</h1>
      <p class="text-sm text-gray-500 mb-10 tracking-wide">Boss Battle Simulator</p>
      {levels.map((lv) => {
        const id = lv.file.replace(/\.yaml$/, '')
        return (
          <a
            key={id}
            href={`/encounter/${id}`}
            class="block min-w-60 px-8 py-3 my-1 text-sm text-gray-400 tracking-wide text-left rounded border border-white/20 transition-all duration-150 hover:bg-white/20 hover:text-white"
            style={{ background: 'rgba(255, 255, 255, 0.1)', pointerEvents: 'auto' }}
          >
            <div>{'\u25B6  '}{lv.label}</div>
            {lv.description && (
              <div class="text-xs text-gray-500 mt-0.5">{lv.description}</div>
            )}
          </a>
        )
      })}
    </div>
  )
}
```

Note: preact-iso intercepts `<a>` clicks for client-side routing automatically.

- [ ] **Step 2: Create `src/ui/components/GameView.tsx`**

This component mounts a GameScene using the shared Engine. It still uses the old vanilla DOM UI (via GameScene's UIManager) during this coexistence phase.

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { useRoute, useLocation } from 'preact-iso'
import { useEngine } from '../engine-context'
import { startTimelineDemo } from '@/demo/demo-timeline'

export function GameView() {
  const { params } = useRoute()
  const { engine, canvas } = useEngine()
  const uiRef = useRef<HTMLDivElement>(null)
  const { route } = useLocation()

  useEffect(() => {
    const uiRoot = uiRef.current!
    const id = params.id
    const base = import.meta.env.BASE_URL
    const encounterUrl = `${base}encounters/${id}.yaml`

    startTimelineDemo(canvas, uiRoot, encounterUrl)

    return () => {
      // GameScene disposes itself via the module-level `scene` variable on next startTimelineDemo call.
      // For route unmount, we need to clean up the uiRoot children.
      while (uiRoot.firstChild) uiRoot.removeChild(uiRoot.firstChild)
    }
  }, [params.id])

  return (
    <div
      ref={uiRef}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  )
}
```

- [ ] **Step 3: Update `src/demo/demo-timeline.ts` to accept Engine**

Change the `startTimelineDemo` signature and remove the local Engine creation from Task 3's temporary fix. Since GameView passes the canvas (which has the engine), we need to wire this properly.

Update the `initScene` function to get Engine from the canvas:

```ts
function initScene(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement, enc: EncounterData, encounterUrl: string): void {
  const engine = Engine.Instances.find(e => e.getRenderingCanvas() === canvas)
  if (!engine) throw new Error('No Engine found for canvas')

  scene = new GameScene({
    engine,
    canvas, uiRoot, arena: enc.arena,
    skillBarEntries: DEMO_SKILL_BAR,
    playerInputConfig: {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
    buffDefs: DEMO_BUFF_MAP,
    restart: () => startTimelineDemo(canvas, uiRoot, encounterUrl),
  })
  // ... rest unchanged
```

Remove the temporary `new Engine(...)` added in Task 3 Step 5.

Add the import at the top of demo-timeline.ts:

```ts
import { Engine } from '@babylonjs/core'
```

- [ ] **Step 4: Update `src/ui/App.tsx` with Router**

```tsx
import { LocationProvider, Router, Route } from 'preact-iso'
import { EngineProvider } from './engine-context'
import { MainMenu } from './components/MainMenu'
import { GameView } from './components/GameView'

export function App() {
  return (
    <LocationProvider>
      <EngineProvider>
        <div
          id="ui-overlay"
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: 'none', fontFamily: "'Segoe UI', sans-serif", color: '#fff',
          }}
        >
          <Router>
            <Route path="/" component={MainMenu} />
            <Route path="/encounter/:id" component={GameView} />
          </Router>
        </div>
      </EngineProvider>
    </LocationProvider>
  )
}
```

- [ ] **Step 5: Update PauseMenu quit handler in `game-scene.ts`**

The old `window.location.reload()` needs to become a `history.pushState` or similar. For now, use `window.location.href = '/'` which preact-iso will handle:

In `src/game/game-scene.ts`, change line ~128:

From:
```ts
this.pauseMenu.onQuitGame(() => window.location.reload())
```
To:
```ts
this.pauseMenu.onQuitGame(() => { window.history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) })
```

This triggers preact-iso's router to navigate to `/`, which unmounts GameView and shows MainMenu.

- [ ] **Step 6: Remove old `src/main.ts` if not already done**

Verify `src/main.ts` is deleted and only `src/main.tsx` exists.

- [ ] **Step 7: Test in browser**

```bash
pnpm run dev
```

Expected behavior:
- `/` shows MainMenu with encounter buttons
- Clicking an encounter navigates to `/encounter/<id>` and starts the game
- Pause → "Quit to Menu" navigates back to `/`
- Browser back button returns to main menu

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/MainMenu.tsx src/ui/components/GameView.tsx src/ui/App.tsx src/demo/demo-timeline.ts src/game/game-scene.ts
git commit -m "feat: preact-iso routing with MainMenu and GameView"
```

---

### Task 5: Signals state layer and adapter

**Files:**
- Create: `src/ui/state.ts`
- Create: `src/ui/state-adapter.ts`

This task creates the signals that bridge game state to UI components, and the adapter that writes to them from GameScene's update loop and EventBus.

- [ ] **Step 1: Create `src/ui/state.ts`**

```ts
import { signal } from '@preact/signals'
import type { SkillDef, BuffDef } from '@/core/types'
import type { BuffInstance } from '@/entity/entity'

export interface HpState {
  current: number
  max: number
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
}

export interface BuffSnapshot {
  defId: string
  name: string
  type: 'buff' | 'debuff'
  stacks: number
  remaining: number
  effects: BuffDef['effects']
}

export interface SkillBarEntry {
  key: string
  skill: SkillDef
}

export interface DamageLogEntry {
  time: number
  sourceName: string
  skillName: string
  amount: number
  hpAfter: number
  mitigation: number
}

// Per-frame continuous state
export const playerHp = signal<HpState>({ current: 0, max: 0 })
export const playerMp = signal<HpState>({ current: 0, max: 0 })
export const bossHp = signal<HpState>({ current: 0, max: 0 })
export const gcdState = signal({ remaining: 0, total: 0 })
export const playerCast = signal<CastInfo | null>(null)
export const bossCast = signal<CastInfo | null>(null)
export const buffs = signal<BuffSnapshot[]>([])
export const cooldowns = signal<Map<string, number>>(new Map())

// Discrete event state
export const damageEvents = signal<DamageEvent[]>([])
export const announceText = signal<string | null>(null)

// UI control
export const paused = signal(false)
export const battleResult = signal<'victory' | 'wipe' | null>(null)
export const damageLog = signal<DamageLogEntry[]>([])
export const combatElapsed = signal<number | null>(null)

// Scene-lifetime config (set once per encounter)
export const skillBarEntries = signal<SkillBarEntry[]>([])
export const buffDefs = signal<Map<string, BuffDef>>(new Map())

// Debug
export const debugFps = signal(0)
export const debugPlayerPos = signal({ x: 0, y: 0 })

/** Reset all signals to default state (call on scene dispose) */
export function resetState(): void {
  playerHp.value = { current: 0, max: 0 }
  playerMp.value = { current: 0, max: 0 }
  bossHp.value = { current: 0, max: 0 }
  gcdState.value = { remaining: 0, total: 0 }
  playerCast.value = null
  bossCast.value = null
  buffs.value = []
  cooldowns.value = new Map()
  damageEvents.value = []
  announceText.value = null
  paused.value = false
  battleResult.value = null
  damageLog.value = []
  combatElapsed.value = null
  skillBarEntries.value = []
  buffDefs.value = new Map()
  debugFps.value = 0
  debugPlayerPos.value = { x: 0, y: 0 }
}
```

- [ ] **Step 2: Create `src/ui/state-adapter.ts`**

This adapter replaces UIManager. It subscribes to EventBus events and provides a `writeFrame()` function called from the render loop.

```ts
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SceneManager } from '@/renderer/scene-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import { GCD_DURATION } from '@/skill/skill-resolver'
import * as state from './state'

let dmgIdCounter = 0

export interface StateAdapterDeps {
  bus: EventBus
  sceneManager: SceneManager
  skillResolver: SkillResolver
  buffSystem: BuffSystem
}

export function createStateAdapter(deps: StateAdapterDeps) {
  const { bus, sceneManager, buffSystem } = deps

  // Damage floater events
  const onDamage = (payload: { target: Entity; amount: number }) => {
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2

    const projected = sceneManager.worldToScreen(
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

    state.damageEvents.value = [
      ...state.damageEvents.value,
      { id: ++dmgIdCounter, screenX: sx, screenY: sy, amount: Math.abs(payload.amount), isHeal },
    ]
  }

  // Cast bar events
  const onCastStart = (payload: { caster: Entity; skill: { name: string } }) => {
    const name = payload.skill?.name ?? 'Casting...'
    if (payload.caster.type === 'player') {
      state.playerCast.value = { name, elapsed: 0, total: 0 }
    } else {
      state.bossCast.value = { name, elapsed: 0, total: 0 }
    }
  }

  const onCastComplete = (payload: { caster: Entity }) => {
    if (payload.caster.type === 'player') state.playerCast.value = null
    else state.bossCast.value = null
  }

  const onCastInterrupted = (payload: { caster: Entity }) => {
    if (payload.caster?.type === 'player') state.playerCast.value = null
    else state.bossCast.value = null
  }

  bus.on('damage:dealt', onDamage)
  bus.on('skill:cast_start', onCastStart)
  bus.on('skill:cast_complete', onCastComplete)
  bus.on('skill:cast_interrupted', onCastInterrupted)

  /** Call each render frame — replaces UIManager.update() */
  function writeFrame(player: Entity, boss: Entity, getCooldown: (skillId: string) => number): void {
    state.playerHp.value = { current: player.hp, max: player.maxHp }
    if (player.maxMp > 0) state.playerMp.value = { current: player.mp, max: player.maxMp }
    state.bossHp.value = { current: boss.hp, max: boss.maxHp }
    state.gcdState.value = { remaining: player.gcdTimer, total: GCD_DURATION }

    if (player.casting) {
      state.playerCast.value = { name: state.playerCast.value?.name ?? '', elapsed: player.casting.elapsed, total: player.casting.castTime }
    }
    if (boss.casting) {
      state.bossCast.value = { name: state.bossCast.value?.name ?? '', elapsed: boss.casting.elapsed, total: boss.casting.castTime }
    } else {
      state.bossCast.value = null
    }

    // Buffs snapshot
    state.buffs.value = player.buffs.map((inst) => {
      const def = buffSystem.getDef(inst.defId)
      return {
        defId: inst.defId,
        name: def?.name ?? inst.defId,
        type: (def?.type ?? 'buff') as 'buff' | 'debuff',
        stacks: inst.stacks,
        remaining: inst.remaining,
        effects: def?.effects ?? [],
      }
    })

    // Debug
    state.debugPlayerPos.value = { x: player.position.x, y: player.position.y }
  }

  function dispose(): void {
    bus.off('damage:dealt', onDamage)
    bus.off('skill:cast_start', onCastStart)
    bus.off('skill:cast_complete', onCastComplete)
    bus.off('skill:cast_interrupted', onCastInterrupted)
    state.resetState()
  }

  return { writeFrame, dispose }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm run typecheck
```

Expected: passes. No runtime changes yet — the adapter isn't wired in.

- [ ] **Step 4: Commit**

```bash
git add src/ui/state.ts src/ui/state-adapter.ts
git commit -m "feat: signals state layer and EventBus-to-signals adapter"
```

---

### Task 6: Migrate HpBar, CastBar, and SkillBar components

**Files:**
- Create: `src/ui/components/HpBar.tsx`
- Create: `src/ui/components/CastBar.tsx`
- Create: `src/ui/components/SkillBar.tsx`
- Create: `src/ui/components/Tooltip.tsx`

These are the core HUD components. They read from signals and render via Preact.

- [ ] **Step 1: Create `src/ui/components/HpBar.tsx`**

```tsx
import type { ReadonlySignal } from '@preact/signals'
import type { HpState } from '../state'

interface HpBarProps {
  state: ReadonlySignal<HpState>
  color: string
  position: 'top' | 'bottom' | 'bottom2'
}

const POS_STYLES: Record<string, string> = {
  top: 'top:20px',
  bottom: 'bottom:80px',
  bottom2: 'bottom:108px',
}

export function HpBar({ state, color, position }: HpBarProps) {
  const { current, max } = state.value
  const pct = max > 0 ? (current / max) * 100 : 0
  const height = position === 'bottom2' ? '16px' : '24px'

  return (
    <div
      class="absolute left-1/2 -translate-x-1/2 w-75 rounded-sm overflow-hidden border border-white/30"
      style={{ [position === 'top' ? 'top' : 'bottom']: position === 'top' ? '20px' : position === 'bottom2' ? '108px' : '80px', height, background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        class="h-full transition-[width] duration-100"
        style={{ width: `${pct}%`, background: color }}
      />
      <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs z-1" style={{ textShadow: '1px 1px 2px #000' }}>
        {Math.floor(current)} / {max}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/ui/components/CastBar.tsx`**

```tsx
import type { ReadonlySignal } from '@preact/signals'
import type { CastInfo } from '../state'

interface CastBarProps {
  state: ReadonlySignal<CastInfo | null>
  positionStyle: string
  color: string
}

export function CastBar({ state, positionStyle, color }: CastBarProps) {
  const info = state.value
  if (!info) return null

  const pct = info.total > 0 ? Math.min(100, (info.elapsed / info.total) * 100) : 0

  return (
    <div
      class="absolute left-1/2 -translate-x-1/2 w-62.5 h-4.5 rounded-sm overflow-hidden border border-white/30"
      style={{ [positionStyle.includes('top') ? 'top' : 'bottom']: positionStyle.replace(/[^0-9]/g, '') + 'px', background: 'rgba(0,0,0,0.7)' }}
    >
      <div
        class="h-full transition-[width] duration-50"
        style={{ width: `${pct}%`, background: color }}
      />
      <span
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs"
        style={{ textShadow: '1px 1px 2px #000' }}
      >
        {info.name}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Create `src/ui/components/Tooltip.tsx`**

The tooltip content builder functions (`buildSkillTooltip`, `buildBuffTooltip`) stay as-is in a separate utility — they return HTML strings. The Tooltip component positions and shows them.

```tsx
import { signal } from '@preact/signals'

interface TooltipState {
  html: string
  x: number
  y: number
}

export const tooltipState = signal<TooltipState | null>(null)

export function showTooltip(html: string, x: number, y: number) {
  tooltipState.value = { html, x, y }
}

export function hideTooltip() {
  tooltipState.value = null
}

export function Tooltip() {
  const s = tooltipState.value
  if (!s) return null

  return (
    <div
      class="fixed z-200 rounded border border-white/15 px-3 py-2 text-xs leading-relaxed pointer-events-none max-w-65"
      style={{
        display: 'block',
        background: 'rgba(10, 10, 15, 0.95)',
        color: '#ccc',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        left: `${s.x}px`,
        top: `${s.y - 40}px`,
      }}
      dangerouslySetInnerHTML={{ __html: s.html }}
    />
  )
}
```

- [ ] **Step 4: Create `src/ui/components/SkillBar.tsx`**

```tsx
import { skillBarEntries, gcdState, cooldowns, buffDefs as buffDefsSignal } from '../state'
import { showTooltip, hideTooltip } from './Tooltip'
import { buildSkillTooltip } from '../tooltip-builders'

export function SkillBar() {
  const entries = skillBarEntries.value
  const gcd = gcdState.value
  const cdMap = cooldowns.value
  const bDefs = buffDefsSignal.value

  if (entries.length === 0) return null

  return (
    <div class="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5">
      {entries.map((entry, i) => {
        const skill = entry.skill
        let overlayHeight = '0%'
        let cdText: string | null = null

        if (!skill.gcd && skill.cooldown > 0) {
          const cd = cdMap.get(skill.id) ?? 0
          if (cd > 0) {
            overlayHeight = `${(cd / skill.cooldown) * 100}%`
            cdText = (cd / 1000).toFixed(1)
          }
        } else if (skill.gcd && gcd.remaining > 0) {
          overlayHeight = `${(gcd.remaining / gcd.total) * 100}%`
          cdText = (gcd.remaining / 1000).toFixed(1)
        }

        return (
          <div
            key={skill.id}
            class="relative w-12 h-12 rounded border-2 border-white/40 flex items-center justify-center text-xs"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            onMouseEnter={(e) => showTooltip(buildSkillTooltip(skill as any, bDefs), e.clientX, e.clientY)}
            onMouseMove={(e) => showTooltip(buildSkillTooltip(skill as any, bDefs), e.clientX, e.clientY)}
            onMouseLeave={hideTooltip}
          >
            <span class="absolute top-0.5 left-1 text-2.5 text-white/50">{entry.key}</span>
            <span class="text-2.5 text-center">{skill.name.slice(0, 3)}</span>
            <div
              class="absolute bottom-0 left-0 w-full transition-[height] duration-50"
              style={{ height: overlayHeight, background: 'rgba(0,0,0,0.7)' }}
            />
            {cdText && (
              <span
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-bold z-1"
                style={{ textShadow: '1px 1px 2px #000' }}
              >
                {cdText}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Extract tooltip builder functions**

Move `buildSkillTooltip`, `buildBuffTooltip`, and helper functions from `src/ui/tooltip.ts` to a new file `src/ui/tooltip-builders.ts`. The old `Tooltip` class will be deleted later, but the builder functions are pure and reusable:

Create `src/ui/tooltip-builders.ts` — copy lines 43-188 from the current `src/ui/tooltip.ts` (everything after the `Tooltip` class: the type maps, `buildSkillTooltip`, `buildBuffTooltip`, and all `format*` helpers). No modifications to the logic.

- [ ] **Step 6: Verify typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/HpBar.tsx src/ui/components/CastBar.tsx src/ui/components/SkillBar.tsx src/ui/components/Tooltip.tsx src/ui/tooltip-builders.ts
git commit -m "feat: preact HpBar, CastBar, SkillBar, Tooltip components"
```

---

### Task 7: Migrate BuffBar, DamageFloater, CombatAnnounce

**Files:**
- Create: `src/ui/components/BuffBar.tsx`
- Create: `src/ui/components/DamageFloater.tsx`
- Create: `src/ui/components/CombatAnnounce.tsx`

- [ ] **Step 1: Create `src/ui/components/BuffBar.tsx`**

```tsx
import { buffs } from '../state'
import { showTooltip, hideTooltip } from './Tooltip'
import { buildBuffTooltip } from '../tooltip-builders'

export function BuffBar() {
  const buffList = buffs.value
  if (buffList.length === 0) return null

  return (
    <div class="absolute bottom-27.5 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
      {buffList.map((b) => {
        const isDebuff = b.type === 'debuff'
        return (
          <div
            key={b.defId}
            class="relative w-7 h-7 rounded-sm flex flex-col items-center justify-center text-2.5 pointer-events-auto cursor-default"
            style={{
              background: 'rgba(0,0,0,0.7)',
              border: `1px solid ${isDebuff ? 'rgba(255,80,80,0.4)' : 'rgba(80,255,80,0.4)'}`,
            }}
            onMouseEnter={(e) => showTooltip(buildBuffTooltip({
              name: b.name, type: b.type, stacks: b.stacks, remaining: b.remaining, effects: b.effects as any,
            }), e.clientX, e.clientY)}
            onMouseMove={(e) => showTooltip(buildBuffTooltip({
              name: b.name, type: b.type, stacks: b.stacks, remaining: b.remaining, effects: b.effects as any,
            }), e.clientX, e.clientY)}
            onMouseLeave={hideTooltip}
          >
            <span class="text-xs leading-none" style={{ color: isDebuff ? '#ff6666' : '#66ff66' }}>
              {isDebuff ? '\u25BC' : '\u25B2'}
            </span>
            <span class="text-2 text-gray-400 leading-none">
              {b.remaining > 0 ? (b.remaining / 1000).toFixed(0) : '\u221E'}
            </span>
            {b.stacks > 1 && (
              <span
                class="absolute -bottom-0.5 -right-0.5 text-2 font-bold rounded-sm px-0.5 leading-tight"
                style={{ background: 'rgba(0,0,0,0.8)' }}
              >
                {b.stacks}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/ui/components/DamageFloater.tsx`**

```tsx
import { useEffect } from 'preact/hooks'
import { damageEvents } from '../state'

export function DamageFloater() {
  const events = damageEvents.value

  // Auto-remove events after 1s
  useEffect(() => {
    if (events.length === 0) return
    const timer = setTimeout(() => {
      const now = damageEvents.value
      // Remove the oldest batch (those that were present when this effect ran)
      const ids = new Set(events.map((e) => e.id))
      damageEvents.value = now.filter((e) => !ids.has(e.id))
    }, 1000)
    return () => clearTimeout(timer)
  }, [events.length])

  return (
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      {events.map((ev) => (
        <div
          key={ev.id}
          class="absolute text-lg font-bold pointer-events-none animate-float-up"
          style={{
            left: `${ev.screenX}px`,
            top: `${ev.screenY}px`,
            color: ev.isHeal ? '#4eff4e' : '#ff4444',
            textShadow: '1px 1px 3px #000',
          }}
        >
          {ev.isHeal ? '+' : ''}{ev.amount}
        </div>
      ))}
    </div>
  )
}
```

Note: The `animate-float-up` class needs a CSS keyframe. Add to `src/ui/global.css` (created in this step):

Create `src/ui/global.css`:

```css
@keyframes float-up {
  0% { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-60px) scale(0.8); }
}
.animate-float-up {
  animation: float-up 1s ease-out forwards;
}
```

Import it in `src/main.tsx`:

```tsx
import './ui/global.css'
```

- [ ] **Step 3: Create `src/ui/components/CombatAnnounce.tsx`**

```tsx
import { useEffect } from 'preact/hooks'
import { announceText } from '../state'

export function CombatAnnounce() {
  const text = announceText.value

  useEffect(() => {
    if (!text) return
    const timer = setTimeout(() => {
      announceText.value = null
    }, 2000)
    return () => clearTimeout(timer)
  }, [text])

  if (!text) return null

  return (
    <div class="absolute top-1/5 left-1/2 -translate-x-1/2 pointer-events-none z-60">
      <div
        class="text-3xl font-light tracking-widest"
        style={{ color: '#e0e0e0', textShadow: '0 0 12px rgba(0,0,0,0.8)' }}
      >
        {text}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/BuffBar.tsx src/ui/components/DamageFloater.tsx src/ui/components/CombatAnnounce.tsx src/ui/global.css src/main.tsx
git commit -m "feat: preact BuffBar, DamageFloater, CombatAnnounce components"
```

---

### Task 8: Migrate PauseMenu, BattleEndOverlay, DebugInfo

**Files:**
- Create: `src/ui/components/PauseMenu.tsx`
- Create: `src/ui/components/BattleEndOverlay.tsx`
- Create: `src/ui/components/DebugInfo.tsx`

- [ ] **Step 1: Create `src/ui/components/PauseMenu.tsx`**

```tsx
import { useLocation } from 'preact-iso'
import { paused } from '../state'

interface PauseMenuProps {
  onResume: () => void
  onRetry: () => void
}

export function PauseMenu({ onResume, onRetry }: PauseMenuProps) {
  const { route } = useLocation()

  if (!paused.value) return null

  const btnClass = 'min-w-40 px-7 py-2.5 text-sm my-1.5 rounded-sm tracking-wide cursor-pointer border border-white/15'

  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center z-90"
      style={{ background: 'rgba(0, 0, 0, 0.6)', pointerEvents: 'auto' }}
    >
      <h2 class="text-3xl font-light tracking-widest text-gray-300 mb-8">PAUSED</h2>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.08)', color: '#bbb' }} onClick={onResume}>
        Resume
      </button>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.08)', color: '#bbb' }} onClick={onRetry}>
        Retry
      </button>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.08)', color: '#bbb' }} onClick={() => route('/')}>
        Quit to Menu
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/ui/components/BattleEndOverlay.tsx`**

```tsx
import { battleResult, damageLog, combatElapsed } from '../state'

interface BattleEndOverlayProps {
  onRetry: () => void
}

export function BattleEndOverlay({ onRetry }: BattleEndOverlayProps) {
  const result = battleResult.value
  if (!result) return null

  const isWipe = result === 'wipe'
  const log = damageLog.value
  const elapsed = combatElapsed.value ?? 0

  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center z-80 cursor-pointer"
      style={{ background: 'rgba(0,0,0,0.7)', pointerEvents: 'auto' }}
      onClick={onRetry}
    >
      <h2
        class="text-3xl font-light tracking-widest mb-4"
        style={{ color: isWipe ? '#ff4444' : '#44ff44' }}
      >
        {isWipe ? 'DEFEATED' : 'VICTORY'}
      </h2>

      {isWipe ? (
        <DeathRecap entries={log.slice(-5)} />
      ) : (
        <p class="text-lg text-gray-400 mb-4 tracking-wide">
          {'\u901A\u5173\u7528\u65F6 '}{formatClearTime(elapsed)}
        </p>
      )}

      <p class="text-sm text-gray-600">Click to retry</p>
    </div>
  )
}

function DeathRecap({ entries }: { entries: typeof damageLog.value }) {
  if (entries.length === 0) return null
  return (
    <div
      class="font-mono text-xs leading-loose mb-4 rounded px-4 py-2.5 max-w-125 text-left"
      style={{ color: '#aaa', background: 'rgba(0,0,0,0.4)' }}
    >
      {entries.map((d, i) => {
        const isLast = i === entries.length - 1
        const timeStr = formatTime(d.time)
        return (
          <div key={i}>
            <span style={{ color: '#666' }}>{timeStr}</span>
            {' ['}
            <span style={{ color: '#ff8888' }}>{d.sourceName}</span>
            {'] '}
            {d.skillName}{' '}
            <span style={{ color: '#ff6666' }}>{d.amount}</span>
            {' (HP:'}{Math.max(0, d.hpAfter)}
            {d.mitigation > 0 && (
              <span style={{ color: '#88ccff' }}>{' \u51CF\u4F24'}{(d.mitigation * 100).toFixed(0)}%</span>
            )}
            {')'}
            {isLast && <span style={{ color: '#ff4444', fontWeight: 'bold' }}>{' \u3010\u81F4\u547D\u3011'}</span>}
          </div>
        )
      })}
    </div>
  )
}

function formatTime(ms: number): string {
  const sec = ms / 1000
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function formatClearTime(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const frac = (ms % 1000).toString().padStart(3, '0')
  return `${m}'${s.toString().padStart(2, '0')}.${frac}''`
}
```

- [ ] **Step 3: Create `src/ui/components/DebugInfo.tsx`**

```tsx
import { useRef } from 'preact/hooks'
import { debugFps, debugPlayerPos, combatElapsed } from '../state'

export function DebugInfo({ deltaMs }: { deltaMs: number }) {
  const fpsRef = useRef({ frameCount: 0, accum: 0, current: 0 })
  const f = fpsRef.current
  f.frameCount++
  f.accum += deltaMs
  if (f.accum >= 500) {
    f.current = Math.round((f.frameCount / f.accum) * 1000)
    f.frameCount = 0
    f.accum = 0
    debugFps.value = f.current
  }

  const pos = debugPlayerPos.value
  const elapsed = combatElapsed.value

  let timeStr = '--:--'
  if (elapsed !== null) {
    const sec = elapsed / 1000
    const m = Math.floor(sec / 60)
    const s = (sec % 60).toFixed(1).padStart(4, '0')
    timeStr = `${m}:${s}`
  }

  return (
    <div
      class="absolute top-3 right-3 rounded px-2.5 py-1.5 text-xs font-mono leading-relaxed pointer-events-none min-w-40"
      style={{ background: 'rgba(0,0,0,0.5)', color: '#999' }}
    >
      <div><span style={{ color: '#666' }}>FPS </span>{debugFps.value}</div>
      <div><span style={{ color: '#666' }}>POS </span>{pos.x.toFixed(1)}, {pos.y.toFixed(1)}</div>
      <div><span style={{ color: '#666' }}>TIME </span><span style={{ color: elapsed !== null ? '#999' : '#666' }}>{timeStr}</span></div>
    </div>
  )
}
```

Note: `DebugInfo` currently takes `deltaMs` as a prop because it computes FPS internally. The actual signal write for `debugFps` happens here to keep the FPS smoothing logic co-located. In a later cleanup, if this feels awkward, it can be moved to the adapter.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/PauseMenu.tsx src/ui/components/BattleEndOverlay.tsx src/ui/components/DebugInfo.tsx
git commit -m "feat: preact PauseMenu, BattleEndOverlay, DebugInfo components"
```

---

### Task 9: Wire everything together in GameView

**Files:**
- Modify: `src/ui/components/GameView.tsx`
- Modify: `src/game/game-scene.ts`
- Modify: `src/demo/demo-timeline.ts`

This is the integration task. GameView renders all Preact HUD components. GameScene stops creating vanilla UI. The state adapter bridges game data to signals.

- [ ] **Step 1: Strip UI construction from GameScene**

In `src/game/game-scene.ts`:

1. Remove imports: `UIManager`, `PauseMenu`, `DebugInfo`, `CombatAnnounce` from the import section.
2. Remove `uiRoot` from `GameSceneConfig` interface.
3. Remove the UI fields:

```ts
// DELETE these fields:
readonly uiManager: UIManager
readonly pauseMenu: PauseMenu
readonly devTerminal: DevTerminal
readonly debugInfo: DebugInfo
readonly announce: CombatAnnounce
```

Keep `devTerminal` for now (it has keyboard integration that's harder to migrate). Actually, also keep it as-is — it's a developer tool and low priority.

4. Remove UI construction from constructor (lines ~116-128):

```ts
// DELETE:
this.uiManager = new UIManager(config.uiRoot, this.bus, config.skillBarEntries, config.buffDefs)
this.uiManager.bindScene(this.sceneManager)
this.uiManager.bindBuffSystem(this.buffSystem)
this.pauseMenu = new PauseMenu(config.uiRoot)
this.devTerminal = new DevTerminal(this.bus, new CommandRegistry())
this.devTerminal.mount(config.uiRoot)
this.debugInfo = new DebugInfo(config.uiRoot)
this.announce = new CombatAnnounce(config.uiRoot)
```

```ts
// DELETE pause menu callbacks:
this.pauseMenu.onResumeGame(() => { this.paused = false; this.pauseMenu.hide() })
this.pauseMenu.onRetryGame(() => config.restart())
this.pauseMenu.onQuitGame(() => window.location.reload())
```

5. In the render loop (`start()` method), remove the `uiManager.update()` and `debugInfo.update()` calls:

```ts
// DELETE from render loop:
this.uiManager.update(this.player, bossForUI, (sid) => this.skillResolver.getCooldown(this.player.id, sid))
this.debugInfo.update(delta, this.player, this.getCombatElapsed())
```

6. Remove `onBattleEnd()` method entirely — this will be handled by signals + BattleEndOverlay component.

7. Keep `watchPlayerDeath()` but change it to emit an event instead of calling `onBattleEnd`:

```ts
watchPlayerDeath(): void {
    this.bus.on('damage:dealt', (payload: { target: Entity }) => {
      if (payload.target.id === this.player.id && payload.target.hp <= 0) {
        this.bus.emit('battle:end', { result: 'wipe' })
      }
    })
  }
```

8. Similarly expose `bossEntity` death detection — this will be handled from `demo-timeline.ts` emitting `battle:end`.

9. Add a `uiRoot` getter for devTerminal mounting (temporary):

```ts
// Keep devTerminal support temporarily:
mountDevTerminal(uiRoot: HTMLDivElement): void {
    this.devTerminal = new DevTerminal(this.bus, new CommandRegistry())
    this.devTerminal.mount(uiRoot)
}
```

Keep `devTerminal` field but make it optional.

- [ ] **Step 2: Update `demo-timeline.ts`**

Replace `s.announce.show(...)` calls with signal writes:

```ts
import { announceText, battleResult, damageLog, combatElapsed as combatElapsedSignal } from '@/ui/state'
```

Change:
- `s.announce.show('战斗开始')` → `announceText.value = '战斗开始'`
- `s.onBattleEnd('victory')` → `battleResult.value = 'victory'`
- `s.onBattleEnd('wipe')` → `battleResult.value = 'wipe'`

The damage log recording (currently in `GameScene` constructor) moves to `demo-timeline.ts` or the adapter. Since it's encounter-specific logic, put it in `demo-timeline.ts`:

Add a damage log listener:

```ts
s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity; amount: number; skill: any }) => {
  if (payload.target.id === s.player.id && payload.amount > 0) {
    const elapsed = combatStarted ? scheduler.combatElapsed : 0
    const mitigations = s.buffSystem.getMitigations(payload.target)
    const totalMit = mitigations.length > 0 ? 1 - mitigations.reduce((acc, v) => acc * (1 - v), 1) : 0
    const log = damageLog.value
    const entry = {
      time: elapsed,
      sourceName: payload.source?.id ?? '?',
      skillName: payload.skill?.name ?? '自动攻击',
      amount: payload.amount,
      hpAfter: payload.target.hp,
      mitigation: totalMit,
    }
    damageLog.value = [...log.slice(-19), entry]
  }
})
```

Update `combatElapsed` signal in the logic tick:

```ts
combatElapsedSignal.value = combatStarted ? scheduler.combatElapsed : null
```

- [ ] **Step 3: Wire state adapter in GameView and render all HUD components**

Update `src/ui/components/GameView.tsx`:

```tsx
import { useEffect, useRef } from 'preact/hooks'
import { useRoute, useLocation } from 'preact-iso'
import { useEngine } from '../engine-context'
import { createStateAdapter } from '../state-adapter'
import { startTimelineDemo, getActiveScene } from '@/demo/demo-timeline'
import * as state from '../state'
import { DEMO_SKILL_BAR } from '@/demo/demo-skill-bar'
import { DEMO_BUFF_MAP } from '@/demo/demo-buffs'
import { HpBar } from './HpBar'
import { CastBar } from './CastBar'
import { SkillBar } from './SkillBar'
import { BuffBar } from './BuffBar'
import { DamageFloater } from './DamageFloater'
import { CombatAnnounce } from './CombatAnnounce'
import { PauseMenu } from './PauseMenu'
import { BattleEndOverlay } from './BattleEndOverlay'
import { DebugInfo } from './DebugInfo'
import { Tooltip } from './Tooltip'

export function GameView() {
  const { params } = useRoute()
  const { engine, canvas } = useEngine()
  const uiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const uiRoot = uiRef.current!
    const id = params.id
    const base = import.meta.env.BASE_URL
    const encounterUrl = `${base}encounters/${id}.yaml`

    // Set skill bar entries for UI
    state.skillBarEntries.value = DEMO_SKILL_BAR
    state.buffDefs.value = DEMO_BUFF_MAP

    startTimelineDemo(canvas, uiRoot, encounterUrl)

    // Wire state adapter after scene is created
    const scene = getActiveScene()
    let adapter: ReturnType<typeof createStateAdapter> | null = null
    if (scene) {
      adapter = createStateAdapter({
        bus: scene.bus,
        sceneManager: scene.sceneManager,
        skillResolver: scene.skillResolver,
        buffSystem: scene.buffSystem,
      })

      // Patch the render loop to call adapter.writeFrame
      // This happens inside scene.start() — we need to hook into it
      // The cleanest approach: expose a callback on GameScene
    }

    return () => {
      adapter?.dispose()
      const s = getActiveScene()
      s?.dispose()
      state.resetState()
    }
  }, [params.id])

  const handleResume = () => {
    state.paused.value = false
    const s = getActiveScene()
    if (s) s.paused = false
  }

  const handleRetry = () => {
    const s = getActiveScene()
    if (s) s.config.restart()
  }

  return (
    <div ref={uiRef} class="absolute inset-0" style={{ pointerEvents: 'none' }}>
      <HpBar state={state.bossHp} color="#cc3333" position="top" />
      <HpBar state={state.playerHp} color="#44aa44" position="bottom" />
      <HpBar state={state.playerMp} color="#4488cc" position="bottom2" />
      <CastBar state={state.playerCast} positionStyle="bottom: 120px" color="linear-gradient(90deg, #4a9eff, #82c0ff)" />
      <CastBar state={state.bossCast} positionStyle="top: 50px" color="linear-gradient(90deg, #cc5533, #ff7744)" />
      <SkillBar />
      <BuffBar />
      <DamageFloater />
      <CombatAnnounce />
      <PauseMenu onResume={handleResume} onRetry={handleRetry} />
      <BattleEndOverlay onRetry={handleRetry} />
      <DebugInfo deltaMs={0} />
      <Tooltip />
    </div>
  )
}
```

- [ ] **Step 4: Export `getActiveScene` from `demo-timeline.ts`**

Add to `src/demo/demo-timeline.ts`:

```ts
export function getActiveScene(): GameScene | null {
  return scene
}
```

Also make `config` accessible on GameScene (change `private config` to `readonly config` in `game-scene.ts`).

- [ ] **Step 5: Hook adapter.writeFrame into the render loop**

In `src/game/game-scene.ts`, add an `onRenderTick` callback:

```ts
/** External hook called each render frame (for UI state adapter) */
onRenderTick: ((delta: number) => void) | null = null
```

In the `start()` method's `startRenderLoop` callback, after existing render logic and after the deleted `uiManager.update()` line, add:

```ts
this.onRenderTick?.(delta)
```

Then in `GameView.tsx`, after creating the adapter, set it:

```ts
if (scene) {
  // ... adapter creation ...
  scene.onRenderTick = (delta) => {
    const bossForUI = scene.bossEntity ?? scene.player
    adapter!.writeFrame(scene.player, bossForUI, (sid) => scene.skillResolver.getCooldown(scene.player.id, sid))
  }
}
```

- [ ] **Step 6: Wire pause signal**

In `demo-timeline.ts`, where `playerDriver.update(dt)` returns `'pause'`, replace:

From:
```ts
if (result === 'pause') { this.paused = true; this.pauseMenu.show(); return }
```
To:
```ts
if (result === 'pause') { this.paused = true; state.paused.value = true; return }
```

Add import:
```ts
import { paused as pausedSignal } from '@/ui/state'
```

Actually this is in `game-scene.ts` `start()` method. Update:

```ts
import * as uiState from '@/ui/state'

// In start():
if (result === 'pause') { this.paused = true; uiState.paused.value = true; return }
```

- [ ] **Step 7: Test in browser**

```bash
pnpm run dev
```

Expected: Full game with Preact-rendered HUD. HP bars, skill bar, cast bars, buff bar, damage floaters, pause menu, battle end overlay all work via Preact. Browser back button returns to main menu.

- [ ] **Step 8: Commit**

```bash
git add src/ui/components/GameView.tsx src/game/game-scene.ts src/demo/demo-timeline.ts
git commit -m "feat: wire Preact HUD components via signals state adapter"
```

---

### Task 10: Delete old vanilla UI files and clean up

**Files:**
- Delete: `src/ui/ui-manager.ts`
- Delete: `src/ui/main-menu.ts`
- Delete: `src/ui/hp-bar.ts`
- Delete: `src/ui/skill-bar.ts`
- Delete: `src/ui/cast-bar.ts`
- Delete: `src/ui/buff-bar.ts`
- Delete: `src/ui/damage-floater.ts`
- Delete: `src/ui/timeline-display.ts` (if migrated, otherwise keep temporarily)
- Delete: `src/ui/tooltip.ts`
- Delete: `src/ui/combat-announce.ts`
- Delete: `src/ui/pause-menu.ts`
- Delete: `src/ui/debug-info.ts`
- Modify: any remaining imports

- [ ] **Step 1: Remove old UI files**

```bash
cd /Users/xiaoyujun/GitRepositories/project-xiv-stage-play
git rm src/ui/ui-manager.ts src/ui/main-menu.ts src/ui/hp-bar.ts src/ui/skill-bar.ts src/ui/cast-bar.ts src/ui/buff-bar.ts src/ui/damage-floater.ts src/ui/tooltip.ts src/ui/combat-announce.ts src/ui/pause-menu.ts src/ui/debug-info.ts
```

- [ ] **Step 2: Update imports in `game-scene.ts`**

Remove all references to deleted UI modules:

```ts
// DELETE these imports:
import { UIManager, type SkillBarEntry } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DebugInfo } from '@/ui/debug-info'
import { CombatAnnounce } from '@/ui/combat-announce'
```

Move `SkillBarEntry` type to `src/ui/state.ts` (it's already defined there).

- [ ] **Step 3: Update imports in `demo-timeline.ts`**

Replace:
```ts
import { TimelineDisplay } from '@/ui/timeline-display'
```

TimelineDisplay is the most complex component and may not be fully migrated yet. If it hasn't been migrated to Preact, keep it as-is and don't delete it. Otherwise remove the import.

- [ ] **Step 4: Remove `skillBarEntries` and `buffDefs` from GameSceneConfig**

These are now set via signals directly, not passed through GameScene config.

- [ ] **Step 5: Verify typecheck and run**

```bash
pnpm run typecheck
pnpm run dev
```

Expected: Clean typecheck, fully functional game with Preact UI.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove old vanilla DOM UI components, migration complete"
```

---

### Task 11: Migrate TimelineDisplay to Preact

**Files:**
- Create: `src/ui/components/TimelineDisplay.tsx`
- Modify: `src/ui/state.ts` (add timeline signals)
- Modify: `src/demo/demo-timeline.ts`
- Delete: `src/ui/timeline-display.ts`

TimelineDisplay is the most complex component (244 lines) with its own reconciliation and animation logic. It reads from `PhaseScheduler` directly.

- [ ] **Step 1: Add timeline signals to `src/ui/state.ts`**

```ts
export interface TimelineEntry {
  key: string
  skillName: string
  state: 'upcoming' | 'casting' | 'flash'
  /** Countdown in ms (positive = upcoming, negative = past activation) */
  timeUntil: number
  /** Cast time in ms (0 for instant) */
  castTime: number
  /** Flash elapsed in ms */
  flashElapsed: number
}

export const timelineEntries = signal<TimelineEntry[]>([])
export const timelineCollapsed = signal(localStorage.getItem('xiv-timeline-collapsed') === 'true')
```

Add `timelineEntries` and `timelineCollapsed` to `resetState()`.

- [ ] **Step 2: Move timeline update logic to `demo-timeline.ts`**

The current `TimelineDisplay.update(dt)` does two things: computes visible entries from PhaseScheduler, and renders them. Extract the computation into a function that writes timeline signals:

In `demo-timeline.ts`, replace:
```ts
const timelineDisplay = new TimelineDisplay(uiRoot, scheduler, enc.skills)
```

With a function that runs in the logic tick:

```ts
import { timelineEntries } from '@/ui/state'

const WINDOW_MS = 30000
const MAX_ENTRIES = 5
const FLASH_DURATION = 1000

// In onLogicTick, replace timelineDisplay.update(dt):
function updateTimeline(dt: number) {
  const elapsed = scheduler.combatElapsed
  const allActions = scheduler.getAllActions()
  const upcoming: TimelineEntry[] = []

  for (const { action, phaseId, absoluteAt } of allActions) {
    if (action.action !== 'use' || !action.use) continue
    const skill = enc.skills.get(action.use)
    if (!skill) continue

    const timeUntil = absoluteAt - elapsed
    if (timeUntil > WINDOW_MS) continue
    if (timeUntil < -FLASH_DURATION - (skill.castTime || 0)) continue

    const key = `${phaseId}_${action.at}_${action.use}_${action.entity ?? ''}`
    const isInstant = skill.type !== 'spell' || skill.castTime === 0

    let state: 'upcoming' | 'casting' | 'flash' = 'upcoming'
    let flashElapsed = 0

    if (timeUntil <= 0) {
      if (isInstant) {
        state = 'flash'
      } else if (-timeUntil < skill.castTime) {
        state = 'casting'
      } else {
        state = 'flash'
      }
    }

    // Find existing entry for flash elapsed tracking
    const prev = timelineEntries.value.find(e => e.key === key)
    if (state === 'flash' && prev?.state === 'flash') {
      flashElapsed = prev.flashElapsed + dt
    } else if (state === 'flash') {
      flashElapsed = 0
    }

    if (flashElapsed < FLASH_DURATION) {
      upcoming.push({ key, skillName: skill.name, state, timeUntil, castTime: skill.castTime, flashElapsed })
    }
  }

  upcoming.sort((a, b) => {
    const aAbs = a.timeUntil
    const bAbs = b.timeUntil
    return aAbs - bAbs
  })
  timelineEntries.value = upcoming.slice(0, MAX_ENTRIES)
}
```

- [ ] **Step 3: Create `src/ui/components/TimelineDisplay.tsx`**

```tsx
import { timelineEntries, timelineCollapsed } from '../state'

const WINDOW_MS = 30000

export function TimelineDisplay() {
  const collapsed = timelineCollapsed.value
  const entries = timelineEntries.value

  const toggle = () => {
    const next = !collapsed
    timelineCollapsed.value = next
    localStorage.setItem('xiv-timeline-collapsed', String(next))
  }

  return (
    <div class="absolute top-15 left-3 w-55 z-50 text-xs" style={{ fontFamily: "'Segoe UI', sans-serif", pointerEvents: 'auto' }}>
      <div
        class="flex justify-between items-center px-2.5 py-1 cursor-pointer rounded-t border border-white/10 border-b-0 select-none"
        style={{ background: 'rgba(0,0,0,0.7)', color: '#aaa' }}
        onClick={toggle}
      >
        <span>Timeline</span>
        <span>{collapsed ? '\u25B8' : '\u25BE'}</span>
      </div>
      {!collapsed && (
        <div
          class="border border-white/10 border-t-0 rounded-b overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.6)' }}
        >
          {entries.map((entry) => (
            <TimelineEntry key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineEntry({ entry }: { entry: typeof timelineEntries.value[0] }) {
  let barWidth = '0%'
  let barColor = 'rgba(100, 160, 255, 0.15)'
  let countdownText = ''
  let opacity = '1'

  if (entry.state === 'upcoming') {
    const pct = Math.max(0, 1 - entry.timeUntil / WINDOW_MS) * 100
    barWidth = `${pct}%`
    countdownText = (entry.timeUntil / 1000).toFixed(1)
  } else if (entry.state === 'casting') {
    const castElapsed = -entry.timeUntil
    const remaining = 1 - castElapsed / entry.castTime
    barWidth = `${remaining * 100}%`
    barColor = 'rgba(255, 140, 60, 0.25)'
    countdownText = ((entry.castTime - castElapsed) / 1000).toFixed(1)
  } else if (entry.state === 'flash') {
    barWidth = '100%'
    barColor = 'rgba(255, 200, 80, 0.3)'
    opacity = Math.sin(entry.flashElapsed * 0.01) > 0 ? '1' : '0.5'
  }

  return (
    <div
      class="relative px-2 py-0.75 overflow-hidden"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity }}
    >
      <div class="absolute left-0 top-0 h-full" style={{ width: barWidth, background: barColor }} />
      <div class="relative flex justify-between items-center z-1">
        <span style={{ color: '#ccc' }}>{entry.skillName}</span>
        <span class="tabular-nums" style={{ color: '#888' }}>{countdownText}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add `<TimelineDisplay />` to GameView**

In `src/ui/components/GameView.tsx`, import and render:

```tsx
import { TimelineDisplay } from './TimelineDisplay'

// In the return JSX, add alongside other HUD components:
<TimelineDisplay />
```

- [ ] **Step 5: Delete old `src/ui/timeline-display.ts`**

```bash
git rm src/ui/timeline-display.ts
```

- [ ] **Step 6: Verify in browser**

```bash
pnpm run dev
```

Expected: Timeline panel shows upcoming boss actions with countdown, casting bar, and flash animations.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/TimelineDisplay.tsx src/ui/state.ts src/demo/demo-timeline.ts
git rm src/ui/timeline-display.ts
git commit -m "feat: migrate TimelineDisplay to Preact with signal-driven updates"
```
