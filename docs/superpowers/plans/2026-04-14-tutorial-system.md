# Tutorial System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add engine features (dialog box, script runtime, wall zones, event cleanup) and a tutorial encounter that teaches movement, combat, AOE avoidance, and boss fight.

**Architecture:** Six incremental tasks: event rename, dialog UI, wall zones, script runtime, spawn_entity handler, tutorial YAML. Each builds on the previous. The script runtime is the most complex piece — it sandboxes JS from YAML timelines with an async ctx API wrapping the EventBus.

**Tech Stack:** Preact (signals + TSX), Babylon.js (rendering), YAML (encounter data), `new Function()` (script sandbox)

---

### Task 1: Event Naming Cleanup

**Files:**
- Modify: `src/game/combat-resolver.ts:164`
- Modify: `src/core/event-bus.test.ts:46`
- Modify: `src/game/player-input-driver.ts:62-83`
- Modify: `src/demo/demo-timeline.ts:204-207`

- [ ] **Step 1: Rename `entity:moved` → `entity:displaced` in CombatResolver**

In `src/game/combat-resolver.ts:164`, change:

```typescript
this.bus.emit('entity:displaced', { entity, from: null, to: clamped })
```

- [ ] **Step 2: Update event-bus test**

In `src/core/event-bus.test.ts:46`, change:

```typescript
expect(() => bus.emit('entity:displaced', {})).not.toThrow()
```

- [ ] **Step 3: Add `player:walk` event in PlayerInputDriver**

In `src/game/player-input-driver.ts`, after the position clamp (line 82), emit the walk event:

```typescript
        const clamped = this.arena.clampPosition({ x: p.position.x, y: p.position.y })
        p.position.x = clamped.x
        p.position.y = clamped.y

        this.bus.emit('player:walk', { entity: p, position: { x: p.position.x, y: p.position.y } })
```

- [ ] **Step 4: Add `entity:teleported` event in demo-timeline.ts**

In `src/demo/demo-timeline.ts`, in the `teleport` action handler (around line 204), add after `s.displacer.start(...)`:

```typescript
      case 'teleport':
        if (target && action.position) {
          s.displacer.start(target, action.position.x, action.position.y, 400)
          s.bus.emit('entity:teleported', { entity: target, position: action.position })
        }
        break
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat-resolver.ts src/core/event-bus.test.ts src/game/player-input-driver.ts src/demo/demo-timeline.ts
git commit -m "refactor: rename entity:moved to entity:displaced, add player:walk and entity:teleported events"
```

---

### Task 2: DialogBox Component

**Files:**
- Modify: `src/ui/state.ts`
- Create: `src/ui/components/DialogBox.tsx`
- Modify: `src/ui/components/GameView.tsx`
- Modify: `src/config/schema.ts`
- Modify: `src/timeline/timeline-parser.ts`
- Modify: `src/demo/demo-timeline.ts`

- [ ] **Step 1: Add `dialogText` signal to state.ts**

In `src/ui/state.ts`, after line 58 (`announceText`):

```typescript
export const dialogText = signal('')
```

In `resetState()` (after line 101 `announceText.value = null`):

```typescript
  dialogText.value = ''
```

- [ ] **Step 2: Create DialogBox.tsx**

Create `src/ui/components/DialogBox.tsx`:

```tsx
import { dialogText } from '../state'

export function DialogBox() {
  const text = dialogText.value
  if (!text) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '70%',
        maxWidth: 700,
        minHeight: 60,
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        color: '#e8e8e8',
        fontSize: 16,
        lineHeight: 1.6,
        letterSpacing: 1,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
        zIndex: 55,
      }}
    >
      {text}
    </div>
  )
}
```

- [ ] **Step 3: Mount DialogBox in GameView**

In `src/ui/components/GameView.tsx`, add import:

```typescript
import { DialogBox } from './DialogBox'
```

Add `<DialogBox />` after `<CombatAnnounce />` in the JSX (around line 84).

- [ ] **Step 4: Add `show_dialog` / `hide_dialog` to timeline parser**

