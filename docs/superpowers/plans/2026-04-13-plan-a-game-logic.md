# Plan A — 游戏逻辑层 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现完整的战斗逻辑层——事件总线、实体、场地、伤害、Buff、技能、AOE Zone、命中判定——纯 TypeScript，全部可 TDD 验证。

**Architecture:** 分层解耦的游戏逻辑系统。EventBus 连接各模块，Entity 是一切存在的基础，Skill/AoE/Buff/Damage 围绕 Entity 构建战斗流程。所有模块不依赖任何渲染引擎。

**Tech Stack:** TypeScript, Vite, Vitest, pnpm

**Spec:** `docs/specs/2026-04-13-prototype-design.md`

---

## 文件结构

测试文件与实现文件并排放置（co-located），Vitest 原生支持此模式。

```
src/
  core/
    types.ts                    # 共享类型（Vec2, Vec3, EntityType 等）
    event-bus.ts                # 类型安全的事件总线
    event-bus.test.ts
    game-loop.ts                # Fixed timestep 逻辑循环
    game-loop.test.ts
  entity/
    entity.ts                   # Entity 接口 + 工厂函数
    entity.test.ts
    entity-manager.ts           # 实体生命周期管理 + 查询
    entity-manager.test.ts
  arena/
    geometry.ts                 # 点在形状内检测（circle, rect）
    geometry.test.ts
    arena.ts                    # Arena 定义 + 边界检测
    arena.test.ts
  combat/
    damage.ts                   # 伤害计算器
    damage.test.ts
    buff.ts                     # Buff/Debuff 系统
    buff.test.ts
  skill/
    aoe-shape.ts                # AOE 形状命中判定几何
    aoe-shape.test.ts
    aoe-zone.ts                 # AoeZone 生命周期管理
    aoe-zone.test.ts
    skill-resolver.ts           # 技能释放流程（GCD、咏唱、判定）
    skill-resolver.test.ts
```

---

### Task 1: 项目脚手架

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`（基础配置，仅定义共享 compilerOptions）
- Create: `tsconfig.app.json`（前端/应用代码）
- Create: `tsconfig.node.json`（Vite/Vitest 等 Node 配置文件）
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: 初始化项目依赖**

```bash
pnpm add -D typescript vite vitest
```

- [ ] **Step 2: 创建 tsconfig.json（基础配置）**

仅定义共享选项，不直接 include 任何文件，由子配置引用：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 3: 创建 tsconfig.app.json（应用代码）**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 4: 创建 tsconfig.node.json（配置文件和测试）**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 5: 创建 vite.config.ts**

使用 `import.meta.dirname` 替代 `__dirname`（ESM 标准）：

```typescript
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
```

- [ ] **Step 6: 创建 vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
  },
})
```

- [ ] **Step 7: 更新 package.json scripts**

在 `package.json` 中添加：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

- [ ] **Step 8: 创建入口文件并验证**

创建 `src/index.ts`：

```typescript
export const VERSION = '0.1.0'
```

运行：`pnpm test:run`
预期：0 个测试，无报错。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold project with Vite, TypeScript, Vitest"
```

---

### Task 2: 共享类型定义

**Files:**
- Create: `src/core/types.ts`

- [ ] **Step 1: 定义基础类型**

```typescript
// src/core/types.ts

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type EntityType = 'player' | 'boss' | 'mob' | 'object'

export type SkillType = 'weaponskill' | 'spell' | 'ability'

export type TargetType = 'single' | 'aoe'

export type BuffType = 'buff' | 'debuff'

export type AnchorType =
  | { type: 'caster' }
  | { type: 'target' }
  | { type: 'target_live' }
  | { type: 'position'; x: number; y: number }

export type DirectionType =
  | { type: 'caster_facing' }
  | { type: 'toward_target' }
  | { type: 'fixed'; angle: number }
  | { type: 'none' }

export type AoeShapeDef =
  | { type: 'circle'; radius: number }
  | { type: 'fan'; radius: number; angle: number }
  | { type: 'ring'; innerRadius: number; outerRadius: number }
  | { type: 'rect'; length: number; width: number }

export type SkillEffectDef =
  | { type: 'damage'; potency: number }
  | { type: 'heal'; potency: number }
  | { type: 'apply_buff'; buffId: string }

export interface AoeZoneDef {
  anchor: AnchorType
  direction: DirectionType
  shape: AoeShapeDef
  telegraphDuration: number  // ms
  resolveDelay: number       // ms
  hitEffectDuration: number  // ms, default 500
  effects: SkillEffectDef[]
}

export interface SkillDef {
  id: string
  name: string
  type: SkillType
  castTime: number    // ms
  cooldown: number    // ms
  gcd: boolean
  targetType: TargetType
  range: number
  zones?: AoeZoneDef[]
  effects?: SkillEffectDef[]
}

export interface BuffDef {
  id: string
  name: string
  type: BuffType
  duration: number   // ms, 0 = permanent
  stackable: boolean
  maxStacks: number
  effects: BuffEffectDef[]
}

export type BuffEffectDef =
  | { type: 'damage_increase'; value: number }
  | { type: 'mitigation'; value: number }
  | { type: 'speed_modify'; value: number }
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'silence' }
  | { type: 'stun' }

export type ArenaShape =
  | { type: 'circle'; radius: number }
  | { type: 'rect'; width: number; height: number }

export type BoundaryType = 'lethal' | 'wall'

export interface ArenaDef {
  name: string
  shape: ArenaShape
  boundary: BoundaryType
}

/** Direction quadrant relative to entity facing */
export type FacingQuadrant = 'forward' | 'back' | 'left' | 'right'
```

- [ ] **Step 2: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add shared type definitions"
```

---

### Task 3: 事件总线

**Files:**
- Create: `src/core/event-bus.ts`
- Create: `src/core/event-bus.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/core/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/event-bus'

describe('EventBus', () => {
  it('should call subscriber when event is emitted', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('damage:dealt', handler)
    const payload = { amount: 100 }
    bus.emit('damage:dealt', payload)
    expect(handler).toHaveBeenCalledWith(payload)
  })

  it('should support multiple subscribers', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('entity:created', h1)
    bus.on('entity:created', h2)
    bus.emit('entity:created', { id: '1' })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('should unsubscribe with off()', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('entity:died', handler)
    bus.off('entity:died', handler)
    bus.emit('entity:died', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('should support once() - auto unsubscribe after first call', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.once('combat:started', handler)
    bus.emit('combat:started', {})
    bus.emit('combat:started', {})
    expect(handler).toHaveBeenCalledOnce()
  })

  it('should not throw when emitting event with no subscribers', () => {
    const bus = new EventBus()
    expect(() => bus.emit('entity:moved', {})).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/core/event-bus.test.ts
```

预期：FAIL — `Cannot find module '@/core/event-bus'`

- [ ] **Step 3: 实现 EventBus**

```typescript
// src/core/event-bus.ts
type Handler = (payload: any) => void

export class EventBus {
  private listeners = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: Handler): void {
    this.listeners.get(event)?.delete(handler)
  }

  once(event: string, handler: Handler): void {
    const wrapper: Handler = (payload) => {
      this.off(event, wrapper)
      handler(payload)
    }
    this.on(event, wrapper)
  }

  emit(event: string, payload: unknown): void {
    const handlers = this.listeners.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      handler(payload)
    }
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/core/event-bus.test.ts
```

预期：5 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/event-bus.ts src/core/event-bus.test.ts
git commit -m "feat: implement EventBus with on/off/once/emit"
```

---

### Task 4: 游戏主循环（逻辑部分）

**Files:**
- Create: `src/core/game-loop.ts`
- Create: `src/core/game-loop.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/core/game-loop.test.ts
import { describe, it, expect, vi } from 'vitest'
import { GameLoop, LOGIC_TICK } from '@/core/game-loop'

