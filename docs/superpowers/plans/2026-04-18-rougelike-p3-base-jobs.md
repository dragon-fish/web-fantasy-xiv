# Rougelike Tower Phase 3 — Base Jobs & Job Selection UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为爬塔模式实装 3 个基础职业（剑术师 / 弓箭手 / 咒术师）、真正的职业选择 UI、no-run 存档感知入口，以及配套的战斗引擎 periodic-effect framework（DoT / HoT / MP regen）和 `next_cast_instant` cast hook。

**Architecture:**
- 基础职业走现有 `PlayerJob` 接口，加入 `src/jobs/index.ts` 的 `JOBS` 数组，与进阶 job 共用注册表
- Periodic framework 在 `src/combat/buff-periodic.ts` 拆出独立模块；caster 端 snapshot + target 端 live；`calculateDamage` 复用
- `TowerRunPhase` union 扩展：旧 `selecting-job`（pre-descent lobby）改名 `ready-to-descend`；`selecting-job` 重新定义为"选职业"；`continueLastRun` 从 `towerGraph.nodes` 推断 phase 避免 schemaVersion bump
- UI 使用现有 MenuShell 风格 + 新 `ConfirmDialog` / `JobPicker` / `JobPickerCard` 组件

**Tech Stack:** TypeScript (strict), Vue 3 (Composition API, `<script setup>` + pug), Pinia, Vitest, @vueuse/core (useTimeAgo)。Spec：`docs/superpowers/specs/2026-04-18-rougelike-p3-base-jobs-design.md`。

---

## 建议分支与施工次序

**分支**：`feat/tower-p3-base-jobs`（基于 master `b96da95`）

**Task 依赖关系**：
- Group A（1-9，periodic framework）→ Group C（11-13，base jobs 需要 DoT/swiftcast runtime）
- Group B（10，role skill）→ Task 13（咒术师挂载 lucid）
- Group D（15-19，store）独立于 Group A-C
- Group E（20-22，组件）独立
- Group F（23-25，UI 集成）依赖 Group D + E + Task 14（JOBS 数组）
- Group G（26，QA）最后

推荐执行顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26。

---

## Task 1: 扩展 `BuffEffectDef` union

**Files:**
- Modify: `src/core/types.ts:118-132`

**目的**：为 `mp_regen`（醒梦用）和 `next_cast_instant`（即刻咏唱用）补类型定义。纯 type 扩展，runtime 不涉及 —— 后续 task 才接 runtime。

- [ ] **Step 1：打开 `src/core/types.ts`，定位 `BuffEffectDef` union（第 118 行起）**

- [ ] **Step 2：在 union 末尾追加两个新条目**

```ts
export type BuffEffectDef =
  | { type: 'damage_increase'; value: number }
  | { type: 'mitigation'; value: number }
  | { type: 'speed_modify'; value: number }
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'vulnerability'; value: number }
  | { type: 'haste'; value: number }
  | { type: 'lifesteal'; value: number }
  | { type: 'mp_on_hit'; value: number }
  | { type: 'undying' }
  | { type: 'silence' }
  | { type: 'stun' }
  | { type: 'invulnerable' }
  | { type: 'damage_immunity' }
  | { type: 'mp_regen'; potency: number; interval: number }
  | { type: 'next_cast_instant'; consumeOnCast: boolean }
```

- [ ] **Step 3：运行 typecheck 确认不破坏现有代码**

```bash
pnpm typecheck
```
Expected：pass（现有代码里 effect.type 的 switch 语句若用了 exhaustive check 可能会报 "not all paths return"；当前 `src/combat/buff.ts` 的 collectEffects 用 `.filter` 非穷举，不会报错。若有其它消费者报错，记录下来在 task 2+ 里修）

- [ ] **Step 4：commit**

```bash
git add src/core/types.ts
git commit -m "feat(combat): extend BuffEffectDef with mp_regen and next_cast_instant"
```

---

## Task 2: 扩展 `BuffInstance` 添加 `periodic?` 字段

**Files:**
- Modify: `src/entity/entity.ts:11-16`

**目的**：`BuffInstance` 加 optional `periodic` 字段存 periodic tick 的调度与 snapshot。不影响非 periodic buff（默认 undefined）。

- [ ] **Step 1：打开 `src/entity/entity.ts`，定位 `BuffInstance`（第 11-16 行）**

- [ ] **Step 2：补 `periodic?` 字段并导入 `DamageType`**

```ts
import type { EntityType, Vec3, DamageType } from '@/core/types'

// ... (其他定义不变)

/** Periodic effect 的调度与 snapshot；普通 buff 实例此字段 undefined */
export interface PeriodicState {
  /** 下一次 tick 的游戏内时间戳（ms，对齐 GameLoop.logicTime） */
  nextTickAt: number
  /** tick 周期（ms），从 buff effect.interval 字段拷贝 */
  interval: number
  /** 当前 periodic effect 类型，决定 tick 行为 */
  effectType: 'dot' | 'hot' | 'mp_regen'
  /** 施加者端快照；target 端（mitigation/vulnerability）在 tick 时 live 读取 */
  snapshot: {
    /** caster.attack at apply（dot / hot 使用；mp_regen 占位 0） */
    attack: number
    /** caster 身上所有 damage_increase buff value list at apply（加算池，dot / hot 使用） */
    casterIncreases: number[]
    /** 此 periodic effect 的 potency，从 buff effect.potency 字段拷贝便于 tick 访问 */
    potency: number
    /** mp_regen 专用：target.maxMp at apply（mp_regen 回量 = targetMaxMp × potency） */
    targetMaxMp?: number
  }
  /** 仅 dot 使用：伤害类型；hot / mp_regen 省略 */
  damageType?: DamageType | DamageType[]
  /** 施加者 entity id；施加者死亡不中断 tick，用于溯源 / UI 标注 */
  sourceCasterId: string
}

export interface BuffInstance {
  defId: string
  sourceId: string
  remaining: number  // ms remaining, 0 = permanent
  stacks: number
  /** Periodic effect 调度；普通 buff 为 undefined */
  periodic?: PeriodicState
}
```

- [ ] **Step 3：运行 typecheck**

```bash
pnpm typecheck
```
Expected：pass。`PeriodicState` 为新导出类型，后续 task 会用到。

- [ ] **Step 4：commit**

```bash
git add src/entity/entity.ts
git commit -m "feat(entity): add optional periodic state to BuffInstance"
```

---

## Task 3: `buff-periodic.ts` — snapshot builder（TDD）

**Files:**
- Create: `src/combat/buff-periodic.ts`
- Create: `src/combat/buff-periodic.test.ts`

**目的**：实装 `buildPeriodicSnapshot(caster, target, effect)` 辅助函数 —— 根据 effect type 构建 snapshot 对象。其它函数依赖它。

- [ ] **Step 1：创建 test 文件并写第一个 failing test**

```ts
// src/combat/buff-periodic.test.ts
import { describe, it, expect } from 'vitest'
import { buildPeriodicSnapshot } from './buff-periodic'
import { BuffSystem } from './buff'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'

function setup() {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const caster = entityMgr.create({ id: 'caster', type: 'player', attack: 900, hp: 6500, maxHp: 6500, mp: 10000, maxMp: 10000 })
  const target = entityMgr.create({ id: 'target', type: 'boss', attack: 0, hp: 100000, maxHp: 100000, mp: 0, maxMp: 0 })
  return { bus, buffSystem, caster, target }
}

describe('buildPeriodicSnapshot', () => {
  it('dot snapshot freezes caster attack + damage_increase + effect potency', () => {
    const { buffSystem, caster, target } = setup()
    // caster 身上挂一个 damage_increase +0.20 buff
    buffSystem.registerDef({
      id: 'test_inc', name: 'test', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('test_inc')!, caster.id)

    const snap = buildPeriodicSnapshot(
      { type: 'dot', potency: 0.3, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.attack).toBe(900)
    expect(snap.potency).toBe(0.3)
    expect(snap.casterIncreases).toEqual([0.20])
    expect(snap.targetMaxMp).toBeUndefined()
  })

  it('hot snapshot matches dot snapshot shape', () => {
    const { buffSystem, caster, target } = setup()
    const snap = buildPeriodicSnapshot(
      { type: 'hot', potency: 0.5, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.attack).toBe(900)
    expect(snap.potency).toBe(0.5)
    expect(snap.casterIncreases).toEqual([])
  })

  it('mp_regen snapshot freezes target.maxMp + potency, no caster data needed', () => {
    const { buffSystem, caster, target } = setup()
    const snap = buildPeriodicSnapshot(
      { type: 'mp_regen', potency: 0.05, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.potency).toBe(0.05)
    expect(snap.targetMaxMp).toBe(0) // target boss 没 MP
    expect(snap.casterIncreases).toEqual([])
    expect(snap.attack).toBe(0)  // 占位 0
  })
})
```

- [ ] **Step 2：运行确认 fail**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：FAIL（`buff-periodic.ts` 还不存在）

- [ ] **Step 3：创建 `src/combat/buff-periodic.ts` 实装**

```ts
// src/combat/buff-periodic.ts
import type { BuffEffectDef } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { PeriodicState } from '@/entity/entity'
import type { BuffSystem } from './buff'

/**
 * Periodic effect 范围内的 BuffEffectDef 窄化类型.
 * 只有这三种 effect 会触发 periodic tick.
 */
export type PeriodicEffectDef =
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'mp_regen'; potency: number; interval: number }

/**
 * Type guard：判断一个 BuffEffectDef 是否是 periodic 类型.
 */
export function isPeriodicEffect(effect: BuffEffectDef): effect is PeriodicEffectDef {
  return effect.type === 'dot' || effect.type === 'hot' || effect.type === 'mp_regen'
}

/**
 * 构建 periodic snapshot.
 * - dot / hot: 冻结 caster 的 attack + damage_increase buffs + effect potency
 * - mp_regen: 冻结 target.maxMp + effect potency（caster 端不参与计算）
 */
export function buildPeriodicSnapshot(
  effect: PeriodicEffectDef,
  caster: Entity,
  target: Entity,
  buffSystem: BuffSystem,
): PeriodicState['snapshot'] {
  if (effect.type === 'mp_regen') {
    return {
      attack: 0,
      casterIncreases: [],
      potency: effect.potency,
      targetMaxMp: target.maxMp,
    }
  }
  // dot / hot
  return {
    attack: caster.attack,
    casterIncreases: buffSystem.getDamageIncreases(caster),
    potency: effect.potency,
  }
}
```

- [ ] **Step 4：运行确认 pass**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：3 tests PASS

- [ ] **Step 5：commit**

```bash
git add src/combat/buff-periodic.ts src/combat/buff-periodic.test.ts
git commit -m "feat(combat): add periodic snapshot builder"
```

---

## Task 4: `applyPeriodicBuff` —— 覆盖刷新语义

**Files:**
- Modify: `src/combat/buff-periodic.ts`
- Modify: `src/combat/buff-periodic.test.ts`

**目的**：实装 `applyPeriodicBuff(target, buffDef, caster, gameTime, buffSystem)` —— 处理 apply 瞬间的"先摘除旧 → 构 snapshot → 装新"流程。**不立即 fire** 首 tick。

- [ ] **Step 1：追加 failing test**

```ts
// src/combat/buff-periodic.test.ts 追加
import { applyPeriodicBuff } from './buff-periodic'
import type { BuffDef } from '@/core/types'

const VENOM_DEF: BuffDef = {
  id: 'test_venom', name: 'venom', type: 'debuff',
  duration: 18000, stackable: false, maxStacks: 1,
  effects: [{ type: 'dot', potency: 0.3, interval: 3000 }],
}

describe('applyPeriodicBuff', () => {
  it('adds buff to target with periodic state populated', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    expect(target.buffs.length).toBe(1)
    const inst = target.buffs[0]
    expect(inst.defId).toBe('test_venom')
    expect(inst.periodic).toBeDefined()
    expect(inst.periodic!.effectType).toBe('dot')
    expect(inst.periodic!.interval).toBe(3000)
    expect(inst.periodic!.nextTickAt).toBe(3000) // gameTime(0) + interval(3000)
    expect(inst.periodic!.sourceCasterId).toBe('caster')
    expect(inst.periodic!.snapshot.attack).toBe(900)
  })

  it('refresh drops old pending tick and installs new snapshot', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const firstInst = target.buffs[0]
    expect(firstInst.periodic!.nextTickAt).toBe(3000)

    // caster buff 在 t=1500 开 +0.30
    buffSystem.registerDef({
      id: 'test_barrage', name: 'b', type: 'buff', duration: 6000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.30 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('test_barrage')!, caster.id)

    // t=2000 覆盖刷新 venom
    applyPeriodicBuff(target, VENOM_DEF, caster, 2000, buffSystem)

    // 旧实例不见了；新实例独立
    expect(target.buffs.length).toBe(1)
    const secondInst = target.buffs[0]
    expect(secondInst).not.toBe(firstInst)
    expect(secondInst.periodic!.nextTickAt).toBe(5000)
    expect(secondInst.periodic!.snapshot.casterIncreases).toEqual([0.30])
  })

  it('does not fire initial tick on apply (target hp unchanged)', () => {
    const { buffSystem, caster, target } = setup()
    const hpBefore = target.hp
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    expect(target.hp).toBe(hpBefore) // 未掉血
  })
})
```