In `src/timeline/timeline-parser.ts`, in `flattenEntry()`, add after the `camera_roll` case (line 114):

```typescript
  } else if (entry.action === 'show_dialog') {
    out.push({ at, action: 'show_dialog', dialogText: entry.text })
  } else if (entry.action === 'hide_dialog') {
    out.push({ at, action: 'hide_dialog' })
  }
```

- [ ] **Step 5: Add `dialogText` field to TimelineAction schema**

In `src/config/schema.ts`, add to `TimelineAction` interface (after `deathZoneId` field, around line 114):

```typescript
  // dialog fields
  dialogText?: string     // for show_dialog
```

- [ ] **Step 6: Handle `show_dialog` / `hide_dialog` in demo-timeline.ts**

In `src/demo/demo-timeline.ts`, in the `timeline:action` switch block, add cases:

```typescript
      case 'show_dialog':
        if (action.dialogText) dialogText.value = action.dialogText
        break
      case 'hide_dialog':
        dialogText.value = ''
        break
```

Add `dialogText` to the import from `@/ui/state`:

```typescript
import { announceText, battleResult, damageLog, combatElapsed as combatElapsedSignal, timelineEntries, dialogText, type TimelineEntry } from '@/ui/state'
```

- [ ] **Step 7: Run tests and verify**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/ui/state.ts src/ui/components/DialogBox.tsx src/ui/components/GameView.tsx src/config/schema.ts src/timeline/timeline-parser.ts src/demo/demo-timeline.ts
git commit -m "feat: add DialogBox component with show_dialog/hide_dialog timeline actions"
```

---

### Task 3: Wall Zone

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/arena/death-zone-manager.ts`
- Modify: `src/arena/arena.ts`
- Modify: `src/game/player-input-driver.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/timeline/timeline-parser.ts`
- Modify: `src/renderer/arena-renderer.ts`

- [ ] **Step 1: Add `behavior` field to `DeathZoneDef`**

In `src/core/types.ts`, update `DeathZoneDef` (line 104-109):

```typescript
export interface DeathZoneDef {
  id: string
  center: Vec2
  facing: number
  shape: AoeShapeDef
  /** 'lethal' = instant death, 'wall' = blocks movement (death if already inside) */
  behavior: 'lethal' | 'wall'
}
```

- [ ] **Step 2: Update schema parsing to include `behavior`**

In `src/config/schema.ts`, in `parseArenaConfig()` (line 18-23), add behavior:

```typescript
  const deathZones: DeathZoneDef[] | undefined = raw.deathZones?.map((z, i) => ({
    id: z.id ?? `static_${i}`,
    center: { x: z.center.x, y: z.center.y },
    facing: z.facing ?? 0,
    shape: z.shape ?? { type: 'circle' as const, radius: z.radius ?? 1 },
    behavior: (z as any).behavior ?? 'lethal',
  }))
```

- [ ] **Step 3: Update timeline parser for `add_death_zone` behavior**

In `src/timeline/timeline-parser.ts`, update the `add_death_zone` push (line 110):

```typescript
  } else if (entry.action === 'add_death_zone') {
    out.push({ at, action: 'add_death_zone', deathZone: entry.deathZone })
  }
```

The `deathZone` object already passes through as-is, and the handler in `demo-timeline.ts` already spreads it into `DeathZoneDef`. We need to make sure `behavior` is included. In `src/demo/demo-timeline.ts`, update the `add_death_zone` handler (around line 222-229):

```typescript
      case 'add_death_zone':
        if (action.deathZone) {
          deathZoneMgr.add({
            id: action.deathZone.id,
            center: { x: action.deathZone.center.x, y: action.deathZone.center.y },
            facing: action.deathZone.facing ?? 0,
            shape: action.deathZone.shape,
            behavior: action.deathZone.behavior ?? 'lethal',
          })
        }
        break
```

Also update the `deathZone` field type in `TimelineAction` in `src/config/schema.ts` (line 113):

```typescript
  deathZone?: { id: string; center: { x: number; y: number }; facing?: number; shape: any; behavior?: 'lethal' | 'wall' }
```

- [ ] **Step 4: Add wall zone clamp utility to Arena**

