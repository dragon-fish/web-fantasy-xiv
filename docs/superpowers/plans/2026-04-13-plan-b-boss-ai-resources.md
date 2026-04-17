# Plan B — BOSS AI 与资源加载 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 YAML 配置解析、资源管理器、时间轴调度器和 BOSS 战斗行为——加载一个 YAML 时间轴文件即可驱动完整战斗流程（无可视化，用测试验证）。

**Architecture:** 资源层负责加载/缓存 YAML 配置；时间轴调度器按固定时间步长推进，到点时调用技能系统释放技能；BOSS 行为层处理索敌、移动、朝向。所有模块依赖 Plan A 已实现的游戏逻辑层。

**Tech Stack:** TypeScript, Vitest, yaml (npm package)

**Spec:** `docs/specs/2026-04-13-prototype-design.md`

---

## 文件结构

```
src/
  config/
    schema.ts               # YAML 配置的 TS 类型定义 + 验证/转换
    schema.test.ts
    resource-loader.ts       # 异步资源加载器（缓存、去重、依赖解析）
    resource-loader.test.ts
  timeline/
    timeline-parser.ts       # 时间轴 YAML 解析（展开 then/after 语法糖）
    timeline-parser.test.ts
    timeline-scheduler.ts    # 时间轴调度器（按逻辑帧推进、分发 action）
    timeline-scheduler.test.ts
  ai/
    boss-behavior.ts         # BOSS 战斗行为（索敌、移动、朝向、自动攻击）
    boss-behavior.test.ts
```

---

### Task 1: 安装 yaml 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 yaml 包**

```bash
pnpm add yaml
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add yaml dependency"
```

---

### Task 2: 配置 Schema 定义与验证

**Files:**
- Create: `src/config/schema.ts`
- Create: `src/config/schema.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/config/schema.test.ts
import { describe, it, expect } from 'vitest'
import { parseArenaConfig, parseEntityConfig, parseSkillConfig, parseTimelineConfig } from '@/config/schema'

describe('parseArenaConfig', () => {
  it('should parse circle arena', () => {
    const raw = { name: '圆形竞技场', shape: 'circle', radius: 20, boundary: 'lethal' }
    const arena = parseArenaConfig(raw)
    expect(arena.name).toBe('圆形竞技场')
    expect(arena.shape).toEqual({ type: 'circle', radius: 20 })
    expect(arena.boundary).toBe('lethal')
  })

  it('should parse rect arena', () => {
    const raw = { name: '方形竞技场', shape: 'rect', width: 40, height: 30, boundary: 'wall' }
    const arena = parseArenaConfig(raw)
    expect(arena.shape).toEqual({ type: 'rect', width: 40, height: 30 })
  })
})

describe('parseEntityConfig', () => {
  it('should parse boss entity', () => {
    const raw = {
      name: '试炼BOSS', type: 'boss', model: 'models/boss.glb',
      size: 2, hp: 100000, attack: 1,
      autoAttackInterval: 3000, autoAttackRange: 5,
      skills: ['melee/heavy_swing', 'aoe/left_right_cleave'],
    }
    const entity = parseEntityConfig(raw)
    expect(entity.name).toBe('试炼BOSS')
    expect(entity.type).toBe('boss')
    expect(entity.hp).toBe(100000)
    expect(entity.skills).toEqual(['melee/heavy_swing', 'aoe/left_right_cleave'])
  })
})

describe('parseSkillConfig', () => {
  it('should parse single target weaponskill', () => {
    const raw = {
      id: 'melee/slash', name: 'Slash', type: 'weaponskill',
      castTime: 0, cooldown: 0, gcd: true,
      targetType: 'single', range: 5,
      effects: [{ type: 'damage', potency: 2 }],
    }
    const skill = parseSkillConfig(raw)
    expect(skill.type).toBe('weaponskill')
    expect(skill.effects).toHaveLength(1)
  })

  it('should parse aoe skill with zones', () => {
    const raw = {
      id: 'aoe/slam', name: 'Slam', type: 'ability',
      castTime: 0, cooldown: 0, gcd: false,
      targetType: 'aoe', range: 0,
      zones: [{
        anchor: { type: 'caster' },
        direction: { type: 'none' },
        shape: { type: 'circle', radius: 8 },
        telegraphDuration: 2000,
        resolveDelay: 3000,
        hitEffectDuration: 500,
        effects: [{ type: 'damage', potency: 5000 }],
      }],
    }
    const skill = parseSkillConfig(raw)
    expect(skill.zones).toHaveLength(1)
    expect(skill.zones![0].shape).toEqual({ type: 'circle', radius: 8 })
  })
})

describe('parseTimelineConfig', () => {
  it('should parse timeline with arenas, entities, and actions', () => {
    const raw = {
      arenas: { default: 'arenas/round' },
      entities: { boss: 'entities/boss1' },
      local_skills: {},
      timeline: [
        { at: 0, use: 'melee/slash' },
        { at: 8000, use: 'aoe/slam' },
      ],
      enrage: { time: 600000, castTime: 10000, skill: 'enrage_blast' },
    }
    const tl = parseTimelineConfig(raw)
    expect(tl.arenas.default).toBe('arenas/round')
    expect(tl.timeline).toHaveLength(2)
    expect(tl.enrage.time).toBe(600000)
  })
})
```