- [ ] **Step 2：运行确认 fail**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：3 new tests FAIL with `applyPeriodicBuff is not defined`

- [ ] **Step 3：在 `buff-periodic.ts` 实装 applyPeriodicBuff**

```ts
// src/combat/buff-periodic.ts 追加
import type { BuffDef } from '@/core/types'

/**
 * Apply periodic buff 到 target.
 * - 若已有同 buffId 实例：先直接摘除（无续毒补偿）
 * - 构建新 snapshot + nextTickAt = gameTime + interval
 * - **不立即 fire 首 tick**
 *
 * 假设 buffDef.effects 里至多 1 个 periodic effect（phase 3 限制）.
 */
export function applyPeriodicBuff(
  target: Entity,
  buffDef: BuffDef,
  caster: Entity,
  gameTime: number,
  buffSystem: BuffSystem,
): void {
  const periodicEffect = buffDef.effects.find(isPeriodicEffect)
  if (!periodicEffect) {
    throw new Error(`applyPeriodicBuff: buff ${buffDef.id} has no periodic effect`)
  }

  // 覆盖刷新：先摘除旧实例（不 fire pending tick）
  const existingIdx = target.buffs.findIndex((b) => b.defId === buffDef.id)
  if (existingIdx >= 0) {
    target.buffs.splice(existingIdx, 1)
  }

  // Register def on buffSystem if not yet (parity with applyBuff's behavior)
  buffSystem.registerDef(buffDef)

  const snapshot = buildPeriodicSnapshot(periodicEffect, caster, target, buffSystem)
  const baseDuration = buffDef.duration
  // 与现有 applyBuff 同口径：加 500ms grace，方便末 tick inclusive 对齐
  const effectiveDuration = baseDuration > 0 ? baseDuration + 500 : 0

  target.buffs.push({
    defId: buffDef.id,
    sourceId: caster.id,
    remaining: effectiveDuration,
    stacks: 1,
    periodic: {
      nextTickAt: gameTime + periodicEffect.interval,
      interval: periodicEffect.interval,
      effectType: periodicEffect.type,
      snapshot,
      sourceCasterId: caster.id,
    },
  })
}
```

- [ ] **Step 4：运行测试 pass**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：全部 PASS

- [ ] **Step 5：commit**

```bash
git add src/combat/buff-periodic.ts src/combat/buff-periodic.test.ts
git commit -m "feat(combat): add applyPeriodicBuff with refresh-drops-pending semantics"
```

---

## Task 5: `firePeriodicTick` —— dot/hot/mp_regen 结算

**Files:**
- Modify: `src/combat/buff-periodic.ts`
- Modify: `src/combat/buff-periodic.test.ts`

**目的**：`firePeriodicTick(inst, target, buffSystem)` 单次 tick 结算。dot/hot 走 `calculateDamage` pipeline；mp_regen 独立算。

- [ ] **Step 1：追加 failing tests**

```ts
// src/combat/buff-periodic.test.ts 追加
import { firePeriodicTick } from './buff-periodic'

describe('firePeriodicTick', () => {
  it('dot tick: caster snapshot + target live mitigation + vulnerability', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]

    // target 挂 mitigation 0.20
    buffSystem.registerDef({
      id: 'mit', name: 'mit', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.20 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('mit')!, target.id)

    // target 挂 vulnerability 0.30
    buffSystem.registerDef({
      id: 'vuln', name: 'vuln', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    // damage = 900 × 0.3 × (1 + 0 + 0.30) × (1 - 0.20)
    //       = 900 × 0.3 × 1.30 × 0.80 = 280.8 → floor 280
    expect(target.hp).toBe(hpBefore - 280)
  })

  it('hot tick: caster snapshot increases, no mitigation, restore hp (clamp to maxHp)', () => {
    const { bus, buffSystem, caster, target } = setup()
    target.hp = target.maxHp - 1000 // 人为伤 1000
    const hotDef: BuffDef = {
      id: 'hot_test', name: 'hot', type: 'buff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'hot', potency: 0.5, interval: 3000 }],
    }
    applyPeriodicBuff(target, hotDef, caster, 0, buffSystem)
    const inst = target.buffs[0]

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    // heal = 900 × 0.5 × 1.0 = 450
    expect(target.hp).toBe(hpBefore + 450)
  })

  it('hot tick does not exceed maxHp', () => {
    const { buffSystem, caster, target } = setup()
    const hotDef: BuffDef = {
      id: 'hot_test', name: 'hot', type: 'buff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'hot', potency: 100, interval: 3000 }],  // 故意巨量 heal
    }
    applyPeriodicBuff(target, hotDef, caster, 0, buffSystem)
    const inst = target.buffs[0]

    target.hp = target.maxHp - 10
    firePeriodicTick(inst, target, buffSystem)
    expect(target.hp).toBe(target.maxHp)
  })

  it('mp_regen tick: targetMaxMp × potency, clamp to maxMp', () => {
    const { buffSystem, caster } = setup()
    const mpTarget = caster // 玩家自己回蓝
    const lucidDef: BuffDef = {
      id: 'lucid_test', name: 'lucid', type: 'buff', duration: 21000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mp_regen', potency: 0.05, interval: 3000 }],
    }
    mpTarget.mp = 5000
    applyPeriodicBuff(mpTarget, lucidDef, caster, 0, buffSystem)
    const inst = mpTarget.buffs.find(b => b.defId === 'lucid_test')!

    firePeriodicTick(inst, mpTarget, buffSystem)
    // mp += 10000 × 0.05 = 500
    expect(mpTarget.mp).toBe(5500)
  })

  it('mp_regen clamps at maxMp', () => {
    const { buffSystem, caster } = setup()
    const lucidDef: BuffDef = {
      id: 'lucid_test', name: 'lucid', type: 'buff', duration: 21000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mp_regen', potency: 0.5, interval: 3000 }],  // 故意大量
    }
    caster.mp = caster.maxMp - 100
    applyPeriodicBuff(caster, lucidDef, caster, 0, buffSystem)
    const inst = caster.buffs.find(b => b.defId === 'lucid_test')!

    firePeriodicTick(inst, caster, buffSystem)
    expect(caster.mp).toBe(caster.maxMp)
  })
})
```

- [ ] **Step 2：运行确认 fail**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：5 new tests FAIL

- [ ] **Step 3：在 `buff-periodic.ts` 实装 firePeriodicTick**

```ts
// src/combat/buff-periodic.ts 追加
import { calculateDamage } from './damage'
import type { BuffInstance } from '@/entity/entity'

/**
 * 单次 periodic tick 结算.
 * - dot: caster snapshot + target live (vuln / mitigation) 汇入 calculateDamage pipeline
 * - hot: caster snapshot only, 走 calculateDamage 算 amplified 部分后回血（无 mitigation）
 * - mp_regen: 独立计算 targetMaxMp × potency
 */
export function firePeriodicTick(
  inst: BuffInstance,
  target: Entity,
  buffSystem: BuffSystem,
): void {
  const p = inst.periodic
  if (!p) return
  const snap = p.snapshot

  switch (p.effectType) {
    case 'dot': {
      const dmg = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: [
          ...snap.casterIncreases,
          buffSystem.getVulnerability(target),
        ],
        mitigations: buffSystem.getMitigations(target),
      })
      target.hp = Math.max(0, target.hp - dmg)
      break
    }
    case 'hot': {
      const heal = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: snap.casterIncreases,
        mitigations: [],
      })
      target.hp = Math.min(target.maxHp, target.hp + heal)
      break
    }
    case 'mp_regen': {
      const amount = (snap.targetMaxMp ?? 0) * snap.potency
      target.mp = Math.min(target.maxMp, target.mp + amount)
      break
    }
  }
}
```

- [ ] **Step 4：运行测试 pass**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：全部 PASS

- [ ] **Step 5：commit**

```bash
git add src/combat/buff-periodic.ts src/combat/buff-periodic.test.ts
git commit -m "feat(combat): add firePeriodicTick for dot/hot/mp_regen"
```

---

## Task 6: `tickPeriodicBuffs` 主 loop + 卡顿补偿

**Files:**
- Modify: `src/combat/buff-periodic.ts`
- Modify: `src/combat/buff-periodic.test.ts`

**目的**：`tickPeriodicBuffs(entities, gameTime, buffSystem)` 遍历所有 alive entity + 其 periodic buff，基于 gameTime fire tick。while 循环追赶掉帧；inclusive end tick。

- [ ] **Step 1：追加 failing tests**

```ts
// src/combat/buff-periodic.test.ts 追加
import { tickPeriodicBuffs } from './buff-periodic'

describe('tickPeriodicBuffs', () => {
  it('fires no tick at t=0 (no initial)', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const hpBefore = target.hp
    tickPeriodicBuffs([target], 0, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })

  it('fires first tick at t=interval', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target], 3000, buffSystem)
    // 900 × 0.3 = 270
    expect(target.hp).toBe(100000 - 270)
  })

  it('accumulates ticks for 18s DoT (6 ticks at t=3/6/9/12/15/18)', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    // 一步步推进
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000]) {
      tickPeriodicBuffs([target], t, buffSystem)
    }
    expect(target.hp).toBe(100000 - 270 * 6)
  })

  it('while-loop catchup: gameTime jumps from t=3 to t=13, fire 4 ticks at t=3/6/9/12', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target], 13000, buffSystem)
    // t=3 / 6 / 9 / 12 四跳（t=15 > 13s 不跳）
    expect(target.hp).toBe(100000 - 270 * 4)
  })

  it('inclusive end: tick at expireAt fires before buff expiration', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    // duration 18000 + 500 grace = 18500ms expireAt
    // nextTickAt 18000 <= expireAt 18500 → fire; 21000 > 18500 → stop
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000]) {
      tickPeriodicBuffs([target], t, buffSystem)
    }
    expect(target.hp).toBe(100000 - 270 * 6)
    // 跳到 21s 不应再 tick
    tickPeriodicBuffs([target], 21000, buffSystem)
    expect(target.hp).toBe(100000 - 270 * 6)
  })

  it('entity with no periodic buffs: no-op', () => {
    const { buffSystem, target } = setup()
    const hpBefore = target.hp
    tickPeriodicBuffs([target], 10000, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })

  it('ticks multiple entities in one call', () => {
    const { buffSystem, caster, target } = setup()
    const target2 = { ...target, id: 'target2', buffs: [] as BuffInstance[], hp: 100000, maxHp: 100000 } as Entity
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    applyPeriodicBuff(target2, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target, target2], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 270)
    expect(target2.hp).toBe(100000 - 270)
  })
})
```

- [ ] **Step 2：运行确认 fail**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：7 new tests FAIL

- [ ] **Step 3：在 `buff-periodic.ts` 实装 tickPeriodicBuffs**