In `src/arena/arena.ts`, add a method to clamp a point outside wall zones:

```typescript
import type { ArenaDef, DeathZoneDef, Vec2 } from '@/core/types'
import { isPointInAoeShape } from '@/skill/aoe-shape'

export class Arena {
  // ... existing methods ...

  /**
   * Push a point out of any wall zone it's inside.
   * Uses simple push-out along vector from zone center to point.
   */
  clampToWallZones(point: Vec2, wallZones: DeathZoneDef[]): Vec2 {
    let result = { ...point }
    for (const zone of wallZones) {
      if (!isPointInAoeShape(result, zone.center, zone.shape, zone.facing)) continue

      // Push out: direction from zone center to point
      const dx = result.x - zone.center.x
      const dy = result.y - zone.center.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 0.001) {
        // Point is exactly at center — push in arbitrary direction
        result = { x: zone.center.x, y: zone.center.y + this.getZoneRadius(zone) + 0.1 }
        continue
      }

      const nx = dx / dist
      const ny = dy / dist
      const pushDist = this.getZoneRadius(zone) + 0.1
      result = { x: zone.center.x + nx * pushDist, y: zone.center.y + ny * pushDist }
    }
    return result
  }

  /** Approximate radius for push-out distance */
  private getZoneRadius(zone: DeathZoneDef): number {
    switch (zone.shape.type) {
      case 'circle': return zone.shape.radius
      case 'fan': return zone.shape.radius
      case 'ring': return zone.shape.outerRadius
      case 'rect': return Math.max(zone.shape.length, zone.shape.width) / 2
    }
  }
}
```

- [ ] **Step 5: Add `getWallZones()` to DeathZoneManager**

In `src/arena/death-zone-manager.ts`, add method:

```typescript
  getWallZones(): DeathZoneDef[] {
    return [...this.zones.values()].filter(z => z.behavior === 'wall')
  }
```

Also update `loadInitial` to default behavior:

```typescript
  loadInitial(zones: DeathZoneDef[]): void {
    for (const z of zones) {
      // Ensure behavior is set
      if (!z.behavior) (z as any).behavior = 'lethal'
      this.zones.set(z.id, z)
      this.bus.emit('deathzone:added', { zone: z })
    }
  }
```

- [ ] **Step 6: Integrate wall zone clamp in PlayerInputDriver**

In `src/game/player-input-driver.ts`, add a `wallZoneClamp` callback to the constructor. First, add to the `PlayerInputConfig` interface:

Actually, the simpler approach: pass `DeathZoneManager` (or a getter) to `PlayerInputDriver`. But `PlayerInputDriver` currently only takes `Arena`. The cleanest way: add an optional `getWallZones` callback.

Update `PlayerInputDriver` constructor and `update()`:

In constructor, add parameter after `arena`:

```typescript
  private getWallZones: () => DeathZoneDef[] = () => [],
```

In `update()`, after arena clamp (line 80-82), add wall zone clamp:

```typescript
        const clamped = this.arena.clampPosition({ x: p.position.x, y: p.position.y })
        const wallClamped = this.arena.clampToWallZones(clamped, this.getWallZones())
        p.position.x = wallClamped.x
        p.position.y = wallClamped.y
```

In `src/game/game-scene.ts`, update `createPlayer()` to pass the wall zones getter. But `GameScene` doesn't have access to `DeathZoneManager` — it's created in `demo-timeline.ts`. So instead, add a public setter on `PlayerInputDriver`:

```typescript
  setWallZoneProvider(fn: () => DeathZoneDef[]): void {
    this.getWallZones = fn
  }
```

Then in `src/demo/demo-timeline.ts`, after creating `deathZoneMgr` and the player (around line 103-104), wire it up:

```typescript
  s.playerDriver.setWallZoneProvider(() => deathZoneMgr.getWallZones())
```

- [ ] **Step 7: Render wall zones with different color**

In `src/renderer/arena-renderer.ts`, add a second material for wall zones and use it based on behavior.

Add after the `dzMat` initialization (around line 28):

