# UI Migration: Preact + preact-iso + Signals + UnoCSS

## Motivation

Current UI is vanilla DOM manipulation (12 classes in `src/ui/`). State updates are imperative — `UIManager.update()` pushes data each frame, EventBus handles discrete events. No routing — "quit to menu" does `window.location.reload()`.

Goals:
- Reactive UI with Preact Signals as the game-to-UI bridge
- Client-side routing via preact-iso so browser back button returns to main menu
- Babylon.js Engine persists across routes; only Scene instances are created/destroyed
- UnoCSS (preset-wind4) for static styles, inline style for dynamic values

## Architecture

```
index.html
└── #app (Preact mount point)
    └── <App>
        ├── EngineProvider (creates Engine + canvas, provides via Context)
        └── <Router>  (preact-iso)
            ├── "/"                → <MainMenu />
            └── "/encounter/:id"   → <GameView />

Signals State Layer (src/ui/state.ts)
├── Written by: GameScene update loop + EventBus adapter
└── Read by: Preact components (auto re-render)
```

## New Dependencies

```
preact
preact-iso
@preact/signals
@preact/preset-vite
unocss
@unocss/preset-wind4
```

## Build Config Changes

### vite.config.ts

Add `@preact/preset-vite` and `unocss/vite` plugins.

### tsconfig.app.json

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

### uno.config.ts (new)

```ts
import { defineConfig } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'

export default defineConfig({
  presets: [presetWind4()],
})
```

### index.html

Replace current body content:

```html
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

Canvas is no longer in the HTML — `EngineProvider` creates it dynamically.

## Entry Point: src/main.tsx

```tsx
import { render } from 'preact'
import 'virtual:uno.css'
import { App } from './ui/App'

render(<App />, document.getElementById('app')!)
```

## EngineProvider

`src/ui/engine-context.ts`

Creates `<canvas>` and `Engine` once. Provides them via Preact Context. On mount, appends canvas to DOM. On unmount (never in practice), disposes engine.

Components access via `useEngine()` hook.

The canvas and UI overlay sit as siblings:
```
#app
├── <canvas>  (managed by EngineProvider, full-screen, z-index: 0)
└── <div id="ui-overlay">  (Preact-rendered UI, pointer-events: none on container)
    └── router outlet
```

## Routing

### Routes

| Path | Component | Scene behavior |
|------|-----------|---------------|
| `/` | `<MainMenu />` | No active scene (future: lobby scene) |
| `/encounter/:id` | `<GameView />` | Creates GameScene on mount, disposes on unmount |

### Navigation

- Main menu click: `route('/encounter/leviathan')` (uses preact-iso `route()`)
- Pause menu "Quit": `route('/')` — disposes scene via `GameView` cleanup effect
- Browser back button: works naturally via history API
- Retry: dispose + re-create scene (re-run mount effect)

### Encounter list

Currently fetched from `/encounters/index.json`. Each entry has `{ label, description, file }`. The `file` field (e.g. `leviathan-test.yaml`) derives the route id. `<MainMenu />` fetches the list and renders links.

`<GameView />` reads `:id` from the route, resolves it to the YAML URL, and loads the encounter.

## Signals State Layer

### src/ui/state.ts

Centralized signals for all UI-consumed game state:

```ts
import { signal } from '@preact/signals'

// Per-frame continuous state
export const playerHp = signal({ current: 0, max: 0 })
export const playerMp = signal({ current: 0, max: 0 })
export const bossHp = signal({ current: 0, max: 0 })
export const gcdState = signal({ remaining: 0, total: 0 })
export const castState = signal({
  player: null as null | { name: string; elapsed: number; total: number },
  boss: null as null | { name: string; elapsed: number; total: number },
})
export const buffs = signal<BuffSnapshot[]>([])
export const cooldowns = signal<Map<string, number>>(new Map())

// Discrete event-driven state
export const damageEvents = signal<DamageEvent[]>([])
export const announceText = signal<string | null>(null)

// UI control
export const paused = signal(false)
export const battleResult = signal<null | 'victory' | 'wipe'>(null)

// Skill bar definition (set once per encounter)
export const skillBarEntries = signal<SkillBarEntry[]>([])