- [ ] **Step 2: 实现 schema.ts**

```typescript
// src/config/schema.ts
import type { ArenaDef, SkillDef, AoeZoneDef, SkillEffectDef } from '@/core/types'

// --- Arena ---
export interface RawArenaConfig {
  name: string
  shape: string
  radius?: number
  width?: number
  height?: number
  boundary: string
}

export function parseArenaConfig(raw: RawArenaConfig): ArenaDef {
  const shape = raw.shape === 'circle'
    ? { type: 'circle' as const, radius: raw.radius! }
    : { type: 'rect' as const, width: raw.width!, height: raw.height! }
  return { name: raw.name, shape, boundary: raw.boundary as ArenaDef['boundary'] }
}

// --- Entity ---
export interface EntityConfig {
  name: string
  type: string
  model?: string
  size: number
  hp: number
  attack: number
  autoAttackInterval: number
  autoAttackRange: number
  skills: string[]
}

export function parseEntityConfig(raw: any): EntityConfig {
  return {
    name: raw.name,
    type: raw.type,
    model: raw.model,
    size: raw.size ?? 0.5,
    hp: raw.hp ?? 0,
    attack: raw.attack ?? 0,
    autoAttackInterval: raw.autoAttackInterval ?? 3000,
    autoAttackRange: raw.autoAttackRange ?? 5,
    skills: raw.skills ?? [],
  }
}

// --- Skill ---
export function parseSkillConfig(raw: any): SkillDef {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    castTime: raw.castTime ?? 0,
    cooldown: raw.cooldown ?? 0,
    gcd: raw.gcd ?? false,
    targetType: raw.targetType ?? 'single',
    range: raw.range ?? 0,
    zones: raw.zones?.map((z: any) => parseZone(z)),
    effects: raw.effects as SkillEffectDef[] | undefined,
  }
}

function parseZone(raw: any): AoeZoneDef {
  return {
    anchor: raw.anchor,
    direction: raw.direction,
    shape: raw.shape,
    telegraphDuration: raw.telegraphDuration ?? 0,
    resolveDelay: raw.resolveDelay ?? 0,
    hitEffectDuration: raw.hitEffectDuration ?? 500,
    effects: raw.effects ?? [],
  }
}

// --- Timeline ---
export interface TimelineAction {
  at: number          // absolute ms
  action: string      // 'use' | 'loop' | 'switch_arena' | 'spawn_entity' | 'lock_facing'
  use?: string        // skill id
  loop?: number       // target time ms
  arena?: string      // arena alias
  entity?: string     // entity alias
  position?: { x: number; y: number }
  facing?: number
  locked?: boolean
}

export interface TimelineConfig {
  arenas: Record<string, string>
  entities: Record<string, string>
  localSkills: Record<string, SkillDef>
  timeline: TimelineAction[]
  enrage: { time: number; castTime: number; skill: string }
}

export function parseTimelineConfig(raw: any): TimelineConfig {
  const timeline: TimelineAction[] = []

  for (const entry of raw.timeline ?? []) {
    const action = parseTimelineEntry(entry)
    timeline.push(...action)
  }

  // Sort by absolute time
  timeline.sort((a, b) => a.at - b.at)

  const localSkills: Record<string, SkillDef> = {}
  for (const [key, val] of Object.entries(raw.local_skills ?? {})) {
    localSkills[key] = parseSkillConfig({ id: key, ...(val as any) })
  }

  return {
    arenas: raw.arenas ?? { default: raw.arena },
    entities: raw.entities ?? { boss: raw.entity },
    localSkills,
    timeline,
    enrage: raw.enrage ?? { time: 0, castTime: 0, skill: '' },
  }
}

function parseTimelineEntry(entry: any, baseTime = 0): TimelineAction[] {
  const at = (entry.at ?? 0) + baseTime
  const results: TimelineAction[] = []

  if (entry.use != null) {
    results.push({ at, action: 'use', use: entry.use })
  } else if (entry.loop != null) {
    results.push({ at, action: 'loop', loop: entry.loop })
  } else if (entry.action === 'switch_arena') {
    results.push({ at, action: 'switch_arena', arena: entry.arena })
  } else if (entry.action === 'spawn_entity') {
    results.push({ at, action: 'spawn_entity', entity: entry.entity, position: entry.position })
  } else if (entry.action === 'lock_facing') {
    results.push({ at, action: 'lock_facing', facing: entry.facing, locked: entry.locked })
  }

  // Process then/after children (relative time sugar)
  if (entry.then) {
    for (const child of entry.then) {
      const childBase = at + (child.after ?? 0)
      const childEntry = { ...child, at: 0 }
      delete childEntry.after
      results.push(...parseTimelineEntry(childEntry, childBase))
    }
  }

  return results
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/config/schema.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/config/
git commit -m "feat: implement YAML config schema parsing for arena, entity, skill, timeline"
```