```typescript
    this.wallMat = new StandardMaterial('wallzone-mat', scene)
    this.wallMat.diffuseColor = new Color3(0.2, 0.25, 0.35)   // dark blue-gray
    this.wallMat.emissiveColor = new Color3(0.1, 0.12, 0.18)
    this.wallMat.specularColor = Color3.Black()
    this.wallMat.alpha = 0.85
```

Add the field declaration alongside `dzMat`:

```typescript
  private wallMat: StandardMaterial
```

Update the `deathzone:added` handler to pass behavior:

```typescript
      bus.on('deathzone:added', (payload: { zone: { id: string; center: { x: number; y: number }; facing: number; shape: AoeShapeDef; behavior?: string } }) => {
        this.addDeathZoneMesh(payload.zone.id, payload.zone.center, payload.zone.shape, payload.zone.facing, payload.zone.behavior)
      })
```

Update `addDeathZoneMesh` signature and material selection:

```typescript
  private addDeathZoneMesh(id: string, center: { x: number; y: number }, shape: AoeShapeDef, facing: number, behavior?: string): void {
    // ... existing mesh creation code ...
    mesh.material = behavior === 'wall' ? this.wallMat : this.dzMat
    this.deathZoneMeshes.set(id, mesh)
  }
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run`
Expected: All tests pass. (Existing death zone tests don't set behavior, so they default to 'lethal'.)

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/arena/arena.ts src/arena/death-zone-manager.ts src/game/player-input-driver.ts src/config/schema.ts src/timeline/timeline-parser.ts src/demo/demo-timeline.ts src/renderer/arena-renderer.ts src/game/game-scene.ts
git commit -m "feat: add wall zone type that blocks movement without killing on contact"
```

---

### Task 4: Script Runtime

**Files:**
- Create: `src/timeline/script-runner.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/timeline/timeline-parser.ts`
- Modify: `src/demo/demo-timeline.ts`

- [ ] **Step 1: Add `script` field to TimelineAction**

In `src/config/schema.ts`, add to `TimelineAction` interface:

```typescript
  // script fields
  script?: string   // for run_script
```

- [ ] **Step 2: Add `run_script` to timeline parser**

In `src/timeline/timeline-parser.ts`, in `flattenEntry()`, add:

```typescript
  } else if (entry.action === 'run_script') {
    out.push({ at, action: 'run_script', script: entry.script })
  }
```

- [ ] **Step 3: Create ScriptRunner**

Create `src/timeline/script-runner.ts`:

```typescript
import type { EventBus } from '@/core/event-bus'

type Handler = (payload: any) => void

interface ScriptHandle {
  subscriptions: Array<{ event: string; handler: Handler }>
  timeouts: Set<number>
  disposed: boolean
}

export interface ScriptContext {
  on: (event: string, handler: Handler) => void
  off: (event: string, handler: Handler) => void
  once: (event: string, handler: Handler) => void
  wait: (ms: number) => Promise<void>
  Math: typeof Math
  console: { log: (...args: any[]) => void }
  [key: string]: any
}

export interface ScriptRunnerDeps {
  bus: EventBus
  /** Called to build extra ctx properties (game actions, entity access, etc.) */
  buildCtx: (handle: ScriptHandle) => Record<string, any>
}

export class ScriptRunner {
  private handles = new Set<ScriptHandle>()

  constructor(private deps: ScriptRunnerDeps) {}