```ts
// src/combat/buff-periodic.ts 追加
/**
 * 遍历 entities 与其 periodic buffs，根据 gameTime fire 对齐的 tick.
 * - 用 while 循环处理"gameTime 一次跳多个 interval"的掉帧补偿场景
 * - inclusive end：若 nextTickAt <= (duration 剩余转换成的 expire 绝对时间) 则 fire
 *
 * 本函数应在 game loop 每 tick 调用 1 次，gameTime 传 GameLoop.logicTime.
 *
 * NOTE: buff 过期由 BuffSystem.update(entity, dt) 负责摘除（基于 remaining）;
 * 本函数只负责 periodic tick fire. 一旦 buff.remaining 归 0 被 BuffSystem 摘除,
 * 下次 tickPeriodicBuffs 调用时自然不会再遇到它.
 */
export function tickPeriodicBuffs(
  entities: Entity[],
  gameTime: number,
  buffSystem: BuffSystem,
): void {
  for (const entity of entities) {
    // 从 entity.buffs 逆向遍历一份拷贝：fire 过程中可能改变 entity.hp (→ maybe 死亡另处理)
    // 但不会改变 buffs 数组本身（firePeriodicTick 不摘除 buff）
    for (const inst of entity.buffs) {
      if (!inst.periodic) continue
      while (gameTime >= inst.periodic.nextTickAt && inst.periodic.nextTickAt <= inst.remaining + gameTime - (inst.periodic.nextTickAt - inst.periodic.interval)) {
        // 简化 inclusive-end 判断：tick 发生时点必须仍在 buff 生命期内.
        // BuffSystem.update 基于 dt 减 remaining，此时 remaining > 0 已保证本跳合法.
        // nextTickAt <= gameTime 保证时机到；buff 未过期保证合法。
        firePeriodicTick(inst, entity, buffSystem)
        inst.periodic.nextTickAt += inst.periodic.interval
        if (inst.remaining === 0) break // 防守永久 buff 的死循环（phase 3 不应出现）
      }
    }
  }
}
```

- [ ] **Step 4：运行测试**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
如果失败：问题大概率出在 inclusive-end 判断上（while 条件过于复杂）。**简化版**：

```ts
export function tickPeriodicBuffs(
  entities: Entity[],
  gameTime: number,
  buffSystem: BuffSystem,
): void {
  for (const entity of entities) {
    for (const inst of entity.buffs) {
      if (!inst.periodic) continue
      // buff 已过期（remaining 0 且非 permanent 已在 BuffSystem.update 中摘除，此处不应到达；防守性跳过）
      while (gameTime >= inst.periodic.nextTickAt) {
        firePeriodicTick(inst, entity, buffSystem)
        inst.periodic.nextTickAt += inst.periodic.interval
      }
    }
  }
}
```

inclusive end 语义实际由 `BuffSystem.update` 的 duration tick 保证 —— duration 到期前 buff 仍在数组里，所以末 tick 自然 fire；duration 到期后 buff 被摘除，`tickPeriodicBuffs` 遍历时遇不到。现在 `applyPeriodicBuff` 给 duration 加了 500ms grace，让 18s/3s 末 tick（在 t=18000）仍在 buff 有效期内（grace 过期时间 18500）。

用上面简化版替换 step 3 的复杂版。Run test again：

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：全部 PASS

- [ ] **Step 5：commit**

```bash
git add src/combat/buff-periodic.ts src/combat/buff-periodic.test.ts
git commit -m "feat(combat): tickPeriodicBuffs main loop with catchup and inclusive end"
```

---

## Task 7: Periodic framework 边缘场景测试（spec §5.4 场景 A-F）

**Files:**
- Modify: `src/combat/buff-periodic.test.ts`

**目的**：spec §5.4 定义的场景 A-F（快照独立 / live 减伤 / live vuln / 覆盖刷新 / 爆发窗口 / 施加者死后继续 tick）逐一写测。这些测试验证 framework 在完整玩法场景下正确。

- [ ] **Step 1：追加场景测试**

```ts
// src/combat/buff-periodic.test.ts 追加

describe('periodic framework — spec §5.4 scenarios', () => {
  function freshSetup() {
    const { bus, buffSystem, caster, target } = setup()
    return { bus, buffSystem, caster, target }
  }

  it('scenario A: caster 增伤快照 + buff 过期后 DoT 仍持续加成', () => {
    const { buffSystem, caster, target } = freshSetup()
    // caster 身上 damage_increase +0.20
    buffSystem.registerDef({
      id: 'guard', name: 'g', type: 'buff', duration: 8000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('guard')!, caster.id)

    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=3s tick: 900 × 0.3 × 1.20 = 324
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 324)

    // t=8.5s guard 过期：手动摘（实际会由 BuffSystem.update 做）
    buffSystem.removeBuff(caster, 'guard', 'expired')

    // t=9s tick 仍用 snapshot casterIncreases=[0.20] → 324
    tickPeriodicBuffs([target], 9000, buffSystem)
    // 累计 3 跳（t=3/6/9）
    expect(target.hp).toBe(100000 - 324 * 3)
  })

  it('scenario B: target 减伤 live 判定', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=3s：无减伤 tick = 270
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 270)

    // t=4s: 给 target 上减伤 0.20
    buffSystem.registerDef({
      id: 'mit', name: 'mit', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.20 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('mit')!, target.id)

    // t=6s tick 吃减伤：270 × 0.8 = 216
    tickPeriodicBuffs([target], 6000, buffSystem)
    expect(target.hp).toBe(100000 - 270 - 216)

    // t=10s mit 过期
    buffSystem.removeBuff(target, 'mit', 'expired')

    // t=12s tick 恢复 baseline 270（补齐 t=9/12 两跳）
    tickPeriodicBuffs([target], 12000, buffSystem)
    // tick 9 在 mit 有效期（mit duration 10000 + 500 grace = 10500 > 9000）→ 216
    // tick 12 在 mit 过期后 → 270
    expect(target.hp).toBe(100000 - 270 - 216 - 216 - 270)
  })

  it('scenario C: target vulnerability 加算池汇合', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=2s 给 target 上 vuln 0.30
    buffSystem.registerDef({
      id: 'vuln', name: 'v', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    // t=3s tick: 900 × 0.3 × (1 + 0 + 0.30) = 351
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 351)

    // t=7s vuln 过期（duration 10000 + 500 grace；实际到 10.5s；此 scenario 简化手动摘）
    buffSystem.removeBuff(target, 'vuln', 'expired')

    // t=9s tick 恢复 270（补齐 t=6/9 两跳）
    tickPeriodicBuffs([target], 9000, buffSystem)
    // t=6 在 vuln 期 → 351
    // t=9 在 vuln 过期后 → 270
    expect(target.hp).toBe(100000 - 351 - 351 - 270)
  })

  it('scenario D: 覆盖刷新无 pending tick 补偿', () => {
    const { buffSystem, caster, target } = freshSetup()
    buffSystem.registerDef({
      id: 'guard', name: 'g', type: 'buff', duration: 8000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('guard')!, caster.id)
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // 推进到 t=9 共 3 跳
    tickPeriodicBuffs([target], 9000, buffSystem)
    const hpAfterA = target.hp

    // t=10 覆盖刷新（caster 仍有 guard，但场景要求 guard 已过期 —— 手动摘）
    buffSystem.removeBuff(caster, 'guard', 'expired')
    applyPeriodicBuff(target, VENOM_DEF, caster, 10000, buffSystem)

    // 旧的 nextTickAt 应该是 t=12，被作废
    // 新的 nextTickAt 应该是 t=13
    tickPeriodicBuffs([target], 12000, buffSystem)
    expect(target.hp).toBe(hpAfterA) // t=12 无 tick

    tickPeriodicBuffs([target], 13000, buffSystem)
    expect(target.hp).toBe(hpAfterA - 270) // t=13 tick 用新 snapshot (无加成)
  })

  it('scenario E: 爆发窗口内覆盖 DoT 全程吃加成', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=1.5 开 barrage +0.30
    buffSystem.registerDef({
      id: 'barrage', name: 'b', type: 'buff', duration: 6000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.30 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('barrage')!, caster.id)

    // t=2 覆盖 venom
    applyPeriodicBuff(target, VENOM_DEF, caster, 2000, buffSystem)
    // 新 nextTickAt = 5000

    // t=5 tick 351
    tickPeriodicBuffs([target], 5000, buffSystem)
    expect(target.hp).toBe(100000 - 351)

    // t=8 barrage 过期（duration 6000+500 grace=6500; 2000+6500=8500）
    // tick 8000 仍吃 [0.30] snapshot（冻结）
    tickPeriodicBuffs([target], 8000, buffSystem)
    expect(target.hp).toBe(100000 - 351 - 351)
  })

  it('scenario F: 施加者死亡后 target 端 live 判定 continues', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=5 caster "死亡" —— 改 entity.alive = false（tick 不应关心这点）
    caster.alive = false
    caster.hp = 0

    // t=6 给 boss 上 vuln 0.30
    buffSystem.registerDef({
      id: 'vuln', name: 'v', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    // t=6 tick：依然能打，因为 tick 用 snapshot（caster 已死不影响）+ live target
    // 不过 tick 时机是 gameTime >= nextTickAt，在 t=6 补 t=3 和 t=6 两跳
    // t=3 vuln 尚未施加 → 270；t=6 有 vuln → 351
    tickPeriodicBuffs([target], 6000, buffSystem)
    expect(target.hp).toBe(100000 - 270 - 351)
  })
})
```

- [ ] **Step 2：运行测试**

```bash
pnpm test:run src/combat/buff-periodic.test.ts
```
Expected：全部 PASS。若某个场景值算错，对照 spec §5.4 场景表格逐步验。

- [ ] **Step 3：commit**

```bash
git add src/combat/buff-periodic.test.ts
git commit -m "test(combat): cover periodic framework edge scenarios from spec §5.4"
```

---

## Task 8: `next_cast_instant` cast hook（skill-resolver）

**Files:**
- Modify: `src/skill/skill-resolver.ts:104-115`
- Modify: `src/skill/skill-resolver.test.ts`（或新建 test 如果 colocated 还没覆盖 cast time 的）

**目的**：在 skill-resolver 的 cast time 解析处，加入 `next_cast_instant` buff 检查 —— 命中则 castTime 归 0；消耗 buff 在施法完成后（由 `castTimeWithBuff` 旁路到新 hook）。

- [ ] **Step 1：读 skill-resolver 现有 cast 解析逻辑**

```bash
grep -n "castTime\|castTimeWithBuff\|hasBuff" src/skill/skill-resolver.ts
```
定位 104-115 行的 cast time 解析段落。

- [ ] **Step 2：追加 failing test**

在 `src/skill/skill-resolver.test.ts` 末尾加（若文件不存在则新建基础样板）：

```ts
// src/skill/skill-resolver.test.ts 追加
import { describe, it, expect } from 'vitest'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { SkillResolver } from './skill-resolver'
import { Arena } from '@/arena/arena'
import { CombatResolver } from '@/game/combat-resolver'
import type { SkillDef, BuffDef } from '@/core/types'

describe('next_cast_instant buff integration', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const buffSystem = new BuffSystem(bus)
    const arena = new Arena({ name: 't', shape: { type: 'circle', radius: 50 }, boundary: 'wall' })
    const combat = new CombatResolver(bus, entityMgr, buffSystem, arena)
    const resolver = new SkillResolver(bus, entityMgr, buffSystem, combat)
    const caster = entityMgr.create({
      id: 'c', type: 'player', attack: 1000, hp: 8000, maxHp: 8000, mp: 10000, maxMp: 10000,
    })
    const target = entityMgr.create({ id: 't', type: 'boss', attack: 0, hp: 999999, maxHp: 999999 })
    caster.target = 't'
    return { bus, buffSystem, resolver, caster }
  }

  const SWIFT_BUFF: BuffDef = {
    id: 'swift', name: 'swift', type: 'buff',
    duration: 10000, stackable: false, maxStacks: 1,
    effects: [{ type: 'next_cast_instant', consumeOnCast: true }],
  }

  const STONE: SkillDef = {
    id: 'stone', name: 'stone', type: 'spell',
    castTime: 2000, cooldown: 0, gcd: true,
    targetType: 'single', requiresTarget: true, range: 20, mpCost: 400,
    effects: [{ type: 'damage', potency: 2.0 }],
  }

  const SLASH: SkillDef = {
    id: 'slash', name: 'slash', type: 'weaponskill',
    castTime: 0, cooldown: 0, gcd: true,
    targetType: 'single', requiresTarget: true, range: 4, mpCost: 0,
    effects: [{ type: 'damage', potency: 1.5 }],
  }

  it('spell with next_cast_instant buff: cast time reduced to 0 (no cast phase)', () => {
    const { buffSystem, resolver, caster } = setup()
    buffSystem.applyBuff(caster, SWIFT_BUFF, caster.id)
    resolver.tryUse(caster, STONE)
    // cast time 0 → resolveImmediate, no caster.casting created
    expect(caster.casting).toBeNull()
  })

  it('spell consumes the buff on cast (consumeOnCast: true)', () => {
    const { buffSystem, resolver, caster } = setup()
    buffSystem.applyBuff(caster, SWIFT_BUFF, caster.id)
    expect(buffSystem.hasBuff(caster, 'swift')).toBe(true)
    resolver.tryUse(caster, STONE)
    expect(buffSystem.hasBuff(caster, 'swift')).toBe(false)
  })

  it('weaponskill does NOT trigger next_cast_instant consumption', () => {
    const { buffSystem, resolver, caster } = setup()
    buffSystem.applyBuff(caster, SWIFT_BUFF, caster.id)
    resolver.tryUse(caster, SLASH)
    // buff 不被消耗（SLASH 非 spell）
    expect(buffSystem.hasBuff(caster, 'swift')).toBe(true)
  })

  it('castTimeWithBuff hits first, next_cast_instant ignored if both apply', () => {
    // 如果 skill 自带 castTimeWithBuff 命中，走技能侧路径；next_cast_instant 不触发
    const { buffSystem, resolver, caster } = setup()
    const SPECIAL: SkillDef = {
      ...STONE,
      id: 'special',
      castTimeWithBuff: { buffId: 'swift', castTime: 500, consumeStack: false },
    }
    buffSystem.applyBuff(caster, SWIFT_BUFF, caster.id)
    resolver.tryUse(caster, SPECIAL)
    // castTimeWithBuff 设 castTime=500 → 走 startCast；casting.castTime = 500
    expect(caster.casting).not.toBeNull()
    expect(caster.casting!.castTime).toBe(500)
    // swift buff 未被消费（consumeStack:false + 我们的新 hook 不介入）
    expect(buffSystem.hasBuff(caster, 'swift')).toBe(true)
  })
})
```