---

### Task 3: 时间轴解析（then/after 展开）

**Files:**
- Create: `src/timeline/timeline-parser.ts`
- Create: `src/timeline/timeline-parser.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/timeline/timeline-parser.test.ts
import { describe, it, expect } from 'vitest'
import { flattenTimeline } from '@/timeline/timeline-parser'

describe('flattenTimeline', () => {
  it('should pass through flat entries', () => {
    const raw = [
      { at: 0, use: 'slash' },
      { at: 8000, use: 'raidwide' },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ at: 0, action: 'use', use: 'slash' })
    expect(result[1]).toEqual({ at: 8000, action: 'use', use: 'raidwide' })
  })

  it('should flatten then/after into absolute times', () => {
    const raw = [
      {
        at: 18000,
        use: 'left_right_cleave',
        then: [
          { after: 3000, use: 'raidwide' },
          { after: 5000, use: 'iron_chariot' },
        ],
      },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ at: 18000, action: 'use', use: 'left_right_cleave' })
    expect(result[1]).toEqual({ at: 21000, action: 'use', use: 'raidwide' })
    expect(result[2]).toEqual({ at: 23000, action: 'use', use: 'iron_chariot' })
  })

  it('should handle nested then/after', () => {
    const raw = [
      {
        at: 10000,
        use: 'a',
        then: [
          {
            after: 2000,
            use: 'b',
            then: [
              { after: 1000, use: 'c' },
            ],
          },
        ],
      },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(3)
    expect(result[0].at).toBe(10000)
    expect(result[1].at).toBe(12000)
    expect(result[2].at).toBe(13000)
  })

  it('should sort by absolute time', () => {
    const raw = [
      { at: 5000, use: 'b' },
      { at: 1000, use: 'a' },
    ]
    const result = flattenTimeline(raw)
    expect(result[0].at).toBe(1000)
    expect(result[1].at).toBe(5000)
  })

  it('should handle non-use actions', () => {
    const raw = [
      { at: 60000, action: 'switch_arena', arena: 'broken' },
      { at: 62000, action: 'spawn_entity', entity: 'add1', position: { x: 10, y: 0 } },
    ]
    const result = flattenTimeline(raw)
    expect(result[0]).toEqual({ at: 60000, action: 'switch_arena', arena: 'broken' })
    expect(result[1]).toEqual({ at: 62000, action: 'spawn_entity', entity: 'add1', position: { x: 10, y: 0 } })
  })
})
```

