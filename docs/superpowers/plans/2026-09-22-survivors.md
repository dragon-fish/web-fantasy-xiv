# Survivors Implementation Plan

**Goal:** Deliver the approved eight-minute auto-combat prototype.
**Architecture:** Pure survivor runtime owns progression and weapon simulation; GameScene supplies combat, input, buffs and lifecycle. A mode-specific instanced renderer consumes entity and effect state. Existing HUD displays auto weapons and perks.
**Tech Stack:** TypeScript, Babylon.js, Vue/Pug/SCSS, Vitest.
**Spec:** `docs/superpowers/specs/2026-09-22-survivors-design.md`

## Constraints

- Reuse existing damage immunity and displacement; 250ms immunity has no default buff grace.
- Six automatic weapon slots plus manual Space dash; five levels with behavioral evolutions.
- Keep traditional encounter behavior intact; no new dependencies.
- Run focused tests, typecheck, build and browser checks.

## Tasks

- [x] Core: `src/survivors/catalog.ts`, `progression.ts`, `dash.ts` and colocated tests. Test level overflow, legal card selection, sequential recharge and precise immunity before implementation. Add optional `BuffDef.durationGrace` and test its default and explicit-zero behavior.
- [x] Combat: `runtime.ts`, `weapons.ts`, `types.ts` and runtime tests. Reuse public `CombatResolver.applyDamage`. Simulate projectiles, persistent fields, orbit contact, chain lightning, slash and homing; bound secondary effects. Test real entity damage, evolutions and end-state gating.
- [x] Rendering: `visuals.ts` and `models.ts`. Add optional GameScene renderer factory; share instanced enemy templates and reuse effect meshes. Verify through Babylon NullEngine and browser.
- [x] UI: `src/pages/survivors.vue`, extend SkillBar with optional auto/level metadata, preserve existing defaults. Wire state adapter, HUD and manual dash. Fix InputManager listener disposal for replay lifecycle. Add menu entry.
- [x] Verify focused tests, typecheck and production build. Play through upgrade, dash, pause, restart and route transitions. Commit the cohesive prototype.