// Timeline display data
export const timelineActions = signal<TimelineAction[]>([])
```

### Adapter: src/ui/state-adapter.ts

A function that receives `GameScene` and wires up:

1. **Frame updates**: Called from the render loop (where `uiManager.update()` used to be), writes continuous state into signals.
2. **EventBus listeners**: Subscribes to `damage:dealt`, `skill:cast_start`, `skill:cast_complete`, etc., writes discrete state into signals.

Returns a cleanup function for unsubscribing.

This adapter replaces `UIManager` entirely.

## Component Migration

All components move from `src/ui/*.ts` (class-based DOM) to `src/ui/components/*.tsx` (Preact function components).

| Current class | New component | Signal source | Notes |
|---|---|---|---|
| `MainMenu` | `MainMenu.tsx` | (none — fetches encounter list) | Route `/`, uses `route()` to navigate |
| `HpBar` | `HpBar.tsx` | `playerHp`, `bossHp`, `playerMp` | Dynamic width via inline style |
| `SkillBar` | `SkillBar.tsx` | `skillBarEntries`, `gcdState`, `cooldowns` | Includes tooltip integration |
| `CastBar` | `CastBar.tsx` | `castState` | Dynamic width via inline style |
| `BuffBar` | `BuffBar.tsx` | `buffs` | |
| `DamageFloater` | `DamageFloater.tsx` | `damageEvents` | Consumes events from queue, CSS animation |
| `TimelineDisplay` | `TimelineDisplay.tsx` | `timelineActions` | Collapsible panel |
| `Tooltip` | `Tooltip.tsx` | Local state / props | Positioned via inline style |
| `CombatAnnounce` | `CombatAnnounce.tsx` | `announceText` | Auto-dismiss with timer |
| `PauseMenu` | `PauseMenu.tsx` | `paused` | "Quit" calls `route('/')` |
| `DebugInfo` | `DebugInfo.tsx` | Separate debug signals or props | Low priority |
| `UIManager` | **deleted** | — | Replaced by state-adapter.ts |

### Battle end overlay

Currently `GameScene.onBattleEnd()` imperatively creates DOM. Migrate to a `<BattleEndOverlay />` component that reads `battleResult` signal. Death recap data becomes another signal written by the adapter.

## GameScene Changes

Minimal changes to `game-scene.ts`:

1. **Remove UI construction** from constructor — no more `UIManager`, `PauseMenu`, `DebugInfo`, `CombatAnnounce` creation.
2. **Remove `uiRoot` from config** — GameScene no longer touches the DOM overlay.
3. **Keep** `SceneManager` creation (receives canvas from EngineProvider context, but Engine is passed in rather than created).
4. **Export scene instance** or provide a ref so the state adapter can bind to it.
5. `dispose()` only cleans up Babylon resources, not DOM children.

The `SceneManager` currently creates its own `Engine`. This changes: `Engine` is created once by `EngineProvider` and passed into `SceneManager`/`GameScene`. `SceneManager` creates a new Babylon `Scene` on the shared Engine.

## File Structure After Migration

```
src/
├── main.tsx                    # Preact render entry
├── ui/
│   ├── App.tsx                 # Router + EngineProvider wrapper
│   ├── engine-context.ts       # Engine/canvas context + useEngine hook
│   ├── state.ts                # All UI signals
│   ├── state-adapter.ts        # GameScene → signals bridge
│   └── components/
│       ├── MainMenu.tsx
│       ├── GameView.tsx         # Route component: creates/disposes GameScene
│       ├── HpBar.tsx
│       ├── SkillBar.tsx
│       ├── CastBar.tsx
│       ├── BuffBar.tsx
│       ├── DamageFloater.tsx
│       ├── TimelineDisplay.tsx
│       ├── Tooltip.tsx
│       ├── CombatAnnounce.tsx
│       ├── PauseMenu.tsx
│       ├── BattleEndOverlay.tsx
│       └── DebugInfo.tsx
├── game/
│   ├── game-scene.ts           # Simplified: no UI construction
│   └── ...
├── renderer/
│   ├── scene-manager.ts        # Takes Engine externally instead of creating it
│   └── ...
└── ...
```

Old files to delete after migration:
- `src/ui/ui-manager.ts`
- `src/ui/main-menu.ts`
- `src/ui/hp-bar.ts`
- `src/ui/skill-bar.ts`
- `src/ui/cast-bar.ts`
- `src/ui/buff-bar.ts`
- `src/ui/damage-floater.ts`
- `src/ui/timeline-display.ts`
- `src/ui/tooltip.ts`
- `src/ui/combat-announce.ts`
- `src/ui/pause-menu.ts`
- `src/ui/debug-info.ts`

## Style Approach

- **Static styles**: UnoCSS utility classes (preset-wind4)
- **Dynamic values**: Inline `style={{ width: \`${pct}%\` }}` for HP bars, cooldown progress, position offsets, etc.
- **Global resets**: Keep existing `* { margin: 0; padding: 0; box-sizing: border-box }` in `index.html` or a global CSS file
- **UI overlay**: `pointer-events: none` on container, `pointer-events: auto` on interactive children (same pattern as current)

## Migration Strategy

Incremental — not big-bang. The recommended order:

1. **Infrastructure**: Install deps, configure Vite/TS/UnoCSS, create `main.tsx`, `App.tsx`, `EngineProvider`, `state.ts`
2. **Routing shell**: `MainMenu` + `GameView` as Preact components with preact-iso routing. GameView still delegates to current `GameScene` (which still creates its own UI).
3. **State adapter**: Write `state-adapter.ts`, wire signals from GameScene's existing update loop.
4. **Migrate components one by one**: Replace each vanilla DOM class with a Preact component reading signals. Each component can be migrated independently.
5. **Remove UIManager**: Once all components are migrated, delete UIManager and old class files.
6. **Clean up GameScene**: Remove all UI-related code from GameScene.

At each step the app remains functional — old and new UI can coexist temporarily.