- [ ] **Step 3：运行测试确认 fail**

```bash
pnpm test:run src/skill/skill-resolver.test.ts
```
Expected：新 tests FAIL（buff 命中时仍 startCast，或没消耗 buff）

- [ ] **Step 4：修改 `src/skill/skill-resolver.ts` 的 cast time 解析段**

在第 104-115 行现有 `castTimeWithBuff` 分支下面追加 `next_cast_instant` 查找：

```ts
// ... 原 cast time 解析段落
let actualCastTime = skill.castTime
let consumeSwiftBuffId: string | null = null // 新增：缓存待消费的 swift buff id

if (skill.castTimeWithBuff && this.buffSystem.hasBuff(caster, skill.castTimeWithBuff.buffId)) {
  actualCastTime = skill.castTimeWithBuff.castTime
  if (skill.castTimeWithBuff.consumeStack) {
    this.buffSystem.removeStacks(caster, skill.castTimeWithBuff.buffId, 1)
  }
} else if (skill.type === 'spell') {
  // 新增：scan caster buffs for next_cast_instant effect
  const swiftInst = caster.buffs.find((b) => {
    const def = this.buffSystem.getDef(b.defId)
    return def?.effects.some((e) => e.type === 'next_cast_instant')
  })
  if (swiftInst) {
    const def = this.buffSystem.getDef(swiftInst.defId)!
    const effect = def.effects.find((e) => e.type === 'next_cast_instant') as { type: 'next_cast_instant'; consumeOnCast: boolean }
    actualCastTime = 0
    if (effect.consumeOnCast) {
      consumeSwiftBuffId = swiftInst.defId
    }
  }
}

const haste = this.buffSystem.getHaste(caster)
if (haste > 0 && actualCastTime > 0) {
  actualCastTime = Math.round(actualCastTime * (1 - haste))
}

// Execute
if (skill.type === 'spell' && actualCastTime > 0) {
  return this.startCast(caster, skill, actualCastTime)
}
// 瞬发路径：resolveImmediate 之前消费 swift
if (consumeSwiftBuffId) {
  this.buffSystem.removeBuff(caster, consumeSwiftBuffId, 'consumed')
}
return this.resolveImmediate(caster, skill)
```

- [ ] **Step 5：typecheck + run tests**

```bash
pnpm typecheck
pnpm test:run src/skill/skill-resolver.test.ts
```
Expected：全部 PASS

- [ ] **Step 6：commit**

```bash
git add src/skill/skill-resolver.ts src/skill/skill-resolver.test.ts
git commit -m "feat(skill): add next_cast_instant buff hook for spell cast time"
```

---

## Task 9: 集成 `tickPeriodicBuffs` 到 game loop

**Files:**
- Modify: `src/game/game-scene.ts`
- Modify: `src/game/player-input-driver.ts`
- Modify: `src/game/battle-runner.ts`
- Modify: `src/jobs/sim-test-utils.ts`

**目的**：将 `tickPeriodicBuffs` 挂到游戏主循环，同时保证**所有 alive entity**（不仅仅玩家）的 duration 也 tick 下去。这是历史 tech debt（当前 `BuffSystem.update` 只对玩家调用）。

核心改动：
1. `game-scene.ts` 主 tick 回调里，playerDriver.update 之后，loop `entityMgr.getAlive()` 为每个 entity 调一次 `buffSystem.update(entity, dt)`（非玩家此前从不 tick），然后统一调一次 `tickPeriodicBuffs(alive, logicTime, buffSystem)`
2. `battle-runner.ts` 同样在主 tick 里加
3. `player-input-driver.ts` 的 `buffSystem.update(p, dt)` 调用**删除**（移到 game-scene 层，避免双 tick）
4. `sim-test-utils.ts` 同步推进 gameTime + 所有 entity buff + periodic tick

- [ ] **Step 1：game-scene.ts 改造主 tick**

定位 `src/game/game-scene.ts` 的 `start()` 方法（约 145 行），`this.playerDriver.update(dt)` 调用之后添加 entity-wide buff + periodic tick：

```ts
// src/game/game-scene.ts — start() 方法内
import { tickPeriodicBuffs } from '@/combat/buff-periodic'

start(): void {
  this.gameLoop.onUpdate((dt) => {
    if (this.paused || this.battleOver) return
    if (this.devTerminal.isVisible()) return

    const result = this.playerDriver.update(dt)
    if (result === 'pause') { this.pause(); return }

    // 新增：tick 所有 alive entity 的 buff duration + periodic
    const alive = this.entityMgr.getAlive()
    for (const e of alive) {
      // 玩家的 duration tick 已经在 player-input-driver 里做了 —— 稍后改掉让其只对 non-player 做
      // Phase 3 统一到这里做（见 Step 2）
      this.buffSystem.update(e, dt)
    }
    tickPeriodicBuffs(alive, this.gameLoop.logicTime, this.buffSystem)

    this.onLogicTick?.(dt)

    this.displacer.update(dt)
    this.zoneMgr.update(dt)
  })
  // ... 其余 render loop 不变
}
```

- [ ] **Step 2：player-input-driver.ts 移除 `buffSystem.update(p, dt)` 调用**

定位 `src/game/player-input-driver.ts:88` 和 `:175` 两处 `this.buffSystem.update(p, dt)` —— **删除**两行（现在由 game-scene 统一处理所有 entity）。

```bash
grep -n "buffSystem.update" src/game/player-input-driver.ts
```

每处：
```ts
// 删除此行
this.buffSystem.update(p, dt)
```

- [ ] **Step 3：battle-runner.ts 同样接入**

定位 `src/game/battle-runner.ts` 的主 tick loop（约 480 行附近，"Update AI for all enabled entities" 之前）。battle-runner 走独立 loop（encounter-based），需要单独接入 periodic tick：

```ts
// src/game/battle-runner.ts — 主 tick callback 内（在 Update AI 循环之前）
import { tickPeriodicBuffs } from '@/combat/buff-periodic'

// ... 主 loop
const alive = s.entityMgr.getAlive()
for (const e of alive) {
  s.buffSystem.update(e, dt)
}
tickPeriodicBuffs(alive, s.gameLoop.logicTime, s.buffSystem)

// Update AI for all enabled entities
for (const entityId of aiEnabled) {
  // ... 原逻辑不变
}
```

（battle-runner 内的 `s.gameLoop` / `s.buffSystem` / `s.entityMgr` 具体名字视 file actual 结构调整，如果没 `s.gameLoop` 则从 game-scene 来源获取 logicTime，implementer 定位）

- [ ] **Step 4：sim-test-utils.ts 同步 gameTime + periodic tick**

定位 `src/jobs/sim-test-utils.ts` 的主循环（约 140 行）。把 `buffSystem.update(player, TICK)` 扩展为全 entity tick + periodic tick：

```ts
// src/jobs/sim-test-utils.ts — 替换 tick 内的 buff update 段
import { tickPeriodicBuffs } from '@/combat/buff-periodic'

// ... 主循环内
const TICK = 100
for (let t = 0; t < duration; t += TICK) {
  // 用 t 作 gameTime (recall sim 从 0 开始，TICK 递增)
  // 改为 tick 所有 alive entity
  for (const e of entityMgr.getAlive()) {
    buffSystem.update(e, TICK)
  }
  tickPeriodicBuffs(entityMgr.getAlive(), t + TICK, buffSystem)
  // 说明：periodic tick 使用帧结束时间戳（t+TICK），这样首 tick 在 interval 后的第一帧就命中

  // ...其余原逻辑（passive buff / auto-attack / GCD）保持不变
}
```

- [ ] **Step 5：typecheck + test:run 全量**

```bash
pnpm typecheck
pnpm test:run
```
Expected：所有现有测试通过（不应破坏已有 job 测试；若现有 job 测试因为 caster buff 过期后某些冻结行为差异而失败，逐个分析）

注意现有 bard 的 `passiveBuffs: [{ buffId: 'brd_pitch', ... }]` 机制是基于 sim-test-utils 自己的 passiveTimers，不走 periodic framework；不会受影响。

- [ ] **Step 6：commit**

```bash
git add src/game/game-scene.ts src/game/player-input-driver.ts src/game/battle-runner.ts src/jobs/sim-test-utils.ts
git commit -m "feat(combat): integrate periodic tick into main game loop (all entities)"
```

---

## Task 10: `ROLE_LUCID_DREAMING` + `lucid_dreaming` buff

**Files:**
- Modify: `src/jobs/commons/role-skills.ts`
- Modify: `src/jobs/commons/buffs.ts`
- Test 覆盖由 Task 13 的咒术师测试间接覆盖；本 task 只做定义。

- [ ] **Step 1：在 `src/jobs/commons/role-skills.ts` 末尾追加**

```ts
// src/jobs/commons/role-skills.ts 追加
/** Caster role skill: MP regen over time (21s / 3s interval = 7 ticks × 5% = 35% max MP) */
export const ROLE_LUCID_DREAMING: SkillDef = {
  id: 'role_lucid_dreaming',
  name: '醒梦',
  type: 'ability',
  castTime: 0,
  cooldown: 60000,
  gcd: false,
  targetType: 'single',
  requiresTarget: false,
  range: 0,
  mpCost: 0,
  effects: [{ type: 'apply_buff', buffId: 'lucid_dreaming' }],
}
```

- [ ] **Step 2：在 `src/jobs/commons/buffs.ts` 的 `COMMON_BUFFS` 里追加 `lucid_dreaming`**

```ts
// src/jobs/commons/buffs.ts — COMMON_BUFFS 追加
lucid_dreaming: {
  id: 'lucid_dreaming',
  name: '醒梦',
  description: '持续恢复 MP。',
  type: 'buff',
  duration: 21000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'mp_regen', potency: 0.05, interval: 3000 }],
},
```

注意：icon 字段不写（per spec §3.5，用户后补）。

- [ ] **Step 3：typecheck**

```bash
pnpm typecheck
```
Expected：PASS

- [ ] **Step 4：commit**

```bash
git add src/jobs/commons/role-skills.ts src/jobs/commons/buffs.ts
git commit -m "feat(jobs): add ROLE_LUCID_DREAMING shared caster role skill"
```

---

## Task 11: 剑术师 SWORDSMAN_JOB（TDD）

**Files:**
- Create: `src/jobs/swordsman/skills.ts`
- Create: `src/jobs/swordsman/status.ts`
- Create: `src/jobs/swordsman/index.ts`
- Create: `src/jobs/swordsman/swordsman.test.ts`

- [ ] **Step 1：创建 swordsman.test.ts（DPM 健康 + 架式行为）**