- [ ] **Step 2: 实现 timeline-parser.ts**

```typescript
// src/timeline/timeline-parser.ts
import type { TimelineAction } from '@/config/schema'

export function flattenTimeline(rawEntries: any[]): TimelineAction[] {
  const result: TimelineAction[] = []

  for (const entry of rawEntries) {
    flattenEntry(entry, 0, result)
  }

  result.sort((a, b) => a.at - b.at)
  return result
}

function flattenEntry(entry: any, baseTime: number, out: TimelineAction[]): void {
  const at = (entry.at ?? 0) + baseTime

  if (entry.use != null) {
    out.push({ at, action: 'use', use: entry.use })
  } else if (entry.loop != null) {
    out.push({ at, action: 'loop', loop: entry.loop })
  } else if (entry.action === 'switch_arena') {
    out.push({ at, action: 'switch_arena', arena: entry.arena })
  } else if (entry.action === 'spawn_entity') {
    out.push({ at, action: 'spawn_entity', entity: entry.entity, position: entry.position })
  } else if (entry.action === 'lock_facing') {
    out.push({ at, action: 'lock_facing', facing: entry.facing, locked: entry.locked })
  }

  if (entry.then) {
    for (const child of entry.then) {
      const childAt = at + (child.after ?? 0)
      flattenEntry({ ...child, at: 0, after: undefined }, childAt, out)
    }
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/timeline/timeline-parser.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/timeline/
git commit -m "feat: implement timeline parser with then/after flattening"
```

---

### Task 4: 资源加载器

**Files:**
- Create: `src/config/resource-loader.ts`
- Create: `src/config/resource-loader.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/config/resource-loader.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ResourceLoader } from '@/config/resource-loader'

describe('ResourceLoader', () => {
  function mockFetcher(files: Record<string, any>) {
    return async (path: string) => {
      const data = files[path]
      if (!data) throw new Error(`Not found: ${path}`)
      return data
    }
  }

  it('should load and cache a resource', async () => {
    const fetcher = vi.fn(mockFetcher({
      'arenas/round.yaml': { name: 'Round', shape: 'circle', radius: 20, boundary: 'lethal' },
    }))
    const loader = new ResourceLoader(fetcher)

    const result = await loader.load('arenas/round.yaml')
    expect(result.name).toBe('Round')

    // Second load should use cache
    await loader.load('arenas/round.yaml')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('should deduplicate concurrent loads of same resource', async () => {
    const fetcher = vi.fn(mockFetcher({
      'skills/slash.yaml': { id: 'slash', name: 'Slash', type: 'weaponskill' },
    }))
    const loader = new ResourceLoader(fetcher)

    const [r1, r2] = await Promise.all([
      loader.load('skills/slash.yaml'),
      loader.load('skills/slash.yaml'),
    ])
    expect(r1).toBe(r2)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('should load multiple resources in parallel', async () => {
    const fetcher = vi.fn(mockFetcher({
      'a.yaml': { id: 'a' },
      'b.yaml': { id: 'b' },
      'c.yaml': { id: 'c' },
    }))
    const loader = new ResourceLoader(fetcher)

    const results = await loader.loadAll(['a.yaml', 'b.yaml', 'c.yaml'])
    expect(results).toHaveLength(3)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('should track loading progress', async () => {
    const fetcher = mockFetcher({
      'a.yaml': { id: 'a' },
      'b.yaml': { id: 'b' },
    })
    const loader = new ResourceLoader(fetcher)
    const progress = loader.getProgress()
    expect(progress).toEqual({ loaded: 0, total: 0 })

    await loader.loadAll(['a.yaml', 'b.yaml'])
    const after = loader.getProgress()
    expect(after.loaded).toBe(2)
  })
})
```

