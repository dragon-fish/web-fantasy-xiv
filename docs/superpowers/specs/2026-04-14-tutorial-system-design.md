# Tutorial System Design

## Overview

Add a tutorial encounter as the first level, teaching players movement, combat, AOE avoidance, and boss mechanics. This requires several new engine features: a dialog box UI, a scripting runtime for dynamic logic, wall-type zones, new event types, and the `spawn_entity` action handler.

## Feature 1: Event Naming Cleanup

Rename and add movement events for clarity:

| Scenario | Event | Emitter |
|----------|-------|---------|
| Player WASD movement | `player:walk` | `PlayerInputDriver` |
| Skill displacement (knockback/pull/dash) | `entity:displaced` | `CombatResolver` (rename from `entity:moved`) |
| Teleport | `entity:teleported` | `demo-timeline.ts` teleport action handler |

`entity:moved` is currently only emitted in `CombatResolver.applyDisplacement()`. Rename it to `entity:displaced` and update all listeners. Add `player:walk` in `PlayerInputDriver.update()` when movement direction is non-zero. Add `entity:teleported` in the teleport action handler.

## Feature 2: DialogBox Component

A galgame-style dialog box for tutorial text prompts.

- New Preact signal `dialogText` in `src/ui/state.ts` (string, empty = hidden)
- New `DialogBox.tsx` component: bottom-center overlay, semi-transparent background, supports multi-line text
- Controlled via timeline actions `show_dialog` / `hide_dialog`, or via script ctx

Timeline action schema additions to `TimelineAction`:
- `dialogText?: string` — text to display (for `show_dialog`)

## Feature 3: Wall Zone

Extend `DeathZoneDef` with a `behavior` field to support movement-blocking zones.

### Type Change

```typescript
interface DeathZoneDef {
  id: string
  center: Vec2
  facing: number
  shape: AoeShapeDef
  behavior: 'lethal' | 'wall'  // default: 'lethal'
}
```

### Collision Logic

Two separate checks at different layers:

1. **Movement clamp (PlayerInputDriver)**: After normal arena `clampPosition()`, check all wall zones. If the new position is inside a wall zone, clamp to the nearest edge (push out along the entry vector). No damage dealt — this is pure movement prevention.

2. **Death check (onLogicTick)**: In the existing death zone scan, wall zones behave identically to lethal zones — if the player is inside (e.g. placed there by knockback or arena change), trigger the fall-to-death sequence.

### Wall Clamping Algorithm

For each wall zone, after player movement:
1. Check if new position is inside the wall zone shape
2. If yes, compute the push-out direction (from zone center toward player position)
3. Move player to the nearest point outside the zone boundary along that direction

### Arena Class Extension

Add `clampToWallZones(point: Vec2, zones: DeathZoneDef[]): Vec2` to `Arena` or as a standalone utility. This handles the geometric push-out for each shape type (circle, rect, fan, ring).

### DeathZoneManager

`DeathZoneManager` already tracks dynamic zones. Extend it to store `behavior` and expose a method to get wall zones: `getWallZones(): DeathZoneDef[]`.

### Rendering

Wall zones should render with a distinct color (e.g. gray/blue) vs lethal zones (purple). The `ArenaRenderer` already handles death zone visuals via `deathzone:added` events — extend to use different materials based on `behavior`.

## Feature 4: Script Runtime (`run_script` action)

Embed async JavaScript in YAML timelines for complex tutorial logic.

### YAML Syntax

```yaml
- at: 0
  action: run_script
  script: |
    async function main(ctx) {
      ctx.showDialog("Use WASD to move")
      await new Promise(r => ctx.on('player:walk', r))
      ctx.hideDialog()
      ctx.activatePhase("phase_melee")
    }
```

### Script Context API

```typescript
interface ScriptContext {
  // Event bus (auto-cleanup on script dispose)
  on(event: string, handler: Function): void
  off(event: string, handler: Function): void
  once(event: string, handler: Function): void

  // Entity access (read-only proxies)
  player: EntityProxy
  getEntity(id: string): EntityProxy | null

  // Game actions
  showDialog(text: string): void
  hideDialog(): void
  activatePhase(phaseId: string): void
  teleport(entityId: string, x: number, y: number): void
  setVisible(entityId: string, visible: boolean): void
  setTargetable(entityId: string, targetable: boolean): void
  enableAI(entityId: string): void
  disableAI(entityId: string): void
  useSkill(entityId: string, skillId: string): void
  spawnEntity(opts: SpawnOpts): void
  addDeathZone(def: DeathZoneDef): void
  removeDeathZone(id: string): void

  // Utility
  wait(ms: number): Promise<void>
  Math: typeof Math
  console: { log: Function }
}
```