```ts
// src/jobs/swordsman/swordsman.test.ts
import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill, SIM_DURATION } from '../sim-test-utils'
import { SWORDSMAN_JOB } from './index'

describe('Swordsman DPM', () => {
  const job = SWORDSMAN_JOB
  const slash = skill(job, 'swm_heavy_slash')
  const guard = skill(job, 'swm_guard')

  it('正确循环: 重斩 + 架式 weave — DPM in 0.70-0.80× baseline', () => {
    const result = simulate(job, {
      gcdCycle: [slash, slash, slash, slash, slash],
      ogcds: [{ skill: guard }],
    })
    printResult('Swordsman (正确循环)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.70-0.80× = 38080-43520
    expect(totalOver60s).toBeGreaterThan(38000)
    expect(totalOver60s).toBeLessThan(45000)
  })

  it('111 兜底: 只按重斩 — DPM 降 5-10% vs 正确循环', () => {
    const result = simulate(job, { gcdCycle: [slash] })
    printResult('Swordsman (只按 1)', job, result)
    // 无 buff → 应略低于正确循环
    const totalOver60s = result.dps * 60
    expect(totalOver60s).toBeGreaterThan(33000)
    expect(totalOver60s).toBeLessThan(42000)
  })
})

describe('架式 buff 行为', () => {
  it('架式 apply 后给 caster 挂 damage_increase 0.20, duration 8s', () => {
    // 直接构 buff 系统验证 buff def
    expect(SWORDSMAN_JOB.buffs.swm_guard).toBeDefined()
    const def = SWORDSMAN_JOB.buffs.swm_guard
    expect(def.duration).toBe(8000)
    expect(def.effects).toEqual([{ type: 'damage_increase', value: 0.20 }])
  })
})
```

- [ ] **Step 2：运行确认 fail**

```bash
pnpm test:run src/jobs/swordsman/swordsman.test.ts
```
Expected：FAIL（file 不存在）

- [ ] **Step 3：创建 `src/jobs/swordsman/skills.ts`**

```ts
// src/jobs/swordsman/skills.ts
import type { SkillDef } from '@/core/types'

export const SWORDSMAN_SKILLS: SkillDef[] = [
  // 1: 重斩 — 物理近战 GCD，单体，无 cd
  {
    id: 'swm_heavy_slash',
    name: '重斩',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 4,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.5 }],
  },
  // 2: 架式 — oGCD buff，cd 30s，自用 +20% 伤害 8s
  {
    id: 'swm_guard',
    name: '架式',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'swm_guard' }],
  },
]
```

- [ ] **Step 4：创建 `src/jobs/swordsman/status.ts`**

```ts
// src/jobs/swordsman/status.ts
import type { BuffDef } from '@/core/types'

export const SWORDSMAN_BUFFS: Record<string, BuffDef> = {
  swm_guard: {
    id: 'swm_guard',
    name: '架式',
    description: '攻击力提升 20%。',
    type: 'buff',
    duration: 8000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.20 }],
  },
}
```

- [ ] **Step 5：创建 `src/jobs/swordsman/index.ts`**

```ts
// src/jobs/swordsman/index.ts
import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { MELEE_AUTO, ROLE_DASH, ROLE_BACKSTEP, ROLE_SECOND_WIND } from '../commons/role-skills'
import { SWORDSMAN_SKILLS } from './skills'
import { SWORDSMAN_BUFFS } from './status'

export const SWORDSMAN_JOB: PlayerJob = {
  id: 'swordsman',
  name: '剑术师',
  description: '以单手剑战斗的新晋冒险者。重斩是你唯一的主动输出手段，搭配架式的短暂爆发窗口就能完成循环。攻防均衡，适合新手。',
  category: JobCategory.Melee,
  stats: {
    hp: 7500,
    mp: 10000,
    attack: 700,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...SWORDSMAN_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...SWORDSMAN_SKILLS, ROLE_SECOND_WIND], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(SWORDSMAN_BUFFS),
  buffMap: mergeBuffMap(SWORDSMAN_BUFFS),
}
```

- [ ] **Step 6：run test**

```bash
pnpm test:run src/jobs/swordsman/swordsman.test.ts
```
Expected：全部 PASS。DPM 结果打印到 console 对照 spec §4.1 的 ~41,317（0.76×）预估。若实测偏离过大（±5%），回来调 potency 或 ATK。

- [ ] **Step 7：commit**

```bash
git add src/jobs/swordsman/
git commit -m "feat(jobs): add swordsman base job (melee, 1 GCD + guard oGCD)"
```

---

## Task 12: 弓箭手 ARCHER_JOB（TDD）

**Files:**
- Create: `src/jobs/archer/skills.ts`
- Create: `src/jobs/archer/status.ts`
- Create: `src/jobs/archer/index.ts`
- Create: `src/jobs/archer/archer.test.ts`

- [ ] **Step 1：创建 archer.test.ts**

```ts
// src/jobs/archer/archer.test.ts
import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill } from '../sim-test-utils'
import { ARCHER_JOB } from './index'

describe('Archer DPM', () => {
  const job = ARCHER_JOB
  const heavyShot = skill(job, 'arc_heavy_shot')
  const venomShot = skill(job, 'arc_venom_shot')
  const barrage = skill(job, 'arc_barrage')

  it('正确循环：强射 + 18s 一次毒箭 + barrage — DPM in 0.78-0.85× baseline', () => {
    // 循环：6 次强射 + 1 次毒箭 = 7 GCDs ≈ 17.5s
    const result = simulate(job, {
      gcdCycle: [heavyShot, heavyShot, heavyShot, heavyShot, heavyShot, heavyShot, venomShot],
      ogcds: [{ skill: barrage }],
    })
    printResult('Archer (正确循环)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.78-0.85× = 42432-46240
    expect(totalOver60s).toBeGreaterThan(42000)
    expect(totalOver60s).toBeLessThan(47000)
  })
})

describe('毒药箭 DoT 行为', () => {
  it('arc_venom buff def: dot effect 0.3 / 3s interval / 18s duration', () => {
    const def = ARCHER_JOB.buffs.arc_venom
    expect(def.duration).toBe(18000)
    expect(def.effects).toEqual([{ type: 'dot', potency: 0.3, interval: 3000 }])
  })

  it('arc_barrage buff def: damage_increase 0.30 / 6s', () => {
    const def = ARCHER_JOB.buffs.arc_barrage
    expect(def.duration).toBe(6000)
    expect(def.effects).toEqual([{ type: 'damage_increase', value: 0.30 }])
  })
})
```

- [ ] **Step 2：run test - fail**

```bash
pnpm test:run src/jobs/archer/archer.test.ts
```

- [ ] **Step 3：创建 `src/jobs/archer/skills.ts`**

```ts
// src/jobs/archer/skills.ts
import type { SkillDef } from '@/core/types'

export const ARCHER_SKILLS: SkillDef[] = [
  {
    id: 'arc_heavy_shot',
    name: '强力射击',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 12,
    mpCost: 0,
    effects: [{ type: 'damage', potency: 1.3 }],
  },
  {
    id: 'arc_venom_shot',
    name: '毒药箭',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 12,
    mpCost: 0,
    effects: [
      { type: 'damage', potency: 0.3 },
      { type: 'apply_buff', buffId: 'arc_venom' },
    ],
  },
  {
    id: 'arc_barrage',
    name: '强化',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'arc_barrage' }],
  },
]
```

**注意**：毒药箭的 `apply_buff` 作用于 target（debuff），不是 caster。本项目现有 `apply_buff` 是否默认 caster 或 target 需 verify —— 查 `src/game/combat-resolver.ts` 的 `applyBuff` 调用：`combat-resolver.ts:apply_buff` 效果实装是否按 damage target 还是 caster。

如果 `apply_buff` 默认给 caster（现有行为），需要新增 `{ type: 'apply_buff'; buffId; target: 'caster' | 'target' }` 字段。检查：

```bash
grep -n "apply_buff" src/game/combat-resolver.ts
```

若现有实装是给 caster（大概率），补充 phase 3 内 task 前置：在 `SkillEffectDef` 的 `apply_buff` 加 target 字段（默认 'caster'），combat-resolver 在命中目标时若 target='target' 则施加到目标。

→ **插入一个子 step**：若 apply_buff 不支持 target 方向，先扩 effect + resolver（约 1 hour 的小工），然后再继续 archer 的技能定义。否则 archer 的 DoT 无法上到 boss。

**子 task 11.5**：`apply_buff` 支持 target=target

对 `src/core/types.ts`：
```ts
| { type: 'apply_buff'; buffId: string; stacks?: number; duration?: number; target?: 'caster' | 'target' }
```
默认 `'caster'`（保持现有行为）。

对 `src/game/combat-resolver.ts` 的 apply_buff dispatch：
```ts
case 'apply_buff': {
  const applyTo = effect.target === 'target' ? target : caster
  this.buffSystem.applyBuff(applyTo, def, caster.id, effect.stacks ?? 1, effect.duration)
  break
}
```

同时 `arc_venom` 的 apply 需要**调 `applyPeriodicBuff` 而非 `applyBuff`**，因为 DoT buff 需要 periodic snapshot。思路：

- combat-resolver 在 apply_buff 命中时检查 `buffDef.effects.some(isPeriodicEffect)` → 若是 periodic buff → 调 `applyPeriodicBuff(applyTo, def, caster, gameTime, buffSystem)`
- 否则走原有 `buffSystem.applyBuff`

**gameTime 来源**：combat-resolver 需要从 game-scene 传入 gameTime getter，或者 combat-resolver 维护自己的 logicTime ref。最简方法：构造时传一个 `gameTimeGetter: () => number`。查 combat-resolver 构造签名：

```bash
grep -n "constructor" src/game/combat-resolver.ts
```

若注入复杂：更简单的做法是 buffSystem 自身拿 gameTime。`BuffSystem.applyBuff` 改签名接 `gameTime` 参数，内部判断 periodic 走 applyPeriodicBuff。

**新增 hook**：`BuffSystem.applyBuff(entity, def, sourceId, stacks=1, durationOverride?, options?: { caster?: Entity; gameTime?: number })`。当 `def` 含 periodic effect + options 提供 caster+gameTime 时，走 applyPeriodicBuff。

Implementer 按现有 combat-resolver 的风格选择。我们这里给出一个方案供参考：

```ts
// src/game/combat-resolver.ts — apply_buff case 新增
case 'apply_buff': {
  const applyTo = effect.target === 'target' ? target : caster
  const def = buffRegistry[effect.buffId] ?? this.buffSystem.getDef(effect.buffId)
  if (!def) break
  const hasPeriodic = def.effects.some((e) => e.type === 'dot' || e.type === 'hot' || e.type === 'mp_regen')
  if (hasPeriodic) {
    applyPeriodicBuff(applyTo, def, caster, this.gameTimeGetter(), this.buffSystem)
  } else {
    this.buffSystem.applyBuff(applyTo, def, caster.id, effect.stacks ?? 1, effect.duration)
  }
  break
}
```

（`gameTimeGetter` 由 constructor 注入，game-scene 传 `() => this.gameLoop.logicTime`，sim-test-utils 传 `() => tCounter`）

- [ ] **Step 3b：落地 apply_buff target 支持 + periodic apply 分派**

修改顺序：
1. `src/core/types.ts` 的 `SkillEffectDef.apply_buff` 加 `target?: 'caster' | 'target'`
2. `src/game/combat-resolver.ts` 新 constructor 参数 `gameTimeGetter?: () => number`（可选，默认 `() => 0` 测试用）；在 game-scene.ts / battle-runner.ts / sim-test-utils.ts 的 `new CombatResolver(...)` 处补上 getter
3. `combat-resolver.ts` 的 `apply_buff` 分派新加 periodic 判断 + `applyPeriodicBuff` 调用

Test：补一个 test 到 `combat-resolver.test.ts` 或 archer.test.ts —— apply venom_shot 到 boss，验证 boss.buffs 里有 periodic arc_venom buff。

- [ ] **Step 4：创建 `src/jobs/archer/status.ts`**

```ts
// src/jobs/archer/status.ts
import type { BuffDef } from '@/core/types'

export const ARCHER_BUFFS: Record<string, BuffDef> = {
  arc_venom: {
    id: 'arc_venom',
    name: '中毒',
    description: '持续受到物理伤害。',
    type: 'debuff',
    duration: 18000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'dot', potency: 0.3, interval: 3000 }],
  },
  arc_barrage: {
    id: 'arc_barrage',
    name: '强化',
    description: '攻击力提升 30%。',
    type: 'buff',
    duration: 6000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'damage_increase', value: 0.30 }],
  },
}
```