- [ ] **Step 2: 实现 resource-loader.ts**

```typescript
// src/config/resource-loader.ts
export type FetchFn = (path: string) => Promise<any>

export class ResourceLoader {
  private cache = new Map<string, any>()
  private pending = new Map<string, Promise<any>>()
  private loadedCount = 0
  private totalCount = 0

  constructor(private fetchFn: FetchFn) {}

  async load(path: string): Promise<any> {
    if (this.cache.has(path)) {
      return this.cache.get(path)
    }

    if (this.pending.has(path)) {
      return this.pending.get(path)
    }

    this.totalCount++
    const promise = this.fetchFn(path).then((data) => {
      this.cache.set(path, data)
      this.pending.delete(path)
      this.loadedCount++
      return data
    })

    this.pending.set(path, promise)
    return promise
  }

  async loadAll(paths: string[]): Promise<any[]> {
    return Promise.all(paths.map((p) => this.load(p)))
  }

  getProgress(): { loaded: number; total: number } {
    return { loaded: this.loadedCount, total: this.totalCount }
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/config/resource-loader.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/config/resource-loader.ts src/config/resource-loader.test.ts
git commit -m "feat: implement ResourceLoader with caching, dedup, and progress tracking"
```

---

### Task 5: 时间轴调度器

**Files:**
- Create: `src/timeline/timeline-scheduler.ts`
- Create: `src/timeline/timeline-scheduler.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/timeline/timeline-scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { TimelineScheduler } from '@/timeline/timeline-scheduler'
import { EventBus } from '@/core/event-bus'
import type { TimelineAction } from '@/config/schema'

describe('TimelineScheduler', () => {
  function setup(actions: TimelineAction[], enrage?: { time: number; castTime: number; skill: string }) {
    const bus = new EventBus()
    const scheduler = new TimelineScheduler(bus, actions, enrage)
    return { bus, scheduler }
  }

  it('should fire action at correct time', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'slash' },
      { at: 5000, action: 'use', use: 'raidwide' },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16) // t=16
    expect(handler).toHaveBeenCalledTimes(1) // at:0 fires immediately
    expect(handler.mock.calls[0][0].action).toBe('use')
    expect(handler.mock.calls[0][0].use).toBe('slash')

    handler.mockClear()
    scheduler.update(4984) // t=5000
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].use).toBe('raidwide')
  })

  it('should not fire same action twice', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'slash' },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16)
    scheduler.update(16)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should handle loop action', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'a' },
      { at: 1000, action: 'use', use: 'b' },
      { at: 2000, action: 'loop', loop: 0 },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16)    // t=16, fires 'a'
    scheduler.update(984)   // t=1000, fires 'b'
    scheduler.update(1000)  // t=2000, loop resets to 0
    scheduler.update(16)    // fires 'a' again
    expect(handler).toHaveBeenCalledTimes(3) // a, b, a
  })

  it('should emit timeline:enrage when enrage timer expires', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([], { time: 1000, castTime: 500, skill: 'enrage_blast' })
    bus.on('timeline:enrage', handler)

    scheduler.update(999)
    expect(handler).not.toHaveBeenCalled()
    scheduler.update(1)
    expect(handler).toHaveBeenCalledWith({ castTime: 500, skill: 'enrage_blast' })
  })

  it('should track elapsed time', () => {
    const { scheduler } = setup([])
    scheduler.update(100)
    scheduler.update(200)
    expect(scheduler.elapsed).toBe(300)
  })
})
```