describe('GameLoop', () => {
  it('should export LOGIC_TICK as 16', () => {
    expect(LOGIC_TICK).toBe(16)
  })

  it('should call update with fixed timestep', () => {
    const loop = new GameLoop()
    const update = vi.fn()
    loop.onUpdate(update)

    // Simulate 48ms elapsed — should produce 3 logic ticks
    loop.tick(48)
    expect(update).toHaveBeenCalledTimes(3)
    expect(update).toHaveBeenCalledWith(LOGIC_TICK)
  })

  it('should accumulate fractional time', () => {
    const loop = new GameLoop()
    const update = vi.fn()
    loop.onUpdate(update)

    // 10ms — not enough for a tick
    loop.tick(10)
    expect(update).not.toHaveBeenCalled()

    // another 10ms — now 20ms total, 1 tick
    loop.tick(10)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('should track logicTime correctly', () => {
    const loop = new GameLoop()
    loop.onUpdate(() => {})

    loop.tick(50) // 3 ticks × 16ms = 48ms consumed
    expect(loop.logicTime).toBe(48)

    loop.tick(20) // accumulated 2 + 20 = 22ms, 1 tick
    expect(loop.logicTime).toBe(64)
  })

  it('should return interpolation alpha', () => {
    const loop = new GameLoop()
    loop.onUpdate(() => {})

    loop.tick(24) // 1 tick (16ms), remainder 8ms
    expect(loop.alpha).toBeCloseTo(8 / 16)
  })

  it('should clamp deltaTime to prevent spiral of death', () => {
    const loop = new GameLoop()
    const update = vi.fn()
    loop.onUpdate(update)

    // Simulate a huge lag spike — 1 second
    loop.tick(1000)
    // Should be clamped to max ~250ms = 15 ticks, not 62
    expect(update.mock.calls.length).toBeLessThanOrEqual(16)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/core/game-loop.test.ts
```

预期：FAIL

- [ ] **Step 3: 实现 GameLoop**

```typescript
// src/core/game-loop.ts
export const LOGIC_TICK = 16 // ms
const MAX_DELTA = 250 // prevent spiral of death

export class GameLoop {
  private accumulator = 0
  private updateFn: ((dt: number) => void) | null = null

  logicTime = 0
  alpha = 0

  onUpdate(fn: (dt: number) => void): void {
    this.updateFn = fn
  }

  tick(deltaMs: number): void {
    const clamped = Math.min(deltaMs, MAX_DELTA)
    this.accumulator += clamped

    while (this.accumulator >= LOGIC_TICK) {
      this.updateFn?.(LOGIC_TICK)
      this.logicTime += LOGIC_TICK
      this.accumulator -= LOGIC_TICK
    }

    this.alpha = this.accumulator / LOGIC_TICK
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/core/game-loop.test.ts
```

预期：全部 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/game-loop.ts src/core/game-loop.test.ts
git commit -m "feat: implement fixed timestep GameLoop"
```

---

### Task 5: 实体系统

**Files:**
- Create: `src/entity/entity.ts`
- Create: `src/entity/entity-manager.ts`
- Create: `src/entity/entity.test.ts`
- Create: `src/entity/entity-manager.test.ts`

- [ ] **Step 1: 编写 Entity 测试**

```typescript
// src/entity/entity.test.ts
import { describe, it, expect } from 'vitest'
import { createEntity } from '@/entity/entity'

describe('createEntity', () => {
  it('should create entity with defaults', () => {
    const e = createEntity({ id: 'p1', type: 'player' })
    expect(e.id).toBe('p1')
    expect(e.type).toBe('player')
    expect(e.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(e.facing).toBe(0)
    expect(e.hp).toBe(0)
    expect(e.maxHp).toBe(0)
    expect(e.alive).toBe(true)
    expect(e.inCombat).toBe(false)
    expect(e.casting).toBeNull()
    expect(e.gcdTimer).toBe(0)
    expect(e.autoAttackTimer).toBe(0)
    expect(e.target).toBeNull()
    expect(e.buffs).toEqual([])
    expect(e.skillIds).toEqual([])
  })

  it('should accept overrides', () => {
    const e = createEntity({
      id: 'b1',
      type: 'boss',
      position: { x: 10, y: 0, z: 0 },
      hp: 100000,
      maxHp: 100000,
      attack: 1,
      speed: 3,
      size: 2,
    })
    expect(e.hp).toBe(100000)
    expect(e.attack).toBe(1)
    expect(e.size).toBe(2)
    expect(e.position.x).toBe(10)
  })

  it('should compute facing quadrant', () => {
    // Entity facing north (0°), check if a point at east is "right"
    const e = createEntity({ id: 'p1', type: 'player', facing: 0 })
    expect(e.facing).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/entity/entity.test.ts
```

- [ ] **Step 3: 实现 Entity**

```typescript
// src/entity/entity.ts
import type { EntityType, Vec3 } from '@/core/types'

export interface CastState {
  skillId: string
  targetId: string | null
  elapsed: number    // ms elapsed
  castTime: number   // ms total
}

export interface BuffInstance {
  defId: string
  sourceId: string
  remaining: number  // ms remaining, 0 = permanent
  stacks: number
}

export interface Entity {
  readonly id: string
  readonly type: EntityType

  position: Vec3
  facing: number
  speed: number
  size: number

  hp: number
  maxHp: number
  attack: number

  alive: boolean
  inCombat: boolean
  casting: CastState | null
  gcdTimer: number
  autoAttackTimer: number

  target: string | null
  buffs: BuffInstance[]
  skillIds: string[]
}

export interface CreateEntityOptions {
  id: string
  type: EntityType
  position?: Vec3
  facing?: number
  speed?: number
  size?: number
  hp?: number
  maxHp?: number
  attack?: number
  skillIds?: string[]
}

export function createEntity(opts: CreateEntityOptions): Entity {
  const maxHp = opts.maxHp ?? opts.hp ?? 0
  return {
    id: opts.id,
    type: opts.type,
    position: opts.position ?? { x: 0, y: 0, z: 0 },
    facing: opts.facing ?? 0,
    speed: opts.speed ?? 5,
    size: opts.size ?? 0.5,
    hp: opts.hp ?? maxHp,
    maxHp,
    attack: opts.attack ?? 0,
    alive: true,
    inCombat: false,
    casting: null,
    gcdTimer: 0,
    autoAttackTimer: 0,
    target: null,
    buffs: [],
    skillIds: opts.skillIds ?? [],
  }
}
```

- [ ] **Step 4: 运行 Entity 测试，确认通过**

```bash
pnpm test:run src/entity/entity.test.ts
```

- [ ] **Step 5: 编写 EntityManager 测试**

```typescript
// src/entity/entity-manager.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EntityManager } from '@/entity/entity-manager'
import { EventBus } from '@/core/event-bus'

describe('EntityManager', () => {
  function setup() {
    const bus = new EventBus()
    const mgr = new EntityManager(bus)
    return { bus, mgr }
  }

  it('should create and retrieve entity', () => {
    const { mgr } = setup()
    const e = mgr.create({ id: 'p1', type: 'player', hp: 1000, maxHp: 1000 })
    expect(mgr.get('p1')).toBe(e)
  })

  it('should emit entity:created on create', () => {
    const { bus, mgr } = setup()
    const handler = vi.fn()
    bus.on('entity:created', handler)
    mgr.create({ id: 'p1', type: 'player' })
    expect(handler).toHaveBeenCalledWith({ entity: expect.objectContaining({ id: 'p1' }) })
  })

  it('should destroy entity and emit entity:died', () => {
    const { bus, mgr } = setup()
    mgr.create({ id: 'b1', type: 'boss' })
    const handler = vi.fn()
    bus.on('entity:died', handler)
    mgr.destroy('b1')
    expect(mgr.get('b1')).toBeUndefined()
    expect(handler).toHaveBeenCalled()
  })

  it('should find nearest enemy', () => {
    const { mgr } = setup()
    mgr.create({ id: 'p1', type: 'player', position: { x: 0, y: 0, z: 0 } })
    mgr.create({ id: 'b1', type: 'boss', position: { x: 10, y: 0, z: 0 } })
    mgr.create({ id: 'm1', type: 'mob', position: { x: 3, y: 0, z: 0 } })

    const nearest = mgr.findNearest('p1', (e) => e.type !== 'player' && e.alive)
    expect(nearest?.id).toBe('m1')
  })

  it('should return all entities of a type', () => {
    const { mgr } = setup()
    mgr.create({ id: 'p1', type: 'player' })
    mgr.create({ id: 'b1', type: 'boss' })
    mgr.create({ id: 'm1', type: 'mob' })
    mgr.create({ id: 'm2', type: 'mob' })

    const mobs = mgr.getByType('mob')
    expect(mobs).toHaveLength(2)
  })

  it('should return all alive entities', () => {
    const { mgr } = setup()
    const e1 = mgr.create({ id: 'p1', type: 'player' })
    const e2 = mgr.create({ id: 'm1', type: 'mob' })
    e2.alive = false
    expect(mgr.getAlive()).toHaveLength(1)
    expect(mgr.getAlive()[0].id).toBe('p1')
  })
})
```

- [ ] **Step 6: 实现 EntityManager**

```typescript
// src/entity/entity-manager.ts
import type { EntityType } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import { createEntity, type CreateEntityOptions, type Entity } from './entity'

function distanceSq(a: Entity, b: Entity): number {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  return dx * dx + dy * dy
}

export class EntityManager {
  private entities = new Map<string, Entity>()

  constructor(private bus: EventBus) {}

  create(opts: CreateEntityOptions): Entity {
    const entity = createEntity(opts)
    this.entities.set(entity.id, entity)
    this.bus.emit('entity:created', { entity })
    return entity
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  destroy(id: string): void {
    const entity = this.entities.get(id)
    if (!entity) return
    entity.alive = false
    this.entities.delete(id)
    this.bus.emit('entity:died', { entity })
  }

  getAll(): Entity[] {
    return [...this.entities.values()]
  }

  getAlive(): Entity[] {
    return this.getAll().filter((e) => e.alive)
  }

  getByType(type: EntityType): Entity[] {
    return this.getAll().filter((e) => e.type === type)
  }

  findNearest(fromId: string, filter: (e: Entity) => boolean): Entity | null {
    const from = this.entities.get(fromId)
    if (!from) return null

    let nearest: Entity | null = null
    let nearestDistSq = Infinity

    for (const entity of this.entities.values()) {
      if (entity.id === fromId) continue
      if (!filter(entity)) continue
      const dSq = distanceSq(from, entity)
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq
        nearest = entity
      }
    }
    return nearest
  }
}
```

- [ ] **Step 7: 运行所有 Entity 测试**

```bash
pnpm test:run src/entity/
```

预期：全部 passed

- [ ] **Step 8: Commit**

```bash
git add src/entity/
git commit -m "feat: implement Entity and EntityManager with lifecycle and queries"
```

---

### Task 6: 几何判定 + 场地系统

**Files:**
- Create: `src/arena/geometry.ts`
- Create: `src/arena/arena.ts`
- Create: `src/arena/geometry.test.ts`
- Create: `src/arena/arena.test.ts`

- [ ] **Step 1: 编写几何判定测试**

```typescript
// src/arena/geometry.test.ts
import { describe, it, expect } from 'vitest'
import { pointInCircle, pointInRect, pointInFan, pointInRing } from '@/arena/geometry'

describe('geometry', () => {
  describe('pointInCircle', () => {
    it('should return true for point inside', () => {
      expect(pointInCircle({ x: 1, y: 1 }, { x: 0, y: 0 }, 5)).toBe(true)
    })
    it('should return false for point outside', () => {
      expect(pointInCircle({ x: 10, y: 0 }, { x: 0, y: 0 }, 5)).toBe(false)
    })
    it('should return true for point on edge', () => {
      expect(pointInCircle({ x: 5, y: 0 }, { x: 0, y: 0 }, 5)).toBe(true)
    })
  })

  describe('pointInRect', () => {
    // rect centered at origin, length=10 (along facing), width=4, facing north (0°)
    it('should return true for point inside', () => {
      expect(pointInRect({ x: 0, y: 3 }, { x: 0, y: 0 }, 10, 4, 0)).toBe(true)
    })
    it('should return false for point outside width', () => {
      expect(pointInRect({ x: 5, y: 3 }, { x: 0, y: 0 }, 10, 4, 0)).toBe(false)
    })
    it('should return false for point behind', () => {
      expect(pointInRect({ x: 0, y: -3 }, { x: 0, y: 0 }, 10, 4, 0)).toBe(false)
    })
    it('should work with rotated facing', () => {
      // facing east (90°), length=10, width=4
      expect(pointInRect({ x: 5, y: 0 }, { x: 0, y: 0 }, 10, 4, 90)).toBe(true)
      expect(pointInRect({ x: 0, y: 5 }, { x: 0, y: 0 }, 10, 4, 90)).toBe(false)
    })
  })

  describe('pointInFan', () => {
    it('should return true for point inside fan', () => {
      // fan centered at origin, radius 10, angle 90° (±45°), facing north (0°)
      expect(pointInFan({ x: 0, y: 5 }, { x: 0, y: 0 }, 10, 90, 0)).toBe(true)
    })
    it('should return false for point outside angle', () => {
      expect(pointInFan({ x: 10, y: 0 }, { x: 0, y: 0 }, 10, 90, 0)).toBe(false)
    })
    it('should return false for point outside radius', () => {
      expect(pointInFan({ x: 0, y: 15 }, { x: 0, y: 0 }, 10, 90, 0)).toBe(false)
    })
    it('should handle 180° fan (half circle)', () => {
      // facing north (0°), 180° fan covers left half
      expect(pointInFan({ x: -5, y: 5 }, { x: 0, y: 0 }, 10, 180, 0)).toBe(true)
      expect(pointInFan({ x: 0, y: -5 }, { x: 0, y: 0 }, 10, 180, 0)).toBe(false)
    })
  })

  describe('pointInRing', () => {
    it('should return true for point between radii', () => {
      expect(pointInRing({ x: 7, y: 0 }, { x: 0, y: 0 }, 5, 10)).toBe(true)
    })
    it('should return false for point inside inner radius', () => {
      expect(pointInRing({ x: 3, y: 0 }, { x: 0, y: 0 }, 5, 10)).toBe(false)
    })
    it('should return false for point outside outer radius', () => {
      expect(pointInRing({ x: 12, y: 0 }, { x: 0, y: 0 }, 5, 10)).toBe(false)
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/arena/geometry.test.ts
```

- [ ] **Step 3: 实现几何判定函数**

```typescript
// src/arena/geometry.ts
import type { Vec2 } from '@/core/types'

const DEG2RAD = Math.PI / 180

function distanceSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function pointInCircle(point: Vec2, center: Vec2, radius: number): boolean {
  return distanceSq(point, center) <= radius * radius
}

export function pointInRing(
  point: Vec2,
  center: Vec2,
  innerRadius: number,
  outerRadius: number,
): boolean {
  const dSq = distanceSq(point, center)
  return dSq >= innerRadius * innerRadius && dSq <= outerRadius * outerRadius
}

export function pointInFan(
  point: Vec2,
  center: Vec2,
  radius: number,
  angleDeg: number,
  facingDeg: number,
): boolean {
  const dSq = distanceSq(point, center)
  if (dSq > radius * radius) return false

  const dx = point.x - center.x
  const dy = point.y - center.y
  // atan2: angle from center to point, 0° = up (+y), clockwise
  const angleToPoint = ((Math.atan2(dx, dy) / DEG2RAD) + 360) % 360
  const facingNorm = ((facingDeg % 360) + 360) % 360

  let diff = Math.abs(angleToPoint - facingNorm)
  if (diff > 180) diff = 360 - diff

  return diff <= angleDeg / 2
}

export function pointInRect(
  point: Vec2,
  center: Vec2,
  length: number,
  width: number,
  facingDeg: number,
): boolean {
  const rad = facingDeg * DEG2RAD
  const sin = Math.sin(rad)
  const cos = Math.cos(rad)

  // Transform point to local coordinates (facing = +y axis)
  const dx = point.x - center.x
  const dy = point.y - center.y
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos

  // rect extends from 0 to length along facing, ±width/2 perpendicular
  return localY >= 0 && localY <= length && Math.abs(localX) <= width / 2
}
```

- [ ] **Step 4: 运行几何测试，确认通过**

```bash
pnpm test:run src/arena/geometry.test.ts
```

- [ ] **Step 5: 编写 Arena 测试**

```typescript
// src/arena/arena.test.ts
import { describe, it, expect } from 'vitest'
import { Arena } from '@/arena/arena'
import type { ArenaDef } from '@/core/types'

describe('Arena', () => {
  it('should detect point inside circle arena', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'circle', radius: 20 }, boundary: 'lethal' }
    const arena = new Arena(def)
    expect(arena.isInBounds({ x: 0, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 19, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 21, y: 0 })).toBe(false)
  })

  it('should detect point inside rect arena', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'rect', width: 40, height: 30 }, boundary: 'wall' }
    const arena = new Arena(def)
    expect(arena.isInBounds({ x: 0, y: 0 })).toBe(true)
    expect(arena.isInBounds({ x: 19, y: 14 })).toBe(true)
    expect(arena.isInBounds({ x: 21, y: 0 })).toBe(false)
  })

  it('should clamp position for wall boundary', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'circle', radius: 10 }, boundary: 'wall' }
    const arena = new Arena(def)
    const clamped = arena.clampPosition({ x: 20, y: 0 })
    expect(clamped.x).toBeCloseTo(10)
    expect(clamped.y).toBeCloseTo(0)
  })

  it('should clamp position for rect wall boundary', () => {
    const def: ArenaDef = { name: 'test', shape: { type: 'rect', width: 20, height: 10 }, boundary: 'wall' }
    const arena = new Arena(def)
    const clamped = arena.clampPosition({ x: 15, y: 8 })
    expect(clamped.x).toBeCloseTo(10)
    expect(clamped.y).toBeCloseTo(5)
  })
})
```

- [ ] **Step 6: 实现 Arena**

```typescript
// src/arena/arena.ts
import type { ArenaDef, Vec2 } from '@/core/types'

export class Arena {
  constructor(readonly def: ArenaDef) {}

  isInBounds(point: Vec2): boolean {
    const { shape } = this.def
    if (shape.type === 'circle') {
      return point.x * point.x + point.y * point.y <= shape.radius * shape.radius
    }
    // rect: centered at origin
    const hw = shape.width / 2
    const hh = shape.height / 2
    return Math.abs(point.x) <= hw && Math.abs(point.y) <= hh
  }

  clampPosition(point: Vec2): Vec2 {
    const { shape } = this.def
    if (shape.type === 'circle') {
      const dist = Math.sqrt(point.x * point.x + point.y * point.y)
      if (dist <= shape.radius) return point
      const scale = shape.radius / dist
      return { x: point.x * scale, y: point.y * scale }
    }
    const hw = shape.width / 2
    const hh = shape.height / 2
    return {
      x: Math.max(-hw, Math.min(hw, point.x)),
      y: Math.max(-hh, Math.min(hh, point.y)),
    }
  }
}
```

- [ ] **Step 7: 运行所有 Arena 测试**

```bash
pnpm test:run src/arena/
```

预期：全部 passed

- [ ] **Step 8: Commit**

```bash
git add src/arena/
git commit -m "feat: implement geometry hit detection and Arena boundary system"
```

---

### Task 7: 伤害计算器

**Files:**
- Create: `src/combat/damage.ts`
- Create: `src/combat/damage.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/combat/damage.test.ts
import { describe, it, expect } from 'vitest'
import { calculateDamage } from '@/combat/damage'

describe('calculateDamage', () => {
  it('should compute base damage: attack × potency', () => {
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [], mitigations: [] })).toBe(2000)
  })

  it('should apply boss convention: attack=1, potency=damage', () => {
    expect(calculateDamage({ attack: 1, potency: 8000, increases: [], mitigations: [] })).toBe(8000)
  })

  it('should apply additive damage increases', () => {
    // 1000 × 2 × (1 + 0.5 + 0.3) = 3600
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [0.5, 0.3], mitigations: [] })).toBe(3600)
  })

  it('should apply multiplicative mitigations', () => {
    // 8000 × (1 - 0.8) × (1 - 0.2) = 8000 × 0.2 × 0.8 = 1280
    expect(calculateDamage({ attack: 1, potency: 8000, increases: [], mitigations: [0.8, 0.2] })).toBe(1280)
  })

  it('should apply increases then mitigations', () => {
    // raw = 1000 × 2 = 2000
    // amplified = 2000 × (1 + 0.5) = 3000
    // final = 3000 × (1 - 0.2) = 2400
    expect(calculateDamage({ attack: 1000, potency: 2, increases: [0.5], mitigations: [0.2] })).toBe(2400)
  })

  it('should floor the result to integer', () => {
    // 1000 × 1.5 × (1 - 0.3) = 1050
    // But with different numbers that produce a float:
    // 100 × 3 × (1 - 0.1) = 270
    expect(calculateDamage({ attack: 100, potency: 3, increases: [], mitigations: [0.1] })).toBe(270)
  })

  it('should never return negative', () => {
    expect(calculateDamage({ attack: 1, potency: 100, increases: [], mitigations: [0.99, 0.99] })).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/combat/damage.test.ts
```

- [ ] **Step 3: 实现伤害计算**

```typescript
// src/combat/damage.ts
export interface DamageParams {
  attack: number
  potency: number
  increases: number[]   // e.g. [0.3, 0.5] = +30% +50%
  mitigations: number[] // e.g. [0.2, 0.8] = 20% and 80% reduction
}

export function calculateDamage(params: DamageParams): number {
  const { attack, potency, increases, mitigations } = params

  const raw = attack * potency

  const increaseSum = increases.reduce((sum, v) => sum + v, 0)
  const amplified = raw * (1 + increaseSum)

  const mitigated = mitigations.reduce((dmg, v) => dmg * (1 - v), amplified)

  return Math.max(0, Math.floor(mitigated))
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/combat/damage.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/combat/damage.ts src/combat/damage.test.ts
git commit -m "feat: implement damage calculator with additive increases and multiplicative mitigations"
```

---

### Task 8: Buff/Debuff 系统

**Files:**
- Create: `src/combat/buff.ts`
- Create: `src/combat/buff.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/combat/buff.test.ts
import { describe, it, expect, vi } from 'vitest'
import { BuffSystem } from '@/combat/buff'
import { EventBus } from '@/core/event-bus'
import { createEntity } from '@/entity/entity'
import type { BuffDef } from '@/core/types'

const mitBuff: BuffDef = {
  id: 'shield',
  name: 'Shield',
  type: 'buff',
  duration: 10000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'mitigation', value: 0.2 }],
}

const dotDebuff: BuffDef = {
  id: 'poison',
  name: 'Poison',
  type: 'debuff',
  duration: 6000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'dot', potency: 100, interval: 3000 }],
}

const silenceDebuff: BuffDef = {
  id: 'silence',
  name: 'Silence',
  type: 'debuff',
  duration: 5000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'silence' }],
}

describe('BuffSystem', () => {
  function setup() {
    const bus = new EventBus()
    const system = new BuffSystem(bus)
    const entity = createEntity({ id: 'p1', type: 'player', hp: 10000, maxHp: 10000, attack: 100 })
    return { bus, system, entity }
  }

  it('should apply buff and emit event', () => {
    const { bus, system, entity } = setup()
    const handler = vi.fn()
    bus.on('buff:applied', handler)

    system.applyBuff(entity, mitBuff, 'source1')

    expect(entity.buffs).toHaveLength(1)
    expect(entity.buffs[0].defId).toBe('shield')
    expect(handler).toHaveBeenCalled()
  })

  it('should tick down buff duration', () => {
    const { system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    system.update(entity, 5000)
    expect(entity.buffs).toHaveLength(1)
    expect(entity.buffs[0].remaining).toBe(5000)
  })

  it('should remove expired buff and emit event', () => {
    const { bus, system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    const handler = vi.fn()
    bus.on('buff:removed', handler)

    system.update(entity, 10000)
    expect(entity.buffs).toHaveLength(0)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      target: entity,
      reason: 'expired',
    }))
  })

  it('should collect mitigations from active buffs', () => {
    const { system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    expect(system.getMitigations(entity)).toEqual([0.2])
  })

  it('should collect damage increases from active buffs', () => {
    const { system, entity } = setup()
    const dmgBuff: BuffDef = {
      id: 'dmgup', name: 'DmgUp', type: 'buff', duration: 5000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.3 }],
    }
    system.applyBuff(entity, dmgBuff, 'source1')
    expect(system.getDamageIncreases(entity)).toEqual([0.3])
  })

  it('should detect silence', () => {
    const { system, entity } = setup()
    expect(system.isSilenced(entity)).toBe(false)
    system.applyBuff(entity, silenceDebuff, 'source1')
    expect(system.isSilenced(entity)).toBe(true)
  })

  it('should detect stun', () => {
    const { system, entity } = setup()
    const stunDebuff: BuffDef = {
      id: 'stun', name: 'Stun', type: 'debuff', duration: 3000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'stun' }],
    }
    expect(system.isStunned(entity)).toBe(false)
    system.applyBuff(entity, stunDebuff, 'source1')
    expect(system.isStunned(entity)).toBe(true)
  })

  it('should get effective speed modifier', () => {
    const { system, entity } = setup()
    const speedBuff: BuffDef = {
      id: 'sprint', name: 'Sprint', type: 'buff', duration: 10000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'speed_modify', value: 0.5 }],
    }
    const slowDebuff: BuffDef = {
      id: 'slow', name: 'Slow', type: 'debuff', duration: 10000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'speed_modify', value: -0.3 }],
    }
    system.applyBuff(entity, speedBuff, 's1')
    system.applyBuff(entity, slowDebuff, 's2')

    // Speed increases: only take highest = 0.5
    // Speed decreases: sum = -0.3
    // Total modifier = 0.5 + (-0.3) = 0.2
    expect(system.getSpeedModifier(entity)).toBeCloseTo(0.2)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/combat/buff.test.ts
```

- [ ] **Step 3: 实现 BuffSystem**

```typescript
// src/combat/buff.ts
import type { BuffDef, BuffEffectDef } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { Entity, BuffInstance } from '@/entity/entity'

export class BuffSystem {
  private defs = new Map<string, BuffDef>()

  constructor(private bus: EventBus) {}

  registerDef(def: BuffDef): void {
    this.defs.set(def.id, def)
  }

  applyBuff(entity: Entity, def: BuffDef, sourceId: string): void {
    this.registerDef(def)

    const existing = entity.buffs.find((b) => b.defId === def.id)
    if (existing && !def.stackable) {
      // Refresh duration
      existing.remaining = def.duration
      existing.sourceId = sourceId
      return
    }
    if (existing && def.stackable && existing.stacks < def.maxStacks) {
      existing.stacks++
      existing.remaining = def.duration
      return
    }

    entity.buffs.push({
      defId: def.id,
      sourceId,
      remaining: def.duration,
      stacks: 1,
    })

    this.bus.emit('buff:applied', { target: entity, buff: def, source: sourceId })
  }

  removeBuff(entity: Entity, defId: string, reason: string): void {
    const idx = entity.buffs.findIndex((b) => b.defId === defId)
    if (idx === -1) return
    entity.buffs.splice(idx, 1)
    this.bus.emit('buff:removed', { target: entity, buff: this.defs.get(defId), reason })
  }

  update(entity: Entity, dt: number): void {
    for (let i = entity.buffs.length - 1; i >= 0; i--) {
      const inst = entity.buffs[i]
      if (inst.remaining === 0) continue // permanent
      inst.remaining = Math.max(0, inst.remaining - dt)
      if (inst.remaining <= 0) {
        entity.buffs.splice(i, 1)
        this.bus.emit('buff:removed', {
          target: entity,
          buff: this.defs.get(inst.defId),
          reason: 'expired',
        })
      }
    }
  }

  private collectEffects(entity: Entity): { def: BuffDef; inst: BuffInstance; effect: BuffEffectDef }[] {
    const result: { def: BuffDef; inst: BuffInstance; effect: BuffEffectDef }[] = []
    for (const inst of entity.buffs) {
      const def = this.defs.get(inst.defId)
      if (!def) continue
      for (const effect of def.effects) {
        result.push({ def, inst, effect })
      }
    }
    return result
  }

  getMitigations(entity: Entity): number[] {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'mitigation')
      .map((e) => (e.effect as { type: 'mitigation'; value: number }).value)
  }

  getDamageIncreases(entity: Entity): number[] {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'damage_increase')
      .map((e) => (e.effect as { type: 'damage_increase'; value: number }).value)
  }

  isSilenced(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'silence')
  }

  isStunned(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'stun')
  }

  getSpeedModifier(entity: Entity): number {
    const mods = this.collectEffects(entity)
      .filter((e) => e.effect.type === 'speed_modify')
      .map((e) => (e.effect as { type: 'speed_modify'; value: number }).value)

    const increases = mods.filter((v) => v > 0)
    const decreases = mods.filter((v) => v < 0)

    // Only take highest increase, sum all decreases
    const maxIncrease = increases.length > 0 ? Math.max(...increases) : 0
    const totalDecrease = decreases.reduce((sum, v) => sum + v, 0)

    return maxIncrease + totalDecrease
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/combat/buff.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/combat/buff.ts src/combat/buff.test.ts
git commit -m "feat: implement BuffSystem with duration tracking, speed modifiers, silence/stun"
```

---

### Task 9: AOE 形状命中判定

**Files:**
- Create: `src/skill/aoe-shape.ts`
- Create: `src/skill/aoe-shape.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/skill/aoe-shape.test.ts
import { describe, it, expect } from 'vitest'
import { isPointInAoeShape } from '@/skill/aoe-shape'
import type { AoeShapeDef, Vec2 } from '@/core/types'

describe('isPointInAoeShape', () => {
  const origin: Vec2 = { x: 0, y: 0 }

  it('circle: inside', () => {
    const shape: AoeShapeDef = { type: 'circle', radius: 5 }
    expect(isPointInAoeShape({ x: 3, y: 0 }, origin, shape, 0)).toBe(true)
  })

  it('circle: outside', () => {
    const shape: AoeShapeDef = { type: 'circle', radius: 5 }
    expect(isPointInAoeShape({ x: 6, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('fan: inside', () => {
    const shape: AoeShapeDef = { type: 'fan', radius: 10, angle: 90 }
    expect(isPointInAoeShape({ x: 0, y: 5 }, origin, shape, 0)).toBe(true)
  })

  it('fan: outside angle', () => {
    const shape: AoeShapeDef = { type: 'fan', radius: 10, angle: 90 }
    expect(isPointInAoeShape({ x: 10, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('ring: inside ring', () => {
    const shape: AoeShapeDef = { type: 'ring', innerRadius: 5, outerRadius: 10 }
    expect(isPointInAoeShape({ x: 7, y: 0 }, origin, shape, 0)).toBe(true)
  })

  it('ring: inside hole', () => {
    const shape: AoeShapeDef = { type: 'ring', innerRadius: 5, outerRadius: 10 }
    expect(isPointInAoeShape({ x: 3, y: 0 }, origin, shape, 0)).toBe(false)
  })

  it('rect: inside', () => {
    const shape: AoeShapeDef = { type: 'rect', length: 10, width: 4 }
    expect(isPointInAoeShape({ x: 0, y: 5 }, origin, shape, 0)).toBe(true)
  })

  it('rect: outside', () => {
    const shape: AoeShapeDef = { type: 'rect', length: 10, width: 4 }
    expect(isPointInAoeShape({ x: 5, y: 5 }, origin, shape, 0)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/skill/aoe-shape.test.ts
```

- [ ] **Step 3: 实现**

```typescript
// src/skill/aoe-shape.ts
import type { AoeShapeDef, Vec2 } from '@/core/types'
import { pointInCircle, pointInFan, pointInRing, pointInRect } from '@/arena/geometry'

export function isPointInAoeShape(
  point: Vec2,
  center: Vec2,
  shape: AoeShapeDef,
  facingDeg: number,
): boolean {
  switch (shape.type) {
    case 'circle':
      return pointInCircle(point, center, shape.radius)
    case 'fan':
      return pointInFan(point, center, shape.radius, shape.angle, facingDeg)
    case 'ring':
      return pointInRing(point, center, shape.innerRadius, shape.outerRadius)
    case 'rect':
      return pointInRect(point, center, shape.length, shape.width, facingDeg)
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/skill/aoe-shape.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/skill/aoe-shape.ts src/skill/aoe-shape.test.ts
git commit -m "feat: implement AoE shape hit detection (circle, fan, ring, rect)"
```

---

### Task 10: AoeZone 生命周期管理

**Files:**
- Create: `src/skill/aoe-zone.ts`
- Create: `src/skill/aoe-zone.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/skill/aoe-zone.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AoeZoneManager, type ActiveAoeZone } from '@/skill/aoe-zone'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import type { AoeZoneDef } from '@/core/types'

function makeCircleZone(overrides?: Partial<AoeZoneDef>): AoeZoneDef {
  return {
    anchor: { type: 'position', x: 0, y: 0 },
    direction: { type: 'none' },
    shape: { type: 'circle', radius: 5 },
    telegraphDuration: 2000,
    resolveDelay: 3000,
    hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 1000 }],
    ...overrides,
  }
}

describe('AoeZoneManager', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const zoneMgr = new AoeZoneManager(bus, entityMgr)
    return { bus, entityMgr, zoneMgr }
  }

  it('should create zone and emit aoe:zone_created', () => {
    const { bus, zoneMgr } = setup()
    const handler = vi.fn()
    bus.on('aoe:zone_created', handler)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('should resolve zone after resolveDelay and emit aoe:zone_resolved', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 2, y: 0, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)

    // Not yet resolved
    zoneMgr.update(2000)
    expect(resolved).not.toHaveBeenCalled()

    // Resolve at 3000ms
    zoneMgr.update(1000)
    expect(resolved).toHaveBeenCalledOnce()
    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(1)
    expect(resolved.mock.calls[0][0].hitEntities[0].id).toBe('p1')
  })

  it('should not hit entities outside the zone', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 20, y: 0, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    zoneMgr.update(3000)

    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(0)
  })

  it('should remove zone after resolve + hitEffectDuration and emit aoe:zone_removed', () => {
    const { bus, zoneMgr } = setup()
    const removed = vi.fn()
    bus.on('aoe:zone_removed', removed)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    zoneMgr.update(3000) // resolve
    zoneMgr.update(500)  // hitEffect done
    expect(removed).toHaveBeenCalledOnce()
  })

  it('should resolve anchor type "caster" at caster position', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    const caster = entityMgr.create({ id: 'boss', type: 'boss', position: { x: 5, y: 5, z: 0 } })
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 6, y: 5, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    const zone = makeCircleZone({
      anchor: { type: 'caster' },
      shape: { type: 'circle', radius: 3 },
    })

    zoneMgr.spawn(zone, 'skill1', caster.position, caster.facing, null)
    zoneMgr.update(3000)

    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(1)
    expect(resolved.mock.calls[0][0].hitEntities[0].id).toBe('p1')
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/skill/aoe-zone.test.ts
```

- [ ] **Step 3: 实现 AoeZoneManager**

```typescript
// src/skill/aoe-zone.ts
import type { AoeZoneDef, Vec2 } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { Entity } from '@/entity/entity'
import { isPointInAoeShape } from './aoe-shape'

export interface ActiveAoeZone {
  id: string
  def: AoeZoneDef
  skillId: string
  center: Vec2
  facing: number
  elapsed: number
  resolved: boolean
}

let nextZoneId = 0

export class AoeZoneManager {
  private zones: ActiveAoeZone[] = []

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
  ) {}

  spawn(
    def: AoeZoneDef,
    skillId: string,
    casterPos: Vec2,
    casterFacing: number,
    targetPos: Vec2 | null,
  ): ActiveAoeZone {
    const center = this.resolveAnchor(def.anchor, casterPos, targetPos)
    const facing = this.resolveDirection(def.direction, casterFacing, center, targetPos)

    const zone: ActiveAoeZone = {
      id: `zone_${nextZoneId++}`,
      def,
      skillId,
      center,
      facing,
      elapsed: 0,
      resolved: false,
    }

    this.zones.push(zone)
    this.bus.emit('aoe:zone_created', { zone, skill: skillId })
    return zone
  }

  update(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i]
      zone.elapsed += dt

      if (!zone.resolved && zone.elapsed >= zone.def.resolveDelay) {
        this.resolve(zone)
      }

      if (zone.resolved && zone.elapsed >= zone.def.resolveDelay + zone.def.hitEffectDuration) {
        this.zones.splice(i, 1)
        this.bus.emit('aoe:zone_removed', { zone })
      }
    }
  }

  private resolve(zone: ActiveAoeZone): void {
    zone.resolved = true
    const hitEntities: Entity[] = []

    for (const entity of this.entityMgr.getAlive()) {
      const point: Vec2 = { x: entity.position.x, y: entity.position.y }
      if (isPointInAoeShape(point, zone.center, zone.def.shape, zone.facing)) {
        hitEntities.push(entity)
      }
    }

    this.bus.emit('aoe:zone_resolved', { zone, hitEntities })
  }

  private resolveAnchor(anchor: AoeZoneDef['anchor'], casterPos: Vec2, targetPos: Vec2 | null): Vec2 {
    switch (anchor.type) {
      case 'caster':
        return { ...casterPos }
      case 'target':
      case 'target_live':
        return targetPos ? { ...targetPos } : { ...casterPos }
      case 'position':
        return { x: anchor.x, y: anchor.y }
    }
  }

  private resolveDirection(
    dir: AoeZoneDef['direction'],
    casterFacing: number,
    center: Vec2,
    targetPos: Vec2 | null,
  ): number {
    switch (dir.type) {
      case 'caster_facing':
        return casterFacing
      case 'toward_target': {
        if (!targetPos) return casterFacing
        const dx = targetPos.x - center.x
        const dy = targetPos.y - center.y
        return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      }
      case 'fixed':
        return dir.angle
      case 'none':
        return 0
    }
  }

  getActiveZones(): readonly ActiveAoeZone[] {
    return this.zones
  }
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pnpm test:run src/skill/aoe-zone.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/skill/aoe-zone.ts src/skill/aoe-zone.test.ts
git commit -m "feat: implement AoeZoneManager with spawn, resolve, and hit detection lifecycle"
```

---

### Task 11: 技能释放系统

**Files:**
- Create: `src/skill/skill-resolver.ts`
- Create: `src/skill/skill-resolver.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/skill/skill-resolver.test.ts
import { describe, it, expect, vi } from 'vitest'
import { SkillResolver, GCD_DURATION } from '@/skill/skill-resolver'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { AoeZoneManager } from '@/skill/aoe-zone'
import type { SkillDef } from '@/core/types'

const weaponskill: SkillDef = {
  id: 'slash', name: 'Slash', type: 'weaponskill',
  castTime: 0, cooldown: 0, gcd: true,
  targetType: 'single', range: 5,
  effects: [{ type: 'damage', potency: 2 }],
}

const spell: SkillDef = {
  id: 'fire1', name: 'Fire I', type: 'spell',
  castTime: 2500, cooldown: 0, gcd: true,
  targetType: 'single', range: 25,
  effects: [{ type: 'damage', potency: 3 }],
}

const ability: SkillDef = {
  id: 'berserk', name: 'Berserk', type: 'ability',
  castTime: 0, cooldown: 60000, gcd: false,
  targetType: 'single', range: 0,
  effects: [{ type: 'apply_buff', buffId: 'berserk_buff' }],
}

describe('SkillResolver', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const buffSystem = new BuffSystem(bus)
    const zoneMgr = new AoeZoneManager(bus, entityMgr)
    const resolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)

    const player = entityMgr.create({
      id: 'p1', type: 'player',
      hp: 10000, maxHp: 10000, attack: 1000,
      position: { x: 0, y: 0, z: 0 },
    })
    const boss = entityMgr.create({
      id: 'b1', type: 'boss',
      hp: 100000, maxHp: 100000, attack: 1,
      position: { x: 3, y: 0, z: 0 },
    })
    player.target = 'b1'
    player.inCombat = true

    return { bus, entityMgr, buffSystem, zoneMgr, resolver, player, boss }
  }

  it('should export GCD_DURATION as 2500', () => {
    expect(GCD_DURATION).toBe(2500)
  })

  describe('weaponskill', () => {
    it('should cast immediately and trigger GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_complete', handler)

      const result = resolver.tryUse(player, weaponskill)
      expect(result).toBe(true)
      expect(handler).toHaveBeenCalled()
      expect(player.gcdTimer).toBe(GCD_DURATION)
    })

    it('should fail if GCD is active', () => {
      const { resolver, player } = setup()
      player.gcdTimer = 1000
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })

    it('should fail if target out of range', () => {
      const { resolver, player, boss } = setup()
      boss.position = { x: 100, y: 0, z: 0 }
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })
  })

  describe('spell (cast time)', () => {
    it('should start casting and trigger GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_start', handler)

      const result = resolver.tryUse(player, spell)
      expect(result).toBe(true)
      expect(player.casting).not.toBeNull()
      expect(player.casting!.skillId).toBe('fire1')
      expect(player.gcdTimer).toBe(GCD_DURATION)
      expect(handler).toHaveBeenCalled()
    })

    it('should complete cast after castTime elapses', () => {
      const { bus, resolver, player } = setup()
      const complete = vi.fn()
      bus.on('skill:cast_complete', complete)

      resolver.tryUse(player, spell)
      resolver.update(player, 2500)

      expect(complete).toHaveBeenCalled()
      expect(player.casting).toBeNull()
    })

    it('should fail cast if target moves out of range during cast', () => {
      const { bus, resolver, player, boss } = setup()
      const interrupted = vi.fn()
      bus.on('skill:cast_interrupted', interrupted)

      resolver.tryUse(player, spell)
      boss.position = { x: 100, y: 0, z: 0 } // move out of range
      resolver.update(player, 2500)

      // Cast completes but second validation fails
      expect(interrupted).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'out_of_range' }),
      )
    })
  })

  describe('ability', () => {
    it('should not trigger GCD', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, ability)
      expect(player.gcdTimer).toBe(0)
    })

    it('should be usable during GCD', () => {
      const { resolver, player } = setup()
      player.gcdTimer = 1000
      expect(resolver.tryUse(player, ability)).toBe(true)
    })

    it('should track independent cooldown', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, ability)
      expect(resolver.tryUse(player, ability)).toBe(false) // on CD

      resolver.updateCooldowns(player, 60000)
      expect(resolver.tryUse(player, ability)).toBe(true) // CD expired
    })

    it('should not be usable during casting', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, spell) // start casting
      expect(resolver.tryUse(player, ability)).toBe(false)
    })
  })

  describe('GCD tick down', () => {
    it('should decrease gcdTimer over time', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, weaponskill)
      expect(player.gcdTimer).toBe(GCD_DURATION)

      resolver.update(player, 1000)
      expect(player.gcdTimer).toBe(GCD_DURATION - 1000)

      resolver.update(player, 1500)
      expect(player.gcdTimer).toBe(0)
    })
  })

  describe('interrupt', () => {
    it('should interrupt casting and reset GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_interrupted', handler)

      resolver.tryUse(player, spell)
      resolver.interruptCast(player)

      expect(player.casting).toBeNull()
      expect(player.gcdTimer).toBe(0)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'interrupted' }),
      )
    })
  })

  describe('silence', () => {
    it('should block weaponskill when silenced', () => {
      const { resolver, player, buffSystem } = setup()
      const silenceBuff = {
        id: 'silence', name: 'Silence', type: 'debuff' as const,
        duration: 5000, stackable: false, maxStacks: 1,
        effects: [{ type: 'silence' as const }],
      }
      buffSystem.applyBuff(player, silenceBuff, 'b1')
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })

    it('should not block ability when silenced', () => {
      const { resolver, player, buffSystem } = setup()
      const silenceBuff = {
        id: 'silence', name: 'Silence', type: 'debuff' as const,
        duration: 5000, stackable: false, maxStacks: 1,
        effects: [{ type: 'silence' as const }],
      }
      buffSystem.applyBuff(player, silenceBuff, 'b1')
      expect(resolver.tryUse(player, ability)).toBe(true)
    })
  })
})
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test:run src/skill/skill-resolver.test.ts
```

- [ ] **Step 3: 实现 SkillResolver**

```typescript
// src/skill/skill-resolver.ts
import type { SkillDef, Vec2 } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { AoeZoneManager } from '@/skill/aoe-zone'
import type { Entity } from '@/entity/entity'

export const GCD_DURATION = 2500 // ms

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export class SkillResolver {
  /** entity id → skill id → remaining cooldown ms */
  private cooldowns = new Map<string, Map<string, number>>()
  private skillDefs = new Map<string, SkillDef>()

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
    private buffSystem: BuffSystem,
    private zoneMgr: AoeZoneManager,
  ) {}

  registerSkill(def: SkillDef): void {
    this.skillDefs.set(def.id, def)
  }

  tryUse(caster: Entity, skill: SkillDef): boolean {
    this.registerSkill(skill)

    // Stunned: block everything
    if (this.buffSystem.isStunned(caster)) return false

    // Casting: block everything
    if (caster.casting) return false

    // Silence blocks weaponskills and spells
    if (skill.type !== 'ability' && this.buffSystem.isSilenced(caster)) return false

    // GCD check (only for weaponskills and spells)
    if (skill.gcd && caster.gcdTimer > 0) return false

    // Independent cooldown check (for abilities)
    if (skill.cooldown > 0 && this.getCooldown(caster.id, skill.id) > 0) return false

    // Range check for targeted skills
    if (skill.range > 0 && skill.targetType === 'single') {
      const target = caster.target ? this.entityMgr.get(caster.target) : null
      if (!target || !target.alive) return false
      if (distance(caster.position, target.position) > skill.range) return false
    }

    // Execute
    if (skill.type === 'spell' && skill.castTime > 0) {
      return this.startCast(caster, skill)
    }
    return this.resolveImmediate(caster, skill)
  }

  private startCast(caster: Entity, skill: SkillDef): boolean {
    caster.casting = {
      skillId: skill.id,
      targetId: caster.target,
      elapsed: 0,
      castTime: skill.castTime,
    }

    if (skill.gcd) {
      caster.gcdTimer = GCD_DURATION
    }

    this.bus.emit('skill:cast_start', { caster, skill, target: caster.target })
    return true
  }

  private resolveImmediate(caster: Entity, skill: SkillDef): boolean {
    if (skill.gcd) {
      caster.gcdTimer = GCD_DURATION
    }

    if (skill.cooldown > 0) {
      this.setCooldown(caster.id, skill.id, skill.cooldown)
    }

    // Spawn AoE zones
    if (skill.zones && skill.zones.length > 0) {
      const targetEntity = caster.target ? this.entityMgr.get(caster.target) : null
      const targetPos: Vec2 | null = targetEntity
        ? { x: targetEntity.position.x, y: targetEntity.position.y }
        : null

      for (const zoneDef of skill.zones) {
        this.zoneMgr.spawn(
          zoneDef,
          skill.id,
          { x: caster.position.x, y: caster.position.y },
          caster.facing,
          targetPos,
        )
      }
    }

    this.bus.emit('skill:cast_complete', { caster, skill })
    return true
  }

  interruptCast(entity: Entity): void {
    if (!entity.casting) return
    const skillId = entity.casting.skillId
    entity.casting = null
    entity.gcdTimer = 0
    this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'interrupted' })
  }

  update(entity: Entity, dt: number): void {
    // Tick GCD
    if (entity.gcdTimer > 0) {
      entity.gcdTimer = Math.max(0, entity.gcdTimer - dt)
    }

    // Tick casting
    if (entity.casting) {
      entity.casting.elapsed += dt
      if (entity.casting.elapsed >= entity.casting.castTime) {
        this.completeCast(entity)
      }
    }
  }

  updateCooldowns(entity: Entity, dt: number): void {
    const cds = this.cooldowns.get(entity.id)
    if (!cds) return
    for (const [skillId, remaining] of cds) {
      const next = remaining - dt
      if (next <= 0) {
        cds.delete(skillId)
      } else {
        cds.set(skillId, next)
      }
    }
  }

  private completeCast(entity: Entity): void {
    if (!entity.casting) return

    const { skillId, targetId } = entity.casting
    entity.casting = null

    const skill = this.skillDefs.get(skillId)

    // Second validation: target still alive and in range?
    if (targetId && skill && skill.range > 0) {
      const target = this.entityMgr.get(targetId)
      if (!target || !target.alive) {
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'target_lost' })
        return
      }
      if (distance(entity.position, target.position) > skill.range) {
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'out_of_range' })
        return
      }
    }

    // Spawn AoE zones if any
    if (skill?.zones && skill.zones.length > 0) {
      const targetEntity = targetId ? this.entityMgr.get(targetId) : null
      const targetPos: Vec2 | null = targetEntity
        ? { x: targetEntity.position.x, y: targetEntity.position.y }
        : null

      for (const zoneDef of skill.zones) {
        this.zoneMgr.spawn(
          zoneDef,
          skillId,
          { x: entity.position.x, y: entity.position.y },
          entity.facing,
          targetPos,
        )
      }
    }

    this.bus.emit('skill:cast_complete', { caster: entity, skill })
  }

  private getCooldown(entityId: string, skillId: string): number {
    return this.cooldowns.get(entityId)?.get(skillId) ?? 0
  }

  private setCooldown(entityId: string, skillId: string, duration: number): void {
    if (!this.cooldowns.has(entityId)) {
      this.cooldowns.set(entityId, new Map())
    }
    this.cooldowns.get(entityId)!.set(skillId, duration)
  }
}
```

- [ ] **Step 4: 运行测试，检查哪些通过/失败**

```bash
pnpm test:run src/skill/skill-resolver.test.ts
```

可能需要微调 `completeCast` 中的二次验证逻辑。关键问题是 `completeCast` 需要访问 SkillDef 来做 range 检查。添加一个 skill 注册表：

- [ ] **Step 5: 验证——确认 spell 的二次距离验证测试通过**

Step 3 的 `completeCast` 已包含完整的二次验证逻辑（通过 `skillDefs` 注册表查找 range）。如果测试因细节不通过，检查 `completeCast` 中的 `distance` 调用和事件 payload 是否与测试期望匹配。

- [ ] **Step 6: 运行全部测试，确认通过**

```bash
pnpm test:run src/skill/skill-resolver.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/skill/skill-resolver.ts src/skill/skill-resolver.test.ts
git commit -m "feat: implement SkillResolver with GCD, casting, cooldowns, silence, and interrupt"
```

---

### Task 12: 全量测试 + 导出模块入口

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 运行所有测试**

```bash
pnpm test:run
```

预期：所有测试通过。如果有失败的，逐个修复。

- [ ] **Step 2: 创建模块导出入口**

```typescript
// src/index.ts
export { EventBus } from './core/event-bus'
export { GameLoop, LOGIC_TICK } from './core/game-loop'
export type * from './core/types'

export { createEntity } from './entity/entity'
export type { Entity, CastState, BuffInstance, CreateEntityOptions } from './entity/entity'
export { EntityManager } from './entity/entity-manager'

export { Arena } from './arena/arena'
export { pointInCircle, pointInFan, pointInRing, pointInRect } from './arena/geometry'

export { calculateDamage } from './combat/damage'
export type { DamageParams } from './combat/damage'
export { BuffSystem } from './combat/buff'

export { isPointInAoeShape } from './skill/aoe-shape'
export { AoeZoneManager } from './skill/aoe-zone'
export type { ActiveAoeZone } from './skill/aoe-zone'
export { SkillResolver, GCD_DURATION } from './skill/skill-resolver'
```

- [ ] **Step 3: 验证构建**

```bash
pnpm exec tsc --noEmit
```

预期：无错误。

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add module entry point exporting all game logic systems"
```

---

## 完成标准

Plan A 完成后，项目应具备：

- 完整的游戏逻辑层，纯 TypeScript，零渲染引擎依赖
- EventBus、GameLoop、Entity、Arena、Damage、Buff、Skill、AoE Zone 全部可用
- 所有模块有单元测试覆盖
- `pnpm test:run` 全量通过
- `pnpm exec tsc --noEmit` 无类型错误

接下来进入 **Plan B（BOSS AI 与资源加载）**：YAML 配置解析、资源管理器、时间轴调度器。