- [ ] **Step 5：更新 archer skills.ts 的毒药箭 `apply_buff` effect 加 target=target**

```ts
// src/jobs/archer/skills.ts — arc_venom_shot 的 effects 段改为
effects: [
  { type: 'damage', potency: 0.3 },
  { type: 'apply_buff', buffId: 'arc_venom', target: 'target' },
],
```

- [ ] **Step 6：创建 `src/jobs/archer/index.ts`**

```ts
// src/jobs/archer/index.ts
import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { PHYS_RANGED_AUTO, ROLE_DASH_FORWARD, ROLE_BACKSTEP, ROLE_SECOND_WIND } from '../commons/role-skills'
import { ARCHER_SKILLS } from './skills'
import { ARCHER_BUFFS } from './status'

export const ARCHER_JOB: PlayerJob = {
  id: 'archer',
  name: '弓箭手',
  description: '以弓矢远程狙击的猎人。强力射击是稳定输出，毒药箭让敌人持续流血，强化爆发窗口内能打出爆炸伤害。机动性强，善于风筝走打。',
  category: JobCategory.PhysRanged,
  stats: {
    hp: 6500,
    mp: 10000,
    attack: 900,
    speed: 5,
    autoAttackRange: 10,
  },
  skills: [...ARCHER_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH_FORWARD], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: PHYS_RANGED_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...ARCHER_SKILLS, ROLE_SECOND_WIND], ROLE_DASH_FORWARD, ROLE_BACKSTEP),
  buffs: mergeBuffs(ARCHER_BUFFS),
  buffMap: mergeBuffMap(ARCHER_BUFFS),
}
```

- [ ] **Step 7：run tests**

```bash
pnpm test:run src/jobs/archer/archer.test.ts
pnpm typecheck
```
Expected：all PASS, DPM within 0.78-0.85× range

- [ ] **Step 8：commit**

```bash
git add src/jobs/archer/ src/core/types.ts src/game/combat-resolver.ts src/game/game-scene.ts src/game/battle-runner.ts src/jobs/sim-test-utils.ts
git commit -m "feat(jobs): add archer base job (phys ranged, DoT venom + barrage)"
```

---

## Task 13: 咒术师 THAUMATURGE_JOB（TDD）

**Files:**
- Create: `src/jobs/thaumaturge/skills.ts`
- Create: `src/jobs/thaumaturge/status.ts`
- Create: `src/jobs/thaumaturge/index.ts`
- Create: `src/jobs/thaumaturge/thaumaturge.test.ts`

- [ ] **Step 1：创建 thaumaturge.test.ts**

```ts
// src/jobs/thaumaturge/thaumaturge.test.ts
import { describe, it, expect } from 'vitest'
import { simulate, printResult, skill } from '../sim-test-utils'
import { THAUMATURGE_JOB } from './index'

describe('Thaumaturge DPM', () => {
  const job = THAUMATURGE_JOB
  const stone = skill(job, 'thm_stone')
  const swiftcast = skill(job, 'thm_swiftcast')

  it('正确循环：辉石魔砾 spam + swiftcast 省读条 — DPM in 0.82-0.92× baseline', () => {
    const result = simulate(job, {
      gcdCycle: [stone],
      ogcds: [{ skill: swiftcast }],
    })
    printResult('Thaumaturge (纯 stone spam + swift)', job, result)
    const totalOver60s = result.dps * 60
    // baseline 54400; 0.82-0.92× = 44608-50048
    expect(totalOver60s).toBeGreaterThan(42000)
    expect(totalOver60s).toBeLessThan(52000)
  })
})

describe('即刻咏唱 + 醒梦 buff def', () => {
  it('thm_swiftcast_ready: next_cast_instant, consumeOnCast true, 10s', () => {
    const def = THAUMATURGE_JOB.buffs.thm_swiftcast_ready
    expect(def.duration).toBe(10000)
    expect(def.effects).toEqual([{ type: 'next_cast_instant', consumeOnCast: true }])
  })

  it('lucid_dreaming: mp_regen 0.05 / 3s / 21s', () => {
    const def = THAUMATURGE_JOB.buffs.lucid_dreaming
    expect(def.duration).toBe(21000)
    expect(def.effects).toEqual([{ type: 'mp_regen', potency: 0.05, interval: 3000 }])
  })
})
```

- [ ] **Step 2：run - fail**

```bash
pnpm test:run src/jobs/thaumaturge/thaumaturge.test.ts
```

- [ ] **Step 3：创建 `src/jobs/thaumaturge/skills.ts`**

```ts
// src/jobs/thaumaturge/skills.ts
import type { SkillDef } from '@/core/types'

export const THAUMATURGE_SKILLS: SkillDef[] = [
  {
    id: 'thm_stone',
    name: '辉石魔砾',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: true,
    range: 20,
    mpCost: 400,
    effects: [{ type: 'damage', potency: 2.0 }],
  },
  {
    id: 'thm_cure',
    name: '治疗',
    type: 'spell',
    castTime: 2000,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 2400,
    effects: [{ type: 'heal', potency: 5 }],
  },
  {
    id: 'thm_swiftcast',
    name: '即刻咏唱',
    type: 'ability',
    castTime: 0,
    cooldown: 40000,
    gcd: false,
    targetType: 'single',
    requiresTarget: false,
    range: 0,
    mpCost: 0,
    effects: [{ type: 'apply_buff', buffId: 'thm_swiftcast_ready' }],
  },
]
```

- [ ] **Step 4：创建 `src/jobs/thaumaturge/status.ts`**

```ts
// src/jobs/thaumaturge/status.ts
import type { BuffDef } from '@/core/types'

export const THAUMATURGE_BUFFS: Record<string, BuffDef> = {
  thm_swiftcast_ready: {
    id: 'thm_swiftcast_ready',
    name: '即刻咏唱',
    description: '下一次咏唱立即完成。',
    type: 'buff',
    duration: 10000,
    stackable: false,
    maxStacks: 1,
    effects: [{ type: 'next_cast_instant', consumeOnCast: true }],
  },
}
```

- [ ] **Step 5：创建 `src/jobs/thaumaturge/index.ts`**

```ts
// src/jobs/thaumaturge/index.ts
import type { PlayerJob } from '../shared'
import { JobCategory, mergeBuffs, mergeBuffMap, buildSkillBar } from '../shared'
import { CASTER_AUTO, ROLE_DASH, ROLE_BACKSTEP, ROLE_LUCID_DREAMING } from '../commons/role-skills'
import { THAUMATURGE_SKILLS } from './skills'
import { THAUMATURGE_BUFFS } from './status'

export const THAUMATURGE_JOB: PlayerJob = {
  id: 'thaumaturge',
  name: '咒术师',
  description: '以魔法杖吟唱咒文的学徒。辉石魔砾是慢读条高伤害的主输出，治疗能应急自救，即刻咏唱让你在机动战中抢一个瞬发窗口。身板脆弱，走位是生存关键。',
  category: JobCategory.Caster,
  stats: {
    hp: 6500,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...THAUMATURGE_SKILLS, ROLE_LUCID_DREAMING],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: CASTER_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...THAUMATURGE_SKILLS, ROLE_LUCID_DREAMING], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(THAUMATURGE_BUFFS),
  buffMap: mergeBuffMap(THAUMATURGE_BUFFS),
}
```

- [ ] **Step 6：run tests**

```bash
pnpm test:run src/jobs/thaumaturge/thaumaturge.test.ts
pnpm typecheck
```
Expected：all PASS. DPM 打印对照 spec §4.3 ~47,400（0.87×）。

- [ ] **Step 7：commit**

```bash
git add src/jobs/thaumaturge/
git commit -m "feat(jobs): add thaumaturge base job (caster, swiftcast + lucid)"
```

---

## Task 14: 注册 3 个 job 到 `JOBS` 数组

**Files:**
- Modify: `src/jobs/index.ts`

- [ ] **Step 1：打开 `src/jobs/index.ts` 并修改**

```ts
// src/jobs/index.ts
export { JobCategory, JOB_CATEGORY_LABELS, mergeBuffs, mergeBuffMap, buildSkillBar } from './shared'
export type { PlayerJob } from './shared'
export { classJobIcon } from './commons/icon-paths'
export { COMMON_BUFFS } from './commons/buffs'
export { WARRIOR_JOB } from './warrior/index'
export { SAMURAI_JOB } from './samurai/index'
export { BLACK_MAGE_JOB } from './black-mage/index'
export { BARD_JOB } from './bard/index'
export { DARK_KNIGHT_JOB } from './dark-knight/index'
export { PALADIN_JOB } from './paladin/index'
export { SWORDSMAN_JOB } from './swordsman/index'
export { ARCHER_JOB } from './archer/index'
export { THAUMATURGE_JOB } from './thaumaturge/index'

import type { PlayerJob } from './shared'
import { WARRIOR_JOB } from './warrior/index'
import { SAMURAI_JOB } from './samurai/index'
import { BLACK_MAGE_JOB } from './black-mage/index'
import { BARD_JOB } from './bard/index'
import { DARK_KNIGHT_JOB } from './dark-knight/index'
import { PALADIN_JOB } from './paladin/index'
import { SWORDSMAN_JOB } from './swordsman/index'
import { ARCHER_JOB } from './archer/index'
import { THAUMATURGE_JOB } from './thaumaturge/index'

/** All available jobs — base jobs first for easier JobPicker default sort */
export const JOBS: PlayerJob[] = [
  SWORDSMAN_JOB, ARCHER_JOB, THAUMATURGE_JOB,  // 3 base jobs
  WARRIOR_JOB, SAMURAI_JOB, BLACK_MAGE_JOB, BARD_JOB, DARK_KNIGHT_JOB, PALADIN_JOB,
]

export function getJob(id: string): PlayerJob {
  return JOBS.find(j => j.id === id) ?? WARRIOR_JOB
}

/** Get only base jobs (for JobPicker UI) */
export function getBaseJobs(): PlayerJob[] {
  return [SWORDSMAN_JOB, ARCHER_JOB, THAUMATURGE_JOB]
}
```

- [ ] **Step 2：typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3：commit**

```bash
git add src/jobs/index.ts
git commit -m "feat(jobs): register swordsman/archer/thaumaturge to JOBS registry"
```

---

## Task 15: `TowerRunPhase` 改名 + 新增 `ready-to-descend`

**Files:**
- Modify: `src/tower/types.ts`

- [ ] **Step 1：更新 TowerRunPhase union 与注释**

```ts
// src/tower/types.ts — TowerRunPhase 段落改为
/**
 * 运行阶段（状态机 discriminator；spec §7.4 / phase 3 §3.4）.
 *
 * 语义：
 * - 'no-run': 没有 run 实例；根据 savedRunExists 决定显示无存档 / 有存档 UI
 * - 'selecting-job': 玩家在职业选择卡片界面，run 尚未创建
 * - 'ready-to-descend': run 已创建落盘，玩家在 pre-descent lobby，等待点"开始下潜"
 * - 'in-path': 地图推进中
 * - 'in-combat': 战斗中（phase 4/5 启用）
 * - 'ended': 本局结束（胜利或决心耗尽）
 *
 * 注：phase 3 以前 'selecting-job' 旧义是 pre-descent lobby；
 * 现已拆分为 'selecting-job'（选职业） + 'ready-to-descend'（准备下潜）两 phase。
 */
export type TowerRunPhase =
  | 'no-run'
  | 'selecting-job'
  | 'ready-to-descend'
  | 'in-path'
  | 'in-combat'
  | 'ended'
```

- [ ] **Step 2：typecheck（可能暴露依赖旧字符串的地方）**

```bash
pnpm typecheck
```
若任何地方 hardcode 旧 `'selecting-job'` 语义，typecheck 不会报（字符串字面量不变），但 runtime 行为受影响。下 task 会逐个处理 store。

- [ ] **Step 3：commit**

```bash
git add src/tower/types.ts
git commit -m "refactor(tower): add ready-to-descend phase, redefine selecting-job semantics"
```

---

## Task 16: `useTowerStore.startNewRun` 改 phase 到 `ready-to-descend`

**Files:**
- Modify: `src/stores/tower.ts:93-98`

- [ ] **Step 1：追加 failing test**