  run(scriptSource: string): void {
    const handle: ScriptHandle = {
      subscriptions: [],
      timeouts: new Set(),
      disposed: false,
    }
    this.handles.add(handle)

    const bus = this.deps.bus

    const ctx: ScriptContext = {
      on: (event: string, handler: Handler) => {
        if (handle.disposed) return
        handle.subscriptions.push({ event, handler })
        bus.on(event, handler)
      },
      off: (event: string, handler: Handler) => {
        bus.off(event, handler)
        handle.subscriptions = handle.subscriptions.filter(
          s => !(s.event === event && s.handler === handler)
        )
      },
      once: (event: string, handler: Handler) => {
        if (handle.disposed) return
        const wrapper: Handler = (payload) => {
          ctx.off(event, wrapper)
          handler(payload)
        }
        ctx.on(event, wrapper)
      },
      wait: (ms: number) => {
        return new Promise<void>((resolve) => {
          if (handle.disposed) return
          const id = window.setTimeout(() => {
            handle.timeouts.delete(id)
            if (!handle.disposed) resolve()
          }, ms)
          handle.timeouts.add(id)
        })
      },
      Math,
      console: { log: (...args: any[]) => console.log('[script]', ...args) },
      ...this.deps.buildCtx(handle),
    }

    // Execute script in sandbox
    try {
      const fn = new Function('ctx', `
        const { Math, console } = ctx;
        return (${scriptSource})(ctx);
      `)
      const result = fn(ctx)
      // If result is a promise (async main), handle completion
      if (result && typeof result.then === 'function') {
        result.then(() => this.dispose(handle)).catch((err: any) => {
          console.error('[script] error:', err)
          this.dispose(handle)
        })
      }
    } catch (err) {
      console.error('[script] compile/run error:', err)
      this.dispose(handle)
    }
  }

  private dispose(handle: ScriptHandle): void {
    if (handle.disposed) return
    handle.disposed = true

    // Clean up event subscriptions
    for (const sub of handle.subscriptions) {
      this.deps.bus.off(sub.event, sub.handler)
    }
    handle.subscriptions = []

    // Clean up timeouts
    for (const id of handle.timeouts) {
      clearTimeout(id)
    }
    handle.timeouts.clear()

    this.handles.delete(handle)
  }

  disposeAll(): void {
    for (const handle of this.handles) {
      this.dispose(handle)
    }
  }
}
```

- [ ] **Step 4: Integrate ScriptRunner in demo-timeline.ts**

In `src/demo/demo-timeline.ts`, add import:

```typescript
import { ScriptRunner } from '@/timeline/script-runner'
```

After creating the scheduler and deathZoneMgr (around line 103), create the script runner:

```typescript
  const scriptRunner = new ScriptRunner({
    bus: s.bus,
    buildCtx: () => ({
      // Entity access
      player: s.player,
      getEntity: (id: string) => entityMap.get(id) ?? null,

      // Game actions
      showDialog: (text: string) => { dialogText.value = text },
      hideDialog: () => { dialogText.value = '' },
      activatePhase: (phaseId: string) => scheduler.activatePhase(phaseId),
      teleport: (entityId: string, x: number, y: number) => {
        const e = entityMap.get(entityId)
        if (e) {
          s.displacer.start(e, x, y, 400)
          s.bus.emit('entity:teleported', { entity: e, position: { x, y } })
        }
      },
      setVisible: (entityId: string, visible: boolean) => {
        const e = entityMap.get(entityId)
        if (e) e.visible = visible
      },
      setTargetable: (entityId: string, targetable: boolean) => {
        const e = entityMap.get(entityId)
        if (e) {
          e.targetable = targetable
          if (!targetable && s.player.target === e.id) {
            s.player.target = null
            s.bus.emit('target:released', { entity: s.player })
          }
        }
      },
      enableAI: (entityId: string) => {
        const e = entityMap.get(entityId)
        if (e) {
          aiEnabled.add(e.id)
          const ai = aiMap.get(e.id)
          ai?.unlockFacing()
          e.target = s.player.id
        }
      },
      disableAI: (entityId: string) => {
        aiEnabled.delete(entityId)
      },
      useSkill: (entityId: string, skillId: string) => {
        const e = entityMap.get(entityId)
        const skill = enc.skills.get(skillId)
        if (e && skill) {
          if (e.type === 'mob' || e.type === 'boss') e.target = s.player.id
          s.skillResolver.tryUse(e, skill)
        }
      },
      spawnEntity: (opts: any) => {
        const id = opts.id ?? `mob_${Date.now()}`
        const entity = s.entityMgr.create({
          id,
          type: opts.type ?? 'mob',
          group: opts.group ?? opts.type ?? 'mob',
          visible: opts.visible ?? true,
          targetable: opts.targetable ?? true,
          hp: opts.hp ?? 1000,
          maxHp: opts.hp ?? 1000,
          attack: opts.attack ?? 100,
          speed: opts.speed ?? 0,
          size: opts.size ?? 0.5,
          position: { x: opts.x ?? 0, y: opts.y ?? 0, z: 0 },
          facing: opts.facing ?? 180,
        })
        entityMap.set(id, entity)
        if (entity.type === 'mob' || entity.type === 'boss') {
          const ai = new BossBehavior(entity, {})
          ai.lockFacing(entity.facing)
          aiMap.set(id, ai)
        }
        return entity
      },
      addDeathZone: (def: any) => {
        deathZoneMgr.add({
          id: def.id,
          center: { x: def.center.x, y: def.center.y },
          facing: def.facing ?? 0,
          shape: def.shape,
          behavior: def.behavior ?? 'lethal',
        })
      },
      removeDeathZone: (id: string) => deathZoneMgr.remove(id),
    }),
  })