### Sandbox

- Construct function via `new Function('ctx', scriptBody)`
- Only inject `ctx` — no `window`, `document`, `globalThis` access
- `ctx.on()` wraps `EventBus.on()` with subscription tracking
- On battle end or script completion, all subscriptions are cleaned up automatically

### ScriptRunner Class

New file `src/timeline/script-runner.ts`:

```typescript
class ScriptRunner {
  private activeScripts: Set<ScriptHandle>

  run(script: string, ctx: ScriptContext): ScriptHandle
  disposeAll(): void  // called on battle end
}
```

Each `ScriptHandle` tracks its subscriptions and `wait()` timeouts for cleanup.

### Integration

In `demo-timeline.ts`, handle `run_script` action by:
1. Building a `ScriptContext` from the current game scene state
2. Calling `scriptRunner.run(action.script, ctx)`

The ctx construction needs access to: `bus`, `entityMap`, `aiMap`, `aiEnabled`, `deathZoneMgr`, `scheduler`, `skillResolver`, `dialogText` signal, `displacer`, and `entityMgr`.

## Feature 5: `spawn_entity` Handler

The `spawn_entity` action is defined in schema/parser but not handled in `demo-timeline.ts`. Implement it:

```typescript
case 'spawn_entity': {
  const id = action.spawnId ?? action.entity ?? `mob_${Date.now()}`
  const entity = s.entityMgr.create({
    id,
    type: (action.spawnType ?? 'mob') as EntityType,
    group: action.spawnGroup ?? 'mob',
    hp: action.spawnHp ?? 1000,
    maxHp: action.spawnHp ?? 1000,
    attack: action.spawnAttack ?? 100,
    speed: action.spawnSpeed ?? 0,
    size: action.spawnSize ?? 0.5,
    position: { x: action.position?.x ?? 0, y: action.position?.y ?? 0, z: 0 },
    facing: 180,
  })
  entityMap.set(id, entity)
  // Create AI for mob/boss
  if (entity.type === 'mob' || entity.type === 'boss') {
    const ai = new BossBehavior(entity, {})
    ai.lockFacing(entity.facing)
    aiMap.set(id, ai)
  }
  break
}
```

## Feature 6: Tutorial Encounter YAML

File: `public/encounters/tutorial.yaml`

### Arena

Circle, radius 15m, wall boundary.

### Phases

**Phase 1 — Movement** (script-driven):
- Boss hidden, combat auto-starts
- Show dialog "Use WASD to move"
- Wait for `player:walk` event
- Hide dialog, activate phase 2

**Phase 2 — Melee Attack** (on phase activation):
- Spawn mob at center (0,0), low HP (~4 hits)
- Show dialog "Approach the enemy, press 1 to use melee attack"
- On mob killed → hide dialog, activate phase 3

**Phase 3 — Ranged Attack** (on phase activation):
- Teleport player to (0, -10)
- Add wall zone: rect across center, width 5m, spanning full arena east-west
- Spawn mob at (0, 5) north of wall
- Show dialog "Melee range is not enough, press 2 to use ranged attack"
- On mob killed → show follow-up dialog about ranged damage tradeoff → wait → hide dialog, remove wall zone, activate phase 4

**Phase 4 — AOE Avoidance** (on phase activation):
- Spawn mob at center, no AI, not targetable
- Mob casts 8m circle AOE (iron/steel telegraph)
- Show dialog about attack telegraphs
- Mob casts 180° half-arena cleaves in sequence (N/S/E/W)
- Dialog about moving through gaps
- Mob becomes targetable, enable chase AI, very low HP
- On mob killed → activate phase 5

**Phase 5 — Boss Fight** (on phase activation):
- Boss appears, visible + targetable, chase AI enabled
- Boss HP tuned for ~45s kill time
- Every 5s cycle: 90° fan AOE toward player → 5m circle AOE on player position
- At 60s from phase start: boss casts enrage (full-screen lethal AOE)

### Player Config

- Override skills: slot 1 = melee attack, slot 2 = ranged attack (spell, longer range)
- HP/attack tuned for tutorial pacing

## Implementation Order

1. Event naming cleanup (`entity:moved` → `entity:displaced`, add `player:walk`, `entity:teleported`)
2. DialogBox component + signal + timeline actions
3. Wall zone (type extension, collision, rendering)
4. Script runtime (`ScriptRunner`, `ScriptContext`, sandbox)
5. `spawn_entity` handler
6. Tutorial encounter YAML