```ts
// src/stores/tower.test.ts — 若不存在新建；若已存在追加
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTowerStore } from './tower'

describe('useTowerStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('startNewRun sets phase to ready-to-descend (not selecting-job)', () => {
    const tower = useTowerStore()
    tower.startNewRun('swordsman', 'test-seed')
    expect(tower.phase).toBe('ready-to-descend')
    expect(tower.run?.baseJobId).toBe('swordsman')
  })
})
```

- [ ] **Step 2：run - fail**

```bash
pnpm test:run src/stores/tower.test.ts
```
Expected：fail（phase 还是 `'selecting-job'`）

- [ ] **Step 3：修改 `src/stores/tower.ts:93-98` 的 startNewRun**

```ts
function startNewRun(baseJobId: BaseJobId, seed?: string): void {
  run.value = createInitialRun(baseJobId, seed ?? generateSeed())
  phase.value = 'ready-to-descend'  // 原为 'selecting-job'
  savedRunExists.value = true
  schemaResetNotice.value = false
}
```

此外 `startDescent` 的 phase 检查也要更新（原检查 `phase !== 'selecting-job'`）：

```ts
// src/stores/tower.ts — startDescent 内的 phase 检查
if (phase.value !== 'ready-to-descend') {
  console.warn(`[tower] startDescent called in wrong phase: ${phase.value}`)
  return
}
```

- [ ] **Step 4：run test**

```bash
pnpm test:run src/stores/tower.test.ts
```

- [ ] **Step 5：commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "refactor(tower): startNewRun sets ready-to-descend phase"
```

---

## Task 17: `useTowerStore.enterJobPicker` action

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1：追加 failing test**

```ts
// src/stores/tower.test.ts 追加
it('enterJobPicker sets phase to selecting-job without creating a run', () => {
  const tower = useTowerStore()
  tower.enterJobPicker()
  expect(tower.phase).toBe('selecting-job')
  expect(tower.run).toBeNull()
  expect(tower.savedRunExists).toBe(false)
})
```

- [ ] **Step 2：run - fail**

- [ ] **Step 3：加 `enterJobPicker` action**

```ts
// src/stores/tower.ts — actions 段追加
function enterJobPicker(): void {
  if (run.value !== null) {
    console.warn('[tower] enterJobPicker called while run exists; ignoring')
    return
  }
  phase.value = 'selecting-job'
}

// 记得在 return 里 export
return {
  phase,
  run,
  savedRunExists,
  currentBaseJobId,
  startNewRun,
  continueLastRun,
  resetRun,
  setPhase,
  hydrate,
  startDescent,
  advanceTo,
  enterJobPicker, // ← 新
  schemaResetNotice,
  dismissSchemaNotice,
}
```

- [ ] **Step 4：run test PASS**

- [ ] **Step 5：commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): add enterJobPicker store action for selecting-job phase"
```

---

## Task 18: `useTowerStore.hydrate` 加载 run 数据

**Files:**
- Modify: `src/stores/tower.ts:188-191`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1：追加 failing test**

```ts
// src/stores/tower.test.ts 追加
import { saveTowerRun, clearTowerRun } from '@/tower/persistence'
import type { TowerRun } from '@/tower/types'
import { TOWER_RUN_SCHEMA_VERSION } from '@/tower/types'

async function injectSavedRun(partial: Partial<TowerRun> = {}): Promise<void> {
  const run: TowerRun = {
    schemaVersion: TOWER_RUN_SCHEMA_VERSION,
    runId: 'test-run',
    seed: 'test-seed',
    graphSource: { kind: 'random' },
    startedAt: Date.now(),
    baseJobId: 'swordsman',
    towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} },
    currentNodeId: 0,
    determination: 5,
    maxDetermination: 5,
    level: 1,
    crystals: 0,
    currentWeapon: null,
    advancedJobId: null,
    materia: [],
    activatedMateria: [],
    relics: [],
    scoutedNodes: {},
    completedNodes: [],
    ...partial,
  }
  await saveTowerRun(run)
}

describe('useTowerStore.hydrate', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await clearTowerRun()
  })

  it('hydrate loads run data into run.value when schema matches, phase stays no-run', async () => {
    await injectSavedRun({ level: 4, crystals: 127 })
    const tower = useTowerStore()
    await tower.hydrate()
    expect(tower.phase).toBe('no-run')
    expect(tower.savedRunExists).toBe(true)
    expect(tower.run?.level).toBe(4)
    expect(tower.run?.crystals).toBe(127)
  })

  it('hydrate leaves run null when no save exists', async () => {
    const tower = useTowerStore()
    await tower.hydrate()
    expect(tower.savedRunExists).toBe(false)
    expect(tower.run).toBeNull()
  })
})
```

需要 install `fake-indexeddb` 如果 vitest 还没拉（用户提到已装）。

- [ ] **Step 2：run - fail**

```bash
pnpm test:run src/stores/tower.test.ts
```

- [ ] **Step 3：修改 hydrate**

```ts
// src/stores/tower.ts — hydrate 改为
async function hydrate(): Promise<void> {
  const loaded = await loadTowerRun()
  savedRunExists.value = loaded !== null
  if (loaded && loaded.schemaVersion === TOWER_RUN_SCHEMA_VERSION) {
    // 填 run 以便 no-run UI 显示摘要；不改 phase
    suppressPersist = true
    run.value = loaded
    await nextTick()
    suppressPersist = false
  }
}
```

- [ ] **Step 4：run test PASS**

- [ ] **Step 5：commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): hydrate loads run data for no-run save summary UI"
```

---

## Task 19: `useTowerStore.continueLastRun` 推断 phase

**Files:**
- Modify: `src/stores/tower.ts:100-124`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1：追加 failing test**

```ts
// src/stores/tower.test.ts 追加
it('continueLastRun infers ready-to-descend when graph.nodes is empty', async () => {
  await injectSavedRun({ towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: {} } })
  const tower = useTowerStore()
  await tower.hydrate()
  await tower.continueLastRun()
  expect(tower.phase).toBe('ready-to-descend')
})

it('continueLastRun infers in-path when graph.nodes is populated', async () => {
  await injectSavedRun({
    towerGraph: { startNodeId: 0, bossNodeId: 13, nodes: { 0: { id: 0, step: 0, slot: 0, kind: 'start', next: [1] }, 1: { id: 1, step: 1, slot: 0, kind: 'mob', next: [] } } },
  })
  const tower = useTowerStore()
  await tower.hydrate()
  await tower.continueLastRun()
  expect(tower.phase).toBe('in-path')
})
```

- [ ] **Step 2：run - fail**

- [ ] **Step 3：修改 continueLastRun**

```ts
// src/stores/tower.ts — continueLastRun 改为
async function continueLastRun(): Promise<void> {
  const loaded = await loadTowerRun()
  if (!loaded) return
  if (loaded.schemaVersion !== TOWER_RUN_SCHEMA_VERSION) {
    console.warn(
      `[tower] saved run schemaVersion ${loaded.schemaVersion} ` +
        `!= current ${TOWER_RUN_SCHEMA_VERSION}, resetting`,
    )
    resetRun()
    schemaResetNotice.value = true
    return
  }
  suppressPersist = true
  run.value = loaded
  // 推断 phase：graph.nodes 空 → ready-to-descend；否则 in-path
  const nodesCount = Object.keys(loaded.towerGraph.nodes).length
  phase.value = nodesCount === 0 ? 'ready-to-descend' : 'in-path'
  savedRunExists.value = true
  await nextTick()
  suppressPersist = false
}
```

- [ ] **Step 4：run test**

- [ ] **Step 5：commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower): continueLastRun infers phase from graph node count"
```

---

## Task 20: `ConfirmDialog.vue` 组件

**Files:**
- Create: `src/components/common/ConfirmDialog.vue`

**自动注册名字**：按现有 `components/menu/MenuShell.vue` 注册为 `<MenuShell>`（观察项目 vite.config 说明和 CLAUDE.md 里的 hud 范例 `<HudHpBar>`），该目录下组件应该注册为 `<CommonConfirmDialog>`。

- [ ] **Step 1：新建文件**

```vue
<!-- src/components/common/ConfirmDialog.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

interface Props {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** danger 样式用红色 confirm 按钮 */
  variant?: 'normal' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'normal',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('cancel')
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template lang="pug">
.confirm-overlay(@click.self="emit('cancel')")
  .confirm-card
    .confirm-title {{ title }}
    .confirm-message(v-if="message") {{ message }}
    .confirm-actions
      button.confirm-btn.cancel(type="button" @click="emit('cancel')") {{ cancelText }}
      button.confirm-btn(type="button" :class="{ danger: variant === 'danger' }" @click="emit('confirm')") {{ confirmText }}
</template>

<style lang="scss" scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}
.confirm-card {
  min-width: 280px;
  max-width: 400px;
  padding: 20px 24px;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ddd;
}
.confirm-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 8px;
}
.confirm-message {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 16px;
}
.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.confirm-btn {
  padding: 6px 14px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: #ccc;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  &.cancel {
    background: rgba(255, 255, 255, 0.02);
  }

  &.danger {
    background: rgba(200, 80, 80, 0.25);
    border-color: rgba(200, 80, 80, 0.5);
    color: #f0c0c0;

    &:hover {
      background: rgba(200, 80, 80, 0.4);
      color: #fff;
    }
  }
}
</style>
```

- [ ] **Step 2：typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3：commit**

```bash
git add src/components/common/ConfirmDialog.vue
git commit -m "feat(ui): add ConfirmDialog common component"
```

---

## Task 21: `JobPickerCard.vue` 组件

**Files:**
- Create: `src/components/tower/JobPickerCard.vue`

- [ ] **Step 1：新建**

```vue
<!-- src/components/tower/JobPickerCard.vue -->
<script setup lang="ts">
import type { PlayerJob } from '@/jobs'
import { JOB_CATEGORY_LABELS } from '@/jobs'
import { computed } from 'vue'

interface Props {
  job: PlayerJob
}
const props = defineProps<Props>()

const emit = defineEmits<{
  pick: [job: PlayerJob]
}>()

const categoryLabel = computed(() => JOB_CATEGORY_LABELS[props.job.category])
const firstThreeSkills = computed(() =>
  props.job.skillBar.slice(0, 3).map(e => e.skill.name),
)
const iconFallback = computed(() => props.job.name.charAt(0))
</script>

<template lang="pug">
button.job-card(type="button" @click="emit('pick', props.job)")
  .job-icon
    //- phase 3: icon 留空；fallback 显示职业首字
    span.icon-fallback {{ iconFallback }}
  .job-info
    .job-name {{ job.name }}
    .job-category {{ categoryLabel }}
    .job-description {{ job.description }}
    .job-skill-preview
      span.skill-chip(v-for="name in firstThreeSkills" :key="name") {{ name }}
</template>

<style lang="scss" scoped>
.job-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  width: 260px;
  min-height: 200px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  color: inherit;
  font-family: inherit;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px);
  }
}
.job-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;

  .icon-fallback {
    font-size: 24px;
    color: #888;
    font-weight: bold;
  }
}
.job-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.job-name {
  font-size: 16px;
  font-weight: bold;
  color: #ddd;
}
.job-category {
  font-size: 11px;
  color: #888;
}
.job-description {
  font-size: 11px;
  line-height: 1.5;
  color: #999;
  margin-top: 4px;
}
.job-skill-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;

  .skill-chip {
    padding: 2px 6px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    color: #aaa;
  }
}
</style>
```

- [ ] **Step 2：typecheck**

- [ ] **Step 3：commit**

```bash
git add src/components/tower/JobPickerCard.vue
git commit -m "feat(ui): add JobPickerCard component"
```

---

## Task 22: `JobPicker.vue` 组件

**Files:**
- Create: `src/components/tower/JobPicker.vue`

- [ ] **Step 1：新建**

```vue
<!-- src/components/tower/JobPicker.vue -->
<script setup lang="ts">
import type { PlayerJob } from '@/jobs'
import { getBaseJobs } from '@/jobs'

const emit = defineEmits<{
  pick: [job: PlayerJob]
  back: []
}>()

const baseJobs = getBaseJobs()
</script>

<template lang="pug">
.job-picker
  .picker-title 选择起始职业
  .picker-subtitle 挑选一个基础职业开始下潜。战斗中可通过拾取武器切换到进阶职业。
  .picker-cards
    TowerJobPickerCard(
      v-for="job in baseJobs"
      :key="job.id"
      :job="job"
      @pick="(j) => emit('pick', j)"
    )
  .picker-footer
    button.tower-btn.tertiary(type="button" @click="emit('back')") 返回
</template>

<style lang="scss" scoped>
.job-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  max-width: 900px;
  width: 90%;
}
.picker-title {
  font-size: 18px;
  color: #ddd;
  font-weight: bold;
}
.picker-subtitle {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  text-align: center;
}
.picker-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
}
.picker-footer {
  margin-top: 16px;
}
.tower-btn {
  padding: 8px 20px;
  font-size: 12px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  &.tertiary { background: rgba(255, 255, 255, 0.02); }
}
</style>
```