```

Add the `run_script` case in the switch block:

```typescript
      case 'run_script':
        if (action.script) scriptRunner.run(action.script)
        break
```

In the `combat:ended` handler or battle-over cleanup, add:

```typescript
  scriptRunner.disposeAll()
```

This should go where `s.battleOver` is set to true. In the existing `damage:dealt` handler, after setting `s.battleOver = true` for both victory and wipe cases, add `scriptRunner.disposeAll()`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/timeline/script-runner.ts src/config/schema.ts src/timeline/timeline-parser.ts src/demo/demo-timeline.ts
git commit -m "feat: add script runtime for dynamic JS logic in timeline YAML"
```

---

### Task 5: spawn_entity Handler

**Files:**
- Modify: `src/demo/demo-timeline.ts`

- [ ] **Step 1: Add `spawn_entity` case in demo-timeline.ts**

In the `timeline:action` switch block in `src/demo/demo-timeline.ts`, add the case:

```typescript
      case 'spawn_entity': {
        const id = action.spawnId ?? action.entity ?? `mob_${Date.now()}`
        const type = (action.spawnType ?? 'mob') as EntityType
        const entity = s.entityMgr.create({
          id,
          type,
          group: action.spawnGroup ?? type,
          hp: action.spawnHp ?? 1000,
          maxHp: action.spawnHp ?? 1000,
          attack: action.spawnAttack ?? 100,
          speed: action.spawnSpeed ?? 0,
          size: action.spawnSize ?? 0.5,
          position: { x: action.position?.x ?? 0, y: action.position?.y ?? 0, z: 0 },
          facing: 180,
        })
        entityMap.set(id, entity)
        if (type === 'mob' || type === 'boss') {
          const ai = new BossBehavior(entity, {})
          ai.lockFacing(entity.facing)
          aiMap.set(id, ai)
        }
        break
      }
```

Add the `EntityType` import at the top of the file:

```typescript
import type { EntityType } from '@/core/types'
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/demo/demo-timeline.ts
git commit -m "feat: implement spawn_entity timeline action handler"
```

---

### Task 6: Tutorial Encounter YAML

**Files:**
- Create: `public/encounters/tutorial.yaml`

This task is the largest, defining the full tutorial encounter. The tutorial uses `run_script` for phase orchestration since it needs input-based triggers that can't be expressed as pure YAML phases.

- [ ] **Step 1: Create tutorial.yaml**

Create `public/encounters/tutorial.yaml`:

```yaml
# Tutorial encounter — teaches movement, combat, AOE avoidance, boss fight
# Uses run_script for dynamic logic (input triggers, conditional text)

arena:
  name: Training Grounds
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: boss
    group: boss
    hp: 45000
    attack: 500
    speed: 4
    size: 1.5
    facing: 180
    visible: false
    targetable: false
    autoAttackRange: 5
    aggroRange: 0

player:
  hp: 50000
  attack: 1000
  speed: 6
  size: 0.5
  autoAttackRange: 5
  position: { x: 0, y: -5, z: 0 }

boss_ai:
  chaseRange: 3
  autoAttackRange: 5
  autoAttackInterval: 3000
  aggroRange: 0
  aggroAngle: 360

# --- Skills ---
local_skills:
  # Tutorial melee attack (player slot 1)
  # Defined here for boss/mob use; player uses demo-skills slash

  # Mob auto-attack (weak)
  mob_auto:
    name: Attack
    type: ability
    targetType: single
    requiresTarget: true
    range: 5
    effects: [{ type: damage, potency: 0.5 }]

  # Steel AOE (phase 4 mob - large circle telegraph)
  steel_aoe:
    name: Steel
    type: spell
    castTime: 5000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 8 }
        resolveDelay: 5000
        telegraphBefore: 5000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 25000 }]

  # Half-arena cleave (phase 4 - 180 degree fan)
  half_cleave_n:
    name: Cleave
    type: spell
    castTime: 3000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: fixed, angle: 0 }
        shape: { type: fan, radius: 15, angle: 180 }
        resolveDelay: 3000
        telegraphBefore: 3000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 25000 }]

  half_cleave_s:
    name: Cleave
    type: spell
    castTime: 3000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: fixed, angle: 180 }
        shape: { type: fan, radius: 15, angle: 180 }
        resolveDelay: 3000
        telegraphBefore: 3000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 25000 }]

  half_cleave_e:
    name: Cleave
    type: spell
    castTime: 3000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: fixed, angle: 90 }
        shape: { type: fan, radius: 15, angle: 180 }
        resolveDelay: 3000
        telegraphBefore: 3000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 25000 }]

  half_cleave_w:
    name: Cleave
    type: spell
    castTime: 3000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: fixed, angle: 270 }
        shape: { type: fan, radius: 15, angle: 180 }
        resolveDelay: 3000
        telegraphBefore: 3000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 25000 }]

  # Boss fan AOE (90 degree toward player)
  boss_fan:
    name: Slash
    type: spell
    castTime: 5000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: toward_target }
        shape: { type: fan, radius: 5, angle: 90 }
        resolveDelay: 5000
        telegraphBefore: 5000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 12000 }]

  # Boss circle AOE (on player position)
  boss_circle:
    name: Explosion
    type: spell
    castTime: 5000
    targetType: aoe
    zones:
      - anchor: { type: target_live }
        direction: { type: none }
        shape: { type: circle, radius: 5 }
        resolveDelay: 5000
        telegraphBefore: 5000
        hitEffectDuration: 400
        effects: [{ type: damage, potency: 12000 }]

  # Boss auto-attack
  boss_auto:
    name: Attack
    type: ability
    targetType: single
    requiresTarget: true
    range: 5
    effects: [{ type: damage, potency: 1500 }]

  # Enrage
  enrage:
    name: Enrage
    type: spell
    castTime: 10000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 99 }
        resolveDelay: 10000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 999999999 }]

skills:
  boss_auto:
    name: Attack
    type: ability
    targetType: single
    requiresTarget: true
    range: 5
    effects: [{ type: damage, potency: 1500 }]

# --- Timeline: single script drives the whole tutorial ---
timeline:
  - at: 500
    action: run_script
    script: |
      async function main(ctx) {
        // === Phase 1: Movement ===
        ctx.showDialog("使用 WASD 移动角色")
        await new Promise(r => ctx.once('player:walk', r))
        ctx.hideDialog()
        await ctx.wait(500)

        // === Phase 2: Melee Attack ===
        ctx.spawnEntity({ id: 'mob1', type: 'mob', group: 'tutorial_mob1', hp: 4000, x: 0, y: 0, size: 0.6 })
        ctx.showDialog("靠近敌人，按 1 可以使用近战攻击")
        await new Promise(r => ctx.once('entity:died', (ev) => {
          if (ev.entity.id === 'mob1') r()
        }))
        ctx.hideDialog()
        await ctx.wait(1000)

        // === Phase 3: Ranged Attack ===
        // Teleport player south
        ctx.teleport('player', 0, -10)
        await ctx.wait(600)

        // Add wall zone across the middle
        ctx.addDeathZone({
          id: 'wall_barrier',
          center: { x: 0, y: 0 },
          facing: 90,
          shape: { type: 'rect', length: 30, width: 5 },
          behavior: 'wall',
        })
        await ctx.wait(300)

        ctx.spawnEntity({ id: 'mob2', type: 'mob', group: 'tutorial_mob2', hp: 3000, x: 0, y: 5, size: 0.6 })
        ctx.showDialog("近战攻击距离不够，使用 2 技能可以远程攻击敌人")
        await new Promise(r => ctx.once('entity:died', (ev) => {
          if (ev.entity.id === 'mob2') r()
        }))
        ctx.showDialog("无法靠近敌人时，灵活使用远程攻击吧！\n但远程攻击的威力更低，请注意这一点")
        await ctx.wait(4000)
        ctx.hideDialog()
        ctx.removeDeathZone('wall_barrier')
        await ctx.wait(1000)

        // === Phase 4: AOE Avoidance ===
        ctx.spawnEntity({ id: 'mob3', type: 'mob', group: 'tutorial_mob3', hp: 8000, x: 0, y: 0, size: 0.8, targetable: false })
        ctx.showDialog("小心！橙色区域是攻击预兆，在攻击到来前离开此区域")
        await ctx.wait(1000)
        ctx.useSkill('mob3', 'steel_aoe')
        await ctx.wait(5500)
        ctx.hideDialog()
        await ctx.wait(500)

        // Half-arena cleaves: N, S, E, W
        ctx.showDialog("注意观察攻击预兆的方向，在安全的区域等待")
        ctx.useSkill('mob3', 'half_cleave_n')
        await ctx.wait(3500)
        ctx.useSkill('mob3', 'half_cleave_s')
        await ctx.wait(3500)
        ctx.useSkill('mob3', 'half_cleave_e')
        await ctx.wait(3500)
        ctx.useSkill('mob3', 'half_cleave_w')
        await ctx.wait(4000)

        ctx.hideDialog()
        ctx.showDialog("很好！现在消灭这只敌人")
        ctx.setTargetable('mob3', true)
        ctx.enableAI('mob3')
        await new Promise(r => ctx.once('entity:died', (ev) => {
          if (ev.entity.id === 'mob3') r()
        }))
        ctx.hideDialog()
        await ctx.wait(1500)

        // === Phase 5: Boss Fight ===
        ctx.showDialog("最终考验！击败 Boss！")
        ctx.setVisible('boss', true)
        ctx.setTargetable('boss', true)
        ctx.enableAI('boss')
        await ctx.wait(3000)
        ctx.hideDialog()

        // Boss AOE loop: fan → circle, every 5s
        let bossAlive = true
        ctx.on('entity:died', (ev) => {
          if (ev.entity.id === 'boss') bossAlive = false
        })

        const startTime = Date.now()
        const ENRAGE_TIME = 60000

        while (bossAlive) {
          const elapsed = Date.now() - startTime

          // Check enrage
          if (elapsed >= ENRAGE_TIME) {
            ctx.disableAI('boss')
            ctx.teleport('boss', 0, 0)
            await ctx.wait(500)
            ctx.useSkill('boss', 'enrage')
            break
          }

          // Fan AOE toward player
          ctx.useSkill('boss', 'boss_fan')
          await ctx.wait(5000)
          if (!bossAlive) break

          // Check enrage again
          if (Date.now() - startTime >= ENRAGE_TIME) {
            ctx.disableAI('boss')
            ctx.teleport('boss', 0, 0)
            await ctx.wait(500)
            ctx.useSkill('boss', 'enrage')
            break
          }

          // Circle AOE on player
          ctx.useSkill('boss', 'boss_circle')
          await ctx.wait(5000)
          if (!bossAlive) break
        }
      }
```

- [ ] **Step 2: Verify the encounter loads**

Start dev server: `npx vite dev`
Navigate to the tutorial encounter in the browser.
Verify:
- Arena is circular with wall boundary
- Dialog appears "使用 WASD 移动角色"
- Moving dismisses the dialog
- Each phase transitions correctly

- [ ] **Step 3: Commit**

```bash
git add public/encounters/tutorial.yaml
git commit -m "feat: add tutorial encounter with scripted phases"
```