- [ ] **Step 2: 实现 timeline-scheduler.ts**

```typescript
// src/timeline/timeline-scheduler.ts
import type { EventBus } from '@/core/event-bus'
import type { TimelineAction } from '@/config/schema'

export class TimelineScheduler {
  elapsed = 0
  private pointer = 0
  private enrageFired = false

  constructor(
    private bus: EventBus,
    private actions: TimelineAction[],
    private enrage?: { time: number; castTime: number; skill: string },
  ) {}

  update(dt: number): void {
    this.elapsed += dt

    // Fire all actions whose time has been reached
    while (this.pointer < this.actions.length) {
      const action = this.actions[this.pointer]
      if (action.at > this.elapsed) break

      if (action.action === 'loop') {
        // Reset timeline to target time
        this.elapsed = action.loop ?? 0
        this.pointer = 0
        // Re-scan from beginning
        continue
      }

      this.bus.emit('timeline:action', action)
      this.pointer++
    }

    // Enrage check
    if (this.enrage && !this.enrageFired && this.elapsed >= this.enrage.time) {
      this.enrageFired = true
      this.bus.emit('timeline:enrage', {
        castTime: this.enrage.castTime,
        skill: this.enrage.skill,
      })
    }
  }

  reset(): void {
    this.elapsed = 0
    this.pointer = 0
    this.enrageFired = false
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/timeline/timeline-scheduler.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/timeline/timeline-scheduler.ts src/timeline/timeline-scheduler.test.ts
git commit -m "feat: implement TimelineScheduler with action dispatch, loop, and enrage"
```

---

### Task 6: BOSS 战斗行为

**Files:**
- Create: `src/ai/boss-behavior.ts`
- Create: `src/ai/boss-behavior.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/ai/boss-behavior.test.ts
import { describe, it, expect } from 'vitest'
import { BossBehavior } from '@/ai/boss-behavior'
import { createEntity } from '@/entity/entity'

describe('BossBehavior', () => {
  function setup() {
    const boss = createEntity({
      id: 'boss', type: 'boss',
      position: { x: 0, y: 0, z: 0 },
      speed: 3, size: 2,
    })
    const player = createEntity({
      id: 'p1', type: 'player',
      position: { x: 5, y: 0, z: 0 },
    })
    const behavior = new BossBehavior(boss, 5, 3000) // range=5, autoInterval=3000
    return { boss, player, behavior }
  }

  it('should face toward target', () => {
    const { boss, player, behavior } = setup()
    behavior.updateFacing(player)
    // Player is at (5,0), boss at (0,0) → facing east = 90°
    expect(boss.facing).toBeCloseTo(90, 0)
  })

  it('should move toward target if out of range', () => {
    const { boss, player, behavior } = setup()
    player.position = { x: 20, y: 0, z: 0 }
    behavior.updateMovement(player, 1000) // 1 second at speed 3
    // Boss should have moved toward player
    expect(boss.position.x).toBeGreaterThan(0)
    expect(boss.position.x).toBeCloseTo(3, 0) // speed * dt/1000
  })

  it('should not move if already in range', () => {
    const { boss, player, behavior } = setup()
    player.position = { x: 3, y: 0, z: 0 } // within range 5
    const prevX = boss.position.x
    behavior.updateMovement(player, 1000)
    expect(boss.position.x).toBe(prevX)
  })

  it('should not move or change facing while casting', () => {
    const { boss, player, behavior } = setup()
    boss.casting = { skillId: 'raidwide', targetId: null, elapsed: 0, castTime: 3000 }
    player.position = { x: 20, y: 0, z: 0 }
    const prevFacing = boss.facing
    behavior.updateMovement(player, 1000)
    behavior.updateFacing(player)
    expect(boss.position.x).toBe(0)
    expect(boss.facing).toBe(prevFacing)
  })

  it('should respect facing lock', () => {
    const { boss, player, behavior } = setup()
    behavior.lockFacing(180)
    expect(boss.facing).toBe(180)
    behavior.updateFacing(player) // should be ignored
    expect(boss.facing).toBe(180)

    behavior.unlockFacing()
    behavior.updateFacing(player)
    expect(boss.facing).not.toBe(180) // now updates
  })

  it('should tick auto-attack timer', () => {
    const { boss, behavior } = setup()
    boss.inCombat = true
    const ready = behavior.tickAutoAttack(1000)
    expect(ready).toBe(false)
    const ready2 = behavior.tickAutoAttack(2000)
    expect(ready2).toBe(true)
  })
})
```