注意：模板中用 `TowerJobPickerCard` 对应自动注册名（directoryAsNamespace 规则：`tower/JobPickerCard.vue` → `<TowerJobPickerCard>`）。dev server 启动后如果 console 报找不到组件，观察实际注册名并调整模板。

- [ ] **Step 2：typecheck**

- [ ] **Step 3：commit**

```bash
git add src/components/tower/JobPicker.vue
git commit -m "feat(ui): add JobPicker component rendering 3 base job cards"
```

---

## Task 23: `/tower/index.vue` 加 `ready-to-descend` 分支（搬原 `selecting-job` 内容）

**Files:**
- Modify: `src/pages/tower/index.vue`

**目的**：把当前 `selecting-job` 分支的 "准备下潜 preview" UI 搬到 `ready-to-descend` 分支。为接下来 task 24 的真正 `selecting-job` 腾位置。

- [ ] **Step 1：读当前文件（Task 1 已读过），定位现有 `v-else-if="tower.phase === 'selecting-job' && tower.run"` 块**

- [ ] **Step 2：改 phase 字符串为 `'ready-to-descend'`**

```pug
//- 原 selecting-job 分支改为：
.tower-panel(v-else-if="tower.phase === 'ready-to-descend' && tower.run")
  .tower-title 准备下潜
  .tower-subtitle 确认你的装备后点击开始
  .tower-preview
    .preview-row
      span.label 基础职业
      span.value {{ tower.run.baseJobId }}
    .preview-row
      span.label 种子
      span.value.seed {{ tower.run.seed }}
  .tower-actions
    button.tower-btn.primary(type="button" @click="onStartDescent") 开始下潜
    button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 重置
```

- [ ] **Step 3：typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4：commit**

```bash
git add src/pages/tower/index.vue
git commit -m "refactor(tower): move pre-descent lobby to ready-to-descend phase"
```

---

## Task 24: `/tower/index.vue` 加新 `selecting-job` 分支（JobPicker）

**Files:**
- Modify: `src/pages/tower/index.vue`

- [ ] **Step 1：在 `ready-to-descend` 分支之前加入 `selecting-job`**

```pug
//- 职业选择 (新义 selecting-job)
TowerJobPicker(
  v-else-if="tower.phase === 'selecting-job'"
  @pick="onJobPick"
  @back="tower.setPhase('no-run')"
)
```

- [ ] **Step 2：在 `<script setup>` 内加 onJobPick handler**

```ts
// src/pages/tower/index.vue 的 <script setup> 内加
import type { PlayerJob } from '@/jobs'

function onJobPick(job: PlayerJob): void {
  tower.startNewRun(job.id as BaseJobId)
}
```

记得 import `BaseJobId`：
```ts
import type { BaseJobId } from '@/tower/types'
```

- [ ] **Step 3：同文件 no-run 分支里的"新游戏"按钮改为调 enterJobPicker**

```pug
//- 原 no-run 分支的 新游戏 button
button.tower-btn.primary(type="button" @click="tower.enterJobPicker()") 新游戏
```

（这里的 `@click="onNewGame"` 原 handler 调用 `tower.startNewRun('swordsman')` —— 直接在 template inline 调 `tower.enterJobPicker()`；也可以保留 `onNewGame` 函数只改其内容为 `tower.enterJobPicker()`）

- [ ] **Step 4：typecheck + dev server 手动 smoke test**

```bash
pnpm typecheck
pnpm dev
# 打开浏览器到 /tower，点"新游戏"，看是否进入职业选择画面
```

- [ ] **Step 5：commit**

```bash
git add src/pages/tower/index.vue
git commit -m "feat(tower): add selecting-job phase rendering JobPicker"
```

---

## Task 25: `/tower/index.vue` no-run 分支存档感知

**Files:**
- Modify: `src/pages/tower/index.vue`

- [ ] **Step 1：改 no-run 分支为两个子分支（无存档 vs 有存档）**

```pug
//- no-run 无存档
.tower-panel(v-if="tower.phase === 'no-run' && !tower.savedRunExists")
  .tower-title 爬塔模式
  .tower-subtitle 选择一个入口开始你的攀登
  .tower-actions
    button.tower-btn.primary(type="button" @click="tower.enterJobPicker()") 新游戏
    button.tower-btn.secondary(type="button" disabled) 教程
    button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单

//- no-run 有存档
.tower-panel(v-else-if="tower.phase === 'no-run' && tower.savedRunExists && tower.run")
  .tower-title 爬塔模式
  .tower-subtitle 进行中的下潜
  .run-summary
    .summary-row
      span.label 职业
      span.value {{ displayJobName }}
    .summary-row
      span.label 等级
      span.value {{ tower.run.level }}
    .summary-row
      span.label 水晶
      span.value {{ tower.run.crystals }}
    .summary-row
      span.label 开始于
      span.value {{ startedAtText }}
  .tower-actions
    button.tower-btn.primary(type="button" @click="onContinue") 继续
    button.tower-btn.secondary(type="button" @click="showAbandonDialog = true") 放弃并结算
    button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单
  CommonConfirmDialog(
    v-if="showAbandonDialog"
    title="确定放弃这次攀登吗？"
    message="所有进度将丢失。"
    confirm-text="放弃"
    cancel-text="取消"
    variant="danger"
    @confirm="onAbandon"
    @cancel="showAbandonDialog = false"
  )
```

- [ ] **Step 2：`<script setup>` 内加 computed / helpers**

```ts
// src/pages/tower/index.vue 的 <script setup> 段追加
import { ref, computed } from 'vue'
import { useTimeAgo } from '@vueuse/core'
import { getJob } from '@/jobs'

const showAbandonDialog = ref(false)

const displayJobName = computed(() => {
  if (!tower.run) return ''
  const id = tower.run.advancedJobId ?? tower.run.baseJobId
  return getJob(id).name
})

const startedAtText = computed(() => {
  if (!tower.run) return ''
  // 首选 useTimeAgo；若不满意可 fallback 到 toLocaleString
  return useTimeAgo(tower.run.startedAt).value
})

function onAbandon(): void {
  // TODO(phase 6): 接入结算系统 — 按 GDD §2.16 根据 run.level / run.crystals / run.materia
  //   计算金币奖励并展示结算界面。当前仅 resetRun 回主菜单。
  tower.resetRun()
  showAbandonDialog.value = false
}
```

- [ ] **Step 3：加 `.run-summary` scss**

```scss
// src/pages/tower/index.vue 的 <style scoped> 追加
.run-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  margin-bottom: 12px;

  .summary-row {
    display: flex;
    justify-content: space-between;

    .label { color: #888; }
    .value { color: #ddd; }
  }
}
```

- [ ] **Step 4：typecheck + dev smoke test**

```bash
pnpm typecheck
pnpm dev
# 手动验证：
# - 无存档：显示新游戏/教程(disabled)/返回
# - 有存档（先启动下潜再刷新）：显示存档摘要 + 继续/放弃并结算/返回
# - 放弃并结算 → 确认对话 → 确认清档
```

- [ ] **Step 5：commit**

```bash
git add src/pages/tower/index.vue
git commit -m "feat(tower): save-aware no-run UI with summary card and abandon dialog"
```

---

## Task 26: 最终收尾 —— typecheck / 全测 / 手动 QA

**目的**：确认 phase 3 所有改动整合无破坏；dev server 端到端流转正常。

- [ ] **Step 1：typecheck + 全量 test**

```bash
pnpm typecheck
pnpm test:run
```
Expected：全 PASS。任何失败都要修。

- [ ] **Step 2：dev server 端到端走一遍**

```bash
pnpm dev
```
手动 QA checklist：

- **无存档流转**：
  - [ ] `/` → 点"爬塔"入口进 `/tower`
  - [ ] no-run 无存档面板显示
  - [ ] 点"新游戏" → 进 selecting-job 卡片页，看到 3 张卡片：剑术师 / 弓箭手 / 咒术师
  - [ ] 每张卡片显示：名字 / 类别 / 描述 / 前 3 技能名
  - [ ] 点"返回" → 回 no-run
  - [ ] 选任一职业 → 进 ready-to-descend，显示 baseJobId + seed + 开始下潜按钮
  - [ ] 点"开始下潜" → 进 in-path，显示 Vue Flow 地图
  - [ ] 点地图合法节点 → currentNode 推进
- **有存档流转**：
  - [ ] 进到 in-path 后刷新浏览器 → 回 no-run 有存档面板，显示摘要卡（职业=刚选的；等级=1；水晶=0；开始于="N 秒前"）
  - [ ] 点"继续" → 回到 in-path 地图
  - [ ] 回 no-run 再刷新再"继续" → 仍能恢复
  - [ ] 点"放弃并结算" → 弹二次确认 → 点"放弃"（danger 红色按钮）→ 回 no-run 无存档
  - [ ] 再点"放弃并结算" → 弹对话 → 点"取消" → 对话关闭，存档保留
  - [ ] ESC 键也能关闭对话（ConfirmDialog 的 escape handler）
- **战斗流转**（phase 4 前用单关 simulator QA）：
  - [ ] 进入 `/encounter/[id]`（任意已知 encounter），切 base job 到战斗 → 各 job 的技能能释放
  - [ ] 剑术师架式 apply → buff tooltip 可见 → 8s 后过期
  - [ ] 弓箭手毒药箭上 boss → boss buff tooltip 显示中毒 debuff → 每 3s 有伤害数字跳
  - [ ] 咒术师即刻咏唱 → 下一次辉石魔砾读条消失立即释放 → swift buff 消失
  - [ ] 咒术师醒梦 oGCD → buff apply → 21s 内 MP 持续上涨
  - [ ] DoT 在玩家死亡后仍能 tick（死亡测试）

- [ ] **Step 3：记录 QA 结果**

如果发现问题：记录在 issue 或 branch 的 commit 消息里；能 in-flight 修的直接修并新 commit。

- [ ] **Step 4：最终 commit（若 QA 有小修）**

```bash
git add .
git commit -m "chore(tower): phase 3 final polish from QA"
```

- [ ] **Step 5：准备 squash merge（由用户执行，不自动）**

告知用户：phase 3 feature 分支 `feat/tower-p3-base-jobs` 实装完成，等待 user code review 后由 user squash merge 进 master。

---

## 自检 (plan 写完后 author 自己跑的)

1. **Spec coverage**:
   - ✅ §1-§2 scope: Tasks 1-25 覆盖 IN 清单；OUT 明确不做
   - ✅ §3.1 PlayerJob 复用 → Task 14
   - ✅ §3.2 基础职业数值 → Task 11-13
   - ✅ §3.3 periodic framework → Task 3-7, 9
   - ✅ §3.4 状态机 / phase 推断 → Task 15-19
   - ✅ §3.5 icon 留空 → 贯穿 Task 10-13 & 20-22
   - ✅ §4 三职业数值与技能 → Task 10-13
   - ✅ §5.1-5.3 战斗引擎扩展 → Task 1-2, 3-6, 8, 9
   - ✅ §5.4 测试场景 A-F → Task 7
   - ✅ §6 UI → Task 20-25
   - ✅ §7 文件清单 → 贯穿所有 task
   - ✅ §8 测试策略 → 每个 job test + buff-periodic.test.ts + tower.test.ts
   - ✅ §9 迁移 / 不 bump schemaVersion → Task 19 的 phase 推断实装
2. **Placeholder scan**: 所有 step 都有具体代码 / 具体命令；没有 TBD / 裸 TODO
3. **Type consistency**: `PeriodicState` 在 Task 2 定义，后续 Task 3-6 引用一致；`applyPeriodicBuff` / `firePeriodicTick` / `tickPeriodicBuffs` 签名贯穿一致
4. **Gaps fix**: apply_buff 对 target 方向（Task 12 的子 step 11.5）已识别并 inline 修复
