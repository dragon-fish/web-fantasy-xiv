# AGENTS.md

This file provides guidance to Coding Agents when working with code in this repository.

## Project Overview

XIV Stage Play — a web-based FFXIV-inspired boss fight simulator. Core gameplay: dodge AOE mechanics in a top-down arena. YAML-driven boss timelines, full skill/buff systems, displacement effects.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Dev server at http://localhost:5173
pnpm build            # Production build
pnpm typecheck        # Type check (vue-tsc --noEmit -p tsconfig.app.json)
pnpm test             # Run tests in watch mode
pnpm test:run         # Run tests once
pnpm test src/path/to/file.test.ts   # Run a single test file
```

No linter is configured.

## Architecture

Three decoupled layers:

**Game Logic Layer** (pure TypeScript, engine-agnostic):
- `src/core/` — EventBus (central pub/sub), game loop, shared type definitions
- `src/entity/` — EntityManager, player/boss/mob entities
- `src/combat/` — Damage calculation, buff system, displacement
- `src/skill/` — Skill definitions, AOE zone manager, shape collision detection
- `src/timeline/` — YAML-driven boss action scheduler (TimelineScheduler)
- `src/ai/` — Boss AI behavior (aggro, chase, auto-attack)
- `src/arena/` — Boundary geometry, death zones
- `src/config/` — YAML config parsers for arena, entity, skill, timeline

**Rendering Layer** (Babylon.js):
- `src/renderer/` — Scene, entity meshes, AOE telegraph visuals, hit effects

**UI Layer** (Vue 3 + Pinia + vue-router 5):
- `src/pages/` — File-based route pages (index, encounters, job, about, encounter/[id])
- `src/components/` — HUD + menu components (folder-namespaced auto-imports via unplugin-vue-components; `components/hud/HpBar.vue` registers as `<HudHpBar />`)
- `src/stores/` — Pinia stores (`useBattleStore` / `useJobStore` / `useDebugStore`)
- `src/composables/` — `use-engine`, `use-tooltip`, `use-skill-panel`, `use-state-adapter`
- `src/styles/` — Global scss + mixins
- `src/input/` — Keyboard/mouse input handling (pure TS, unchanged)
- `src/devtools/` — Developer terminal (~ key), event log, command system (pure TS, unchanged)

**Game orchestration**:
- `src/game/` — Camera, combat resolver, player driver (ties layers together)
- `src/demo/` — Demo data (skills, buffs, job definitions)

## Key Patterns

- **Event-driven**: All cross-system communication goes through EventBus (`damage:dealt`, `entity:created`, etc.)
- **YAML encounters**: Boss fights defined in `public/encounters/*.yaml` — parsed by config layer, scheduled by TimelineScheduler
- **Discriminated unions**: `src/core/types.ts` uses tagged unions extensively (Vec2/Vec3, AnchorType, AoeShapeDef, etc.)
- **State**: Pinia stores with per-frame mirror from `GameScene` via `use-state-adapter` (`$patch`). UI reads stores, never writes directly; mutations flow through `GameScene` methods (e.g., `scene.pause()`, `scene.endBattle()`).
- **Template style**: pug + scoped scss with UnoCSS Attributify. Arbitrary-value utilities must be quoted in pug: `div(top="[50px]")` works; `div(top-[50px])` fails.
- **Path alias**: `@/*` resolves to `./src/*`

## Tech Stack

- TypeScript (strict), Vue 3 (Composition API, `<script setup>`), Babylon.js
- Pinia (state stores), vue-router 5 (file-based routing with typed routes), @vueuse/core (composables)
- pug + scss + UnoCSS (Wind4 + Attributify) for templates and styles
- Vite 8 (with @vitejs/plugin-vue + @vitejs/plugin-vue-jsx + unplugin-vue-components), Vitest
- pnpm 10.8.1, ES2022 target, ESNext modules

## Tests

Colocated `*.test.ts` files next to source. Vitest globals enabled — `describe`, `it`, `expect` available without import; use `vi` for mocking.

## Design References

- [Job Balance](docs/job-balance.md) — DPM baseline, damage formula, per-job verification template. Key rules: increases are additive (`1 + sum`), only mitigations are multiplicative; `special` damage bypasses all defenses.
- [Prototype Design](docs/specs/2026-04-13-prototype-design.md) — Original game design spec.