- [ ] **Step 2: 实现 boss-behavior.ts**

```typescript
// src/ai/boss-behavior.ts
import type { Entity } from '@/entity/entity'

const DEG2RAD = Math.PI / 180

export class BossBehavior {
  private facingLocked = false
  private autoAttackAccum = 0

  constructor(
    private boss: Entity,
    private autoAttackRange: number,
    private autoAttackInterval: number,
  ) {}

  updateFacing(target: Entity): void {
    if (this.boss.casting) return
    if (this.facingLocked) return

    const dx = target.position.x - this.boss.position.x
    const dy = target.position.y - this.boss.position.y
    if (dx === 0 && dy === 0) return

    this.boss.facing = ((Math.atan2(dx, dy) / DEG2RAD) + 360) % 360
  }

  updateMovement(target: Entity, dt: number): void {
    if (this.boss.casting) return

    const dx = target.position.x - this.boss.position.x
    const dy = target.position.y - this.boss.position.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    // Already in range (stop slightly inside)
    if (dist <= this.autoAttackRange - 0.1) return

    const moveDistance = this.boss.speed * (dt / 1000)
    const ratio = Math.min(moveDistance / dist, 1)
    this.boss.position.x += dx * ratio
    this.boss.position.y += dy * ratio
  }

  lockFacing(angle: number): void {
    this.facingLocked = true
    this.boss.facing = angle
  }

  unlockFacing(): void {
    this.facingLocked = false
  }

  tickAutoAttack(dt: number): boolean {
    if (!this.boss.inCombat) return false
    if (this.boss.casting) return false

    this.autoAttackAccum += dt
    if (this.autoAttackAccum >= this.autoAttackInterval) {
      this.autoAttackAccum -= this.autoAttackInterval
      return true
    }
    return false
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/ai/boss-behavior.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/ai/
git commit -m "feat: implement BossBehavior with targeting, movement, facing lock, auto-attack"
```

---

### Task 7: 集成 + 模块导出

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 运行全量测试**

```bash
pnpm test:run
```

- [ ] **Step 2: 更新模块导出**

在 `src/index.ts` 末尾追加：

```typescript
// Config
export { parseArenaConfig, parseEntityConfig, parseSkillConfig, parseTimelineConfig } from './config/schema'
export type { EntityConfig, TimelineAction, TimelineConfig } from './config/schema'
export { ResourceLoader } from './config/resource-loader'
export type { FetchFn } from './config/resource-loader'

// Timeline
export { flattenTimeline } from './timeline/timeline-parser'
export { TimelineScheduler } from './timeline/timeline-scheduler'

// AI
export { BossBehavior } from './ai/boss-behavior'
```

- [ ] **Step 3: 类型检查**

```bash
pnpm exec tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export Plan B modules (config, timeline, AI)"
```

---

## 完成标准

Plan B 完成后，项目应新增：

- YAML 配置 schema 解析（arena、entity、skill、timeline）
- 资源加载器（缓存、去重、进度追踪）
- 时间轴解析器（then/after 展开为绝对时间）
- 时间轴调度器（按逻辑帧推进、action 分发、loop、enrage）
- BOSS 战斗行为（索敌、移动、朝向锁定、自动攻击计时）
- 所有模块有单元测试，`pnpm test:run` 全量通过

接下来进入 **Plan C（可视化与交互）**：Babylon.js 场景、输入系统、渲染、UI、Demo 战斗。
