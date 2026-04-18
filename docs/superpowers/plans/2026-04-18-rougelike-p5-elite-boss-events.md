# Rougelike Tower — Phase 5 (Elite / Boss / Events / Death-Window) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把精英战 / Boss 战 / 事件节点接入爬塔流程；落地超越之力（Echo）作为首个场地机制；引入决心扣减时机重构 + 战败延迟结算 (death window) + 死亡 buff `preserveOnDeath` 处理 + 决心变化 interceptor hook。引擎层新增两个 buff effect modifier (`attack_modifier` / `max_hp_modifier`) 作为 phase 6 魔晶石词条的基建。

**Architecture:** 场地机制 = pool id 进 Registry + 挂载关系内联 encounter yaml；事件 = pool + modal 叠 in-path（不引入新 phase）；决心扣减统一到 `combat:ended{wipe}` 瞬间，走 `changeDetermination(intent)` 单入口 + interceptor 链；战败延迟结算在 battle-runner 层挂 death window（玩家死后 10s 或 DoT 过期窗内继续 tick），boss DoT 打死 → 翻盘胜 → 不扣决心；buff effect `attack_modifier` / `max_hp_modifier` 走基础值乘算分层（`baseAttack × (1 + sum)`），与 `damage_increase` additive 池严格分离。

**Tech Stack:** TypeScript (strict), Vue 3 `<script setup>` + pug + scoped scss + UnoCSS, Pinia, Vitest (colocated `*.test.ts`), YAML (`yaml` pkg), IndexedDB (localspace via existing `src/tower/persistence.ts`).

**Spec reference:** `docs/superpowers/specs/2026-04-18-rougelike-p5-elite-boss-events-design.md`
**Engineering principles:** `docs/tower-engineering-principles.md`
**Deferred backlog:** `docs/tower-deferred-backlog.md`

---

## File Structure Map

### 新建

| 文件 | 责任 |
|------|------|
| `src/tower/pools/battlefield-condition-pool.ts` | Condition pool resolver（照搬 encounter-pool 模板） |
| `src/tower/pools/battlefield-condition-pool.test.ts` | Resolver 单元测试 |
| `public/tower/pools/battlefield-condition-pool.json` | Condition manifest（echo-boss + fallback） |
| `src/tower/pools/event-pool.ts` | Event pool resolver |
| `src/tower/pools/event-pool.test.ts` | Resolver 单元测试 |
| `public/tower/pools/event-pool.json` | Event manifest（5 events + fallback） |
| `src/tower/events/event-loader.ts` | Event YAML parser + `EventDef` schema validation |
| `src/tower/events/event-loader.test.ts` | Parser 单元测试 |
| `src/tower/events/event-evaluator.ts` | `evaluateRequirement` (MongoDB-like comparator) + `applyOutcomes` helpers |
| `src/tower/events/event-evaluator.test.ts` | Evaluator 单元测试 |
| `src/tower/conditions/echo.ts` | `activateEchoCondition` + `activateCondition` dispatcher |
| `src/tower/conditions/echo.test.ts` | Condition activation 单元测试 |
| `src/demo/common-buffs/echo.ts` | `COMMON_BUFFS.echo` BuffDef |
| `src/components/tower/EventOptionPanel.vue` | Event modal（选项列表 + outcome 应用） |
| `src/components/tower/EventOptionPanel.test.ts` | Component 单元测试 |
| `src/components/hud/DeathWindowVignette.vue` | 玩家死亡红色毛边 overlay |
| `public/encounters/tower/elite-fortune-trial.yaml` | 精英 DPS check 向（巴儿达木式） |
| `public/encounters/tower/elite-aoe-marathon.yaml` | 精英 AOE 马拉松向 |
| `public/encounters/tower/boss-tower-warden.yaml` | 终结 boss（3 阶段 + 硬狂暴 + echo condition） |
| `public/tower/events/healing-oasis.yaml` | 治愈绿洲（+1 决心） |
| `public/tower/events/pilgrim-trade.yaml` | 朝圣者交易（双向 trade） |
| `public/tower/events/battle-trap.yaml` | 战斗陷阱（硬扛 vs 付水晶绕） |
| `public/tower/events/training-dummy.yaml` | 训练假人（付水晶换决心） |
| `public/tower/events/mystic-stele.yaml` | 神秘石碑（双向 trade） |
| `public/tower/events/event-fallback.yaml` | Fallback 兜底 |

### 修改

| 文件 | 改动 |
|------|------|
| `src/core/types.ts` | `BuffEffectDef` union 加 `attack_modifier` + `max_hp_modifier` |
| `src/entity/entity.ts` | `Entity` 加 `baseAttack` / `baseMaxHp`；`createEntity` init 赋值 |
| `src/entity/entity.test.ts` | baseAttack/baseMaxHp init 测试 |
| `src/combat/buff.ts` | 加 `getAttackModifier` / `getMaxHpModifier` / `getAttack` / `getMaxHp` / `clearDeathBuffs` |
| `src/combat/buff.test.ts` | 新 helpers 测试 |
| `src/combat/buff-periodic.ts` | `buildPeriodicSnapshot` 改读 `buffSystem.getAttack(caster)` |
| `src/combat/buff-periodic.test.ts` | 回归 + 新 test：attack_modifier 生效路径 |
| `src/game/combat-resolver.ts` | 普攻 / 技能伤害读 `getAttack` |
| `src/game/combat-resolver.test.ts` | 回归 + attack_modifier 集成测 |
| `src/game/battle-runner.ts` | 玩家死亡分支改 `enterDeathWindow`；加 `tickDeathWindow` / `finalizeDeathWindow`；load encounter 后激活 conditions |
| `src/game/encounter-loader.ts` | 解析 `conditions?: string[]` 字段；`EncounterData` 扩展 |
| `src/game/encounter-loader.test.ts` | 新增 conditions 解析测试 |
| `src/config/schema.ts` | `EncounterDef` / `BuffEffectDef` schema 同步（conditions 字段 + attack_modifier/max_hp_modifier effect） |
| `src/tower/types.ts` | `TowerNode.eventId?`；`EventDef` / `EventRequirement` / `EventOutcome` / `NumberComparator` types；`DeterminationInterceptor` / `DeterminationChangeIntent` / `DeterminationChangeResult` |
| `src/stores/tower.ts` | 新增 `changeDetermination(intent)` / `applyEventOutcome(out)` / `onCombatWipe(kind, encounterId)`；替换既有 `deductDeterminationOnWipe`；`startDescent` 扩展 eventId 固化；`interceptors` 实例字段 |
| `src/stores/tower.test.ts` | 新增多组测试 |
| `public/tower/pools/encounter-pool.json` | 追加 2 elite + 1 boss entries |
| `src/components/tower/NodeConfirmPanel.vue` | 移除 elite/boss `[进入]` disabled stub；boss 节点显示场地机制列表 |
| `src/components/tower/EncounterRunner.vue` | mount 后按 encounter.conditions 激活 condition |
| `src/components/hud/BattleEndOverlay.vue` 或 `BattleResultOverlay.vue` | 按钮矩阵重构（mob/elite/boss + 决心==0 退化） |
| `src/pages/tower/index.vue` | event 节点点击 → `EventOptionPanel` modal；`DeathWindowVignette` 挂载；boss 放弃 → ended |
| `docs/brainstorm/2026-04-17-rougelike.md` | §2.14 表 sync（放弃也扣决心） |

---

## Task 顺序依赖图

```
Phase A (引擎基建):     1 → 2 → 3 → 4
Phase B (Pool 基建):    5 → 6 ─┐
                        7 → 8 ─┤
Phase C (决心/死亡):    9 → 10 → 11 → 12 → 13
Phase D (场地机制):    14 → 15 → 16 → 17
Phase E (事件 UI):     18 → 19 → 20
Phase F (YAML 内容):   21 → 22 → 23 → 24
Phase G (UI 整合):     25 → 26 → 27
Phase H (文档):        28
```

---

## Phase A：引擎基建

### Task 1: Entity `baseAttack` / `baseMaxHp` 字段

**Files:**
- Modify: `src/entity/entity.ts`
- Modify: `src/entity/entity.test.ts`

**契约：** `baseAttack` / `baseMaxHp` 在 `createEntity` 时从 opts 赋值；runtime 永不改写（buff 不修改 base 值，只通过 helper 派生）。`attack` / `maxHp` 字段保留为 init 快照，但后续所有伤害/HP 读取必须走 `BuffSystem.getAttack/getMaxHp`。

- [ ] **Step 1: 写测试 — baseAttack / baseMaxHp 在 createEntity 时从 opts 正确赋值**

`src/entity/entity.test.ts` 追加：

```typescript
describe('createEntity base stats', () => {
  it('initializes baseAttack = opts.attack', () => {
    const e = createEntity({ id: 'p', type: 'player', attack: 1234 })
    expect(e.baseAttack).toBe(1234)
    expect(e.attack).toBe(1234)  // init 快照同值
  })

  it('initializes baseMaxHp = opts.hp', () => {
    const e = createEntity({ id: 'p', type: 'player', hp: 99999 })
    expect(e.baseMaxHp).toBe(99999)
    expect(e.maxHp).toBe(99999)
  })

  it('defaults baseAttack / baseMaxHp to 0 when opts omitted', () => {
    const e = createEntity({ id: 'p', type: 'player' })
    expect(e.baseAttack).toBe(0)
    expect(e.baseMaxHp).toBe(0)
  })
})
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `pnpm test src/entity/entity.test.ts`
Expected: FAIL（`baseAttack` / `baseMaxHp` 字段不存在）

- [ ] **Step 3: 修改 Entity interface + createEntity**

`src/entity/entity.ts` — 在 Entity 接口加字段：

```typescript
export interface Entity {
  // ...existing fields
  /**
   * Base attack stat. Set at init; runtime never modified.
   * All attack reads MUST go through `BuffSystem.getAttack(entity)` to include
   * attack_modifier buff effects. Do NOT read `entity.attack` directly.
   */
  baseAttack: number
  /**
   * Base max HP. Set at init; runtime never modified.
   * All maxHp reads MUST go through `BuffSystem.getMaxHp(entity)` to include
   * max_hp_modifier buff effects. Do NOT read `entity.maxHp` directly.
   */
  baseMaxHp: number
  /** @deprecated Retained for init snapshot only. Use `BuffSystem.getAttack(entity)`. */
  attack: number
  /** @deprecated Retained for init snapshot only. Use `BuffSystem.getMaxHp(entity)`. */
  maxHp: number
  // ...其他 existing fields
}
```

在 `createEntity` 函数内：

```typescript
export function createEntity(opts: CreateEntityOpts): Entity {
  const attack = opts.attack ?? 0
  const hp = opts.hp ?? 0
  return {
    // ...existing
    baseAttack: attack,
    baseMaxHp: hp,
    attack,    // init 快照
    maxHp: hp, // init 快照
    hp,
    // ...
  }
}
```

- [ ] **Step 4: 运行测试确认 PASS**

Run: `pnpm test src/entity/entity.test.ts`
Expected: PASS

- [ ] **Step 5: 运行完整回归**

Run: `pnpm test:run`
Expected: 现有测试不破坏（attack / maxHp 字段保留等价）

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: OK

- [ ] **Step 7: Commit**

```bash
git add src/entity/entity.ts src/entity/entity.test.ts
git commit -m "feat(entity): add baseAttack/baseMaxHp fields for buff modifier system"
```

---

### Task 2: `BuffEffectDef` 加 `attack_modifier` / `max_hp_modifier`

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/config/schema.ts`（如果 schema 用 zod/yup 类似校验，同步扩展；否则检查 buffConfig parsing 路径）
- Modify: `src/combat/buff.ts`
- Modify: `src/combat/buff.test.ts`

**契约：** `attack_modifier` / `max_hp_modifier` 是基础值乘算 modifier（`baseStat × (1 + sum)`），与 additive 的 `damage_increase` / `mitigation` 池严格分离。

- [ ] **Step 1: 写测试 — BuffSystem.getAttackModifier / getMaxHpModifier / getAttack / getMaxHp**

`src/combat/buff.test.ts` 追加：

```typescript
describe('BuffSystem modifier stats', () => {
  it('getAttackModifier returns 0 when no attack_modifier buffs', () => {
    const { buffSystem, player } = setup({ playerAttack: 1000 })
    expect(buffSystem.getAttackModifier(player)).toBe(0)
    expect(buffSystem.getAttack(player)).toBe(1000)
  })

  it('getAttackModifier sums multiple attack_modifier effects', () => {
    const { buffSystem, player } = setup({ playerAttack: 1000 })
    const def1: BuffDef = {
      id: 'atk_a', name: 'A', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    const def2: BuffDef = {
      id: 'atk_b', name: 'B', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.10 }],
    }
    buffSystem.applyBuff(player, def1, 'self')
    buffSystem.applyBuff(player, def2, 'self')
    expect(buffSystem.getAttackModifier(player)).toBeCloseTo(0.35)
    expect(buffSystem.getAttack(player)).toBe(1350) // 1000 * 1.35
  })

  it('getMaxHpModifier + getMaxHp parallel behavior', () => {
    const { buffSystem, player } = setup({ playerHp: 10000 })
    const def: BuffDef = {
      id: 'hp_up', name: 'HP Up', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'max_hp_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(player, def, 'self')
    expect(buffSystem.getMaxHpModifier(player)).toBeCloseTo(0.25)
    expect(buffSystem.getMaxHp(player)).toBe(12500) // 10000 * 1.25
  })

  it('max_hp_modifier does NOT modify current hp on apply (FF14 strict)', () => {
    const { buffSystem, player } = setup({ playerHp: 10000 })
    player.hp = 10000 // 满血
    const def: BuffDef = {
      id: 'hp_up', name: 'HP Up', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'max_hp_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(player, def, 'self')
    expect(player.hp).toBe(10000)  // unchanged
    expect(buffSystem.getMaxHp(player)).toBe(12500) // upper limit raised
  })

  it('attack_modifier / max_hp_modifier isolated from damage_increase pool', () => {
    const { buffSystem, player } = setup({ playerAttack: 1000 })
    const atkMod: BuffDef = {
      id: 'atk_mod', name: 'ATK Mod', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    const dmgInc: BuffDef = {
      id: 'dmg_inc', name: 'DMG Inc', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.50 }],
    }
    buffSystem.applyBuff(player, atkMod, 'self')
    buffSystem.applyBuff(player, dmgInc, 'self')
    // attack_modifier 走基础乘算：base 1000 × 1.25 = 1250
    expect(buffSystem.getAttack(player)).toBe(1250)
    // damage_increase 仍走 additive 池（不影响 getAttack）
    expect(buffSystem.getDamageIncreases(player)).toContain(0.50)
  })
})
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `pnpm test src/combat/buff.test.ts`
Expected: FAIL（方法不存在 + effect type 不识别）

- [ ] **Step 3: 扩展 `BuffEffectDef` union**

`src/core/types.ts` 在 `BuffEffectDef` union 末尾追加：

```typescript
export type BuffEffectDef =
  | // ...existing variants
  | { type: 'attack_modifier'; value: number }   // base attack × (1 + sum)
  | { type: 'max_hp_modifier'; value: number }   // base maxHp × (1 + sum)
```

- [ ] **Step 4: 加 BuffSystem helpers**

`src/combat/buff.ts` 在 class BuffSystem 内新增方法（在 `getDamageIncreases` 附近）：

```typescript
getAttackModifier(entity: Entity): number {
  return this.collectEffects(entity)
    .filter(e => e.effect.type === 'attack_modifier')
    .reduce((sum, e) => sum + (e.effect as { type: 'attack_modifier'; value: number }).value, 0)
}

getMaxHpModifier(entity: Entity): number {
  return this.collectEffects(entity)
    .filter(e => e.effect.type === 'max_hp_modifier')
    .reduce((sum, e) => sum + (e.effect as { type: 'max_hp_modifier'; value: number }).value, 0)
}

/**
 * Derived attack = baseAttack × (1 + sum of attack_modifier effects).
 * Isolated from the additive damage_increase pool (which lives in `calculateDamage.increases`).
 */
getAttack(entity: Entity): number {
  return entity.baseAttack * (1 + this.getAttackModifier(entity))
}

/**
 * Derived maxHp = baseMaxHp × (1 + sum of max_hp_modifier effects).
 * Apply-time: current hp NOT adjusted (FF14 strict; depends on idle regen to visually top off).
 * Remove-time: hp clamped to new maxHp if currently exceeding.
 */
getMaxHp(entity: Entity): number {
  return entity.baseMaxHp * (1 + this.getMaxHpModifier(entity))
}
```

- [ ] **Step 5: 运行测试确认 PASS**

Run: `pnpm test src/combat/buff.test.ts`
Expected: PASS

- [ ] **Step 6: 运行完整回归 + typecheck**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS（BuffEffectDef union 扩展不破坏现有 switch 的穷举 — 所有现有 collectors 对 unknown effect type 都是 filter 路径，新 types 自然被忽略）

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/combat/buff.ts src/combat/buff.test.ts
git commit -m "feat(buff): add attack_modifier / max_hp_modifier effect types + BuffSystem derived helpers"
```

---

### Task 3: 迁移 `buff-periodic` / `combat-resolver` 读 `getAttack`

**Files:**
- Modify: `src/combat/buff-periodic.ts`
- Modify: `src/combat/buff-periodic.test.ts`
- Modify: `src/game/combat-resolver.ts`
- Modify: `src/game/combat-resolver.test.ts`

**契约：** DoT snapshot 时 freeze `getAttack(caster)`（含 attack_modifier）；普攻 / 技能伤害也走 `getAttack`。

- [ ] **Step 1: 写测试 — DoT snapshot 使用 attack_modifier**

`src/combat/buff-periodic.test.ts` 追加：

```typescript
describe('buildPeriodicSnapshot attack_modifier integration', () => {
  it('snapshots caster.attack including attack_modifier buffs', () => {
    const caster = createEntity({ id: 'c', type: 'player', attack: 1000 })
    const target = createEntity({ id: 't', type: 'mob', hp: 100000, attack: 0 })
    const bus = new EventBus()
    const buffSystem = new BuffSystem(bus)

    const atkModDef: BuffDef = {
      id: 'atk_mod', name: 'ATK Mod', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(caster, atkModDef, 'self')

    const snap = buildPeriodicSnapshot(
      { type: 'dot', potency: 0.3, interval: 3000 },
      caster, target, buffSystem,
    )
    // getAttack(caster) = 1000 × 1.25 = 1250
    expect(snap.attack).toBe(1250)
  })

  it('snapshot is frozen — removing attack_modifier after apply does not affect snapshotted value', () => {
    // ... 完整测试：apply DoT → remove atk_mod buff → tick → 伤害仍按 snapshot 走
    const caster = createEntity({ id: 'c', type: 'player', attack: 1000 })
    const target = createEntity({ id: 't', type: 'mob', hp: 100000, attack: 0 })
    const bus = new EventBus()
    const buffSystem = new BuffSystem(bus)

    const atkModDef: BuffDef = {
      id: 'atk_mod', name: 'ATK Mod', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(caster, atkModDef, 'self')

    const VENOM_DEF: BuffDef = {
      id: 'venom', name: 'Venom', type: 'debuff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'dot', potency: 0.3, interval: 3000 }],
    }
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // remove atk_mod after DoT applied
    buffSystem.removeBuff(caster, 'atk_mod')

    tickPeriodicBuffs([target], 3000, buffSystem)
    // damage = snapshot.attack 1250 × potency 0.3 = 375
    expect(target.hp).toBe(100000 - 375)
  })
})
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `pnpm test src/combat/buff-periodic.test.ts`
Expected: FAIL（`snap.attack` 仍 = 1000，未走 getAttack）

- [ ] **Step 3: 改 buildPeriodicSnapshot**

`src/combat/buff-periodic.ts` L42-48 改：

```typescript
// dot / hot
return {
  attack: buffSystem.getAttack(caster),  // 改：原为 caster.attack
  casterIncreases: buffSystem.getDamageIncreases(caster),
  potency: effect.potency,
}
```

- [ ] **Step 4: 运行测试确认 PASS**

Run: `pnpm test src/combat/buff-periodic.test.ts`
Expected: PASS

- [ ] **Step 5: 写测试 — combat-resolver 普攻 / 技能也走 getAttack**

`src/game/combat-resolver.test.ts` 追加：

```typescript
describe('combat-resolver attack_modifier integration', () => {
  it('direct skill damage uses getAttack (base × 1+modifier)', () => {
    const { bus, buffSystem, player, boss } = setup({ playerAttack: 1000, bossHp: 999999 })
    const atkModDef: BuffDef = {
      id: 'atk_mod', name: 'ATK Mod', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.50 }],
    }
    buffSystem.applyBuff(player, atkModDef, 'self')
    // damage = getAttack(1500) × potency(2) = 3000
    castSkill(bus, player, makeSkill({
      id: 'hit', effects: [{ type: 'damage', potency: 2 }],
    }))
    expect(boss.hp).toBe(999999 - 3000)
  })
})
```

- [ ] **Step 6: 找 combat-resolver 中所有 entity.attack 读取点并迁移**

先 grep 定位：`grep -n "\.attack" src/game/combat-resolver.ts`

对每个读取点（如 source.attack / caster.attack 在伤害计算路径中），改为 `buffSystem.getAttack(source)` / `buffSystem.getAttack(caster)`。

注意：`entity.attack` 如作为显式函数参数传入（如 `calculateDamage({ attack: ...})`），调用处需改。

- [ ] **Step 7: 运行测试确认 PASS + 完整回归**

Run: `pnpm test:run`
Expected: PASS — 所有现有测试回归通过（无 modifier 时 getAttack === baseAttack === init attack，数值不变）

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: OK

- [ ] **Step 9: Commit**

```bash
git add src/combat/buff-periodic.ts src/combat/buff-periodic.test.ts src/game/combat-resolver.ts src/game/combat-resolver.test.ts
git commit -m "refactor(combat): route all entity.attack reads through BuffSystem.getAttack"
```

---

### Task 4: `BuffSystem.clearDeathBuffs` + `preserveOnDeath` 保留契约

**Files:**
- Modify: `src/combat/buff.ts`
- Modify: `src/combat/buff.test.ts`

**契约：** `clearDeathBuffs(entity)` 移除所有 `preserveOnDeath !== true` 的 buff；保留 `preserveOnDeath: true` 的。Phase 5 无可见消费场景（echo 战斗结束随 scene 销毁），纯预留 hook。

- [ ] **Step 1: 写测试**

`src/combat/buff.test.ts` 追加：

```typescript
describe('BuffSystem.clearDeathBuffs', () => {
  it('removes buffs without preserveOnDeath flag', () => {
    const { buffSystem, player } = setup()
    const regularDef: BuffDef = {
      id: 'regular', name: 'Regular', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.2 }],
    }
    buffSystem.applyBuff(player, regularDef, 'self')
    expect(player.buffs).toHaveLength(1)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(0)
  })

  it('retains buffs with preserveOnDeath: true', () => {
    const { buffSystem, player } = setup()
    const preservedDef: BuffDef = {
      id: 'preserved', name: 'Preserved', type: 'buff', duration: 30000,
      stackable: false, maxStacks: 1, preserveOnDeath: true,
      effects: [{ type: 'mitigation', value: 0.2 }],
    }
    buffSystem.applyBuff(player, preservedDef, 'self')
    expect(player.buffs).toHaveLength(1)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(1)
    expect(player.buffs[0].defId).toBe('preserved')
  })

  it('mixed: retains preserveOnDeath, removes regular', () => {
    const { buffSystem, player } = setup()
    const preserved: BuffDef = {
      id: 'preserved', name: 'P', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      preserveOnDeath: true, effects: [],
    }
    const regular: BuffDef = {
      id: 'regular', name: 'R', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [],
    }
    buffSystem.applyBuff(player, preserved, 'self')
    buffSystem.applyBuff(player, regular, 'self')
    expect(player.buffs).toHaveLength(2)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(1)
    expect(player.buffs[0].defId).toBe('preserved')
  })
})
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `pnpm test src/combat/buff.test.ts`
Expected: FAIL（`clearDeathBuffs` 不存在）

- [ ] **Step 3: 实施**

`src/combat/buff.ts` 加方法：

```typescript
/**
 * Remove all buffs from entity where `preserveOnDeath !== true`.
 * Called on entity death (currently only from `enterDeathWindow` for player).
 *
 * Phase 5 has no visible consumer scenario: echo is bound to scene lifetime
 * (destroyed on scene dispose); retry re-spawns fresh entity with empty buffs.
 * This hook exists as contract reservation for future raise / in-combat respawn systems.
 */
clearDeathBuffs(entity: Entity): void {
  entity.buffs = entity.buffs.filter(inst => {
    const def = this.defMap.get(inst.defId)
    return def?.preserveOnDeath === true
  })
}
```

（注意：如果 `this.defMap` 字段名不同，先 grep `src/combat/buff.ts` 确认。phase 4 encounter loader 注册 local_buffs 时存进的 map 可能叫别的名字。）

- [ ] **Step 4: 运行测试确认 PASS**

Run: `pnpm test src/combat/buff.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + 回归**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/combat/buff.ts src/combat/buff.test.ts
git commit -m "feat(buff): add clearDeathBuffs hook for preserveOnDeath contract"
```

---

## Phase B：Pool 基建

### Task 5: Battlefield-condition pool resolver

**Files:**
- Create: `src/tower/pools/battlefield-condition-pool.ts`
- Create: `src/tower/pools/battlefield-condition-pool.test.ts`

**契约：** 照搬 `encounter-pool.ts` 模板 —— manifest 缓存 / Registry 解析 / Active Pool 抽取 / fallback 防御。

- [ ] **Step 1: 参考 phase 4 模板**

Read `src/tower/pools/encounter-pool.ts` 和 `src/tower/pools/encounter-pool.test.ts`，建立结构心智模型。

- [ ] **Step 2: 写测试**

`src/tower/pools/battlefield-condition-pool.test.ts`：

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetBattlefieldConditionPoolCache,
  FALLBACK_CONDITION_ID,
  loadBattlefieldConditionPool,
  resolveCondition,
  pickConditionIdFromActivePool,
} from './battlefield-condition-pool'

const MANIFEST_OK = {
  manifestVersion: 1,
  entries: [
    {
      id: 'echo-boss',
      kind: 'echo',
      params: { determinationThreshold: 2, allStatsBonusPct: 0.25 },
      scoutSummary: '决心 ≤ 2 时获得超越之力（攻防血 +25%）',
    },
    {
      id: 'echo-fallback',
      kind: 'echo',
      params: { determinationThreshold: 0, allStatsBonusPct: 0 },
      scoutSummary: '（fallback，永不触发）',
      deprecated: 'never-in-pool',
    },
  ],
}

function mockFetch(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response)
}

describe('battlefield-condition-pool', () => {
  afterEach(() => {
    _resetBattlefieldConditionPoolCache()
    vi.restoreAllMocks()
  })

  it('loadBattlefieldConditionPool fetches manifest + caches', async () => {
    const fetchMock = mockFetch(MANIFEST_OK)
    const p1 = await loadBattlefieldConditionPool()
    const p2 = await loadBattlefieldConditionPool()
    expect(p1).toBe(p2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('resolveCondition returns Registry entry including deprecated', async () => {
    mockFetch(MANIFEST_OK)
    const entry = await resolveCondition('echo-fallback')
    expect(entry.id).toBe('echo-fallback')
  })

  it('resolveCondition falls back + console.error on missing', async () => {
    mockFetch(MANIFEST_OK)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const entry = await resolveCondition('missing-id')
    expect(entry.id).toBe(FALLBACK_CONDITION_ID)
    expect(errSpy).toHaveBeenCalled()
  })

  it('resolveCondition throws hard error when even fallback is missing', async () => {
    mockFetch({
      manifestVersion: 1,
      entries: [{ id: 'something-else', kind: 'echo', params: { determinationThreshold: 0, allStatsBonusPct: 0 }, scoutSummary: '' }],
    })
    await expect(resolveCondition('missing')).rejects.toThrow(/FALLBACK/)
  })

  it('pickConditionIdFromActivePool deterministic by seed + excludes deprecated', async () => {
    mockFetch(MANIFEST_OK)
    const a = await pickConditionIdFromActivePool('seed-1', 'boss-tower-warden', 'echo')
    const b = await pickConditionIdFromActivePool('seed-1', 'boss-tower-warden', 'echo')
    expect(a).toBe(b)
    // echo-fallback is deprecated so only echo-boss in active pool
    expect(a).toBe('echo-boss')
  })

  it('pickConditionIdFromActivePool throws when active pool for kind empty', async () => {
    mockFetch({
      manifestVersion: 1,
      entries: [
        { id: 'echo-fallback', kind: 'echo', params: { determinationThreshold: 0, allStatsBonusPct: 0 }, scoutSummary: '', deprecated: 'never-in-pool' },
      ],
    })
    await expect(pickConditionIdFromActivePool('seed', 'x', 'echo')).rejects.toThrow(/active pool.*empty/)
  })
})
```

- [ ] **Step 3: 运行测试确认 FAIL**

Run: `pnpm test src/tower/pools/battlefield-condition-pool.test.ts`
Expected: FAIL (module 不存在)

- [ ] **Step 4: 实施 resolver**

`src/tower/pools/battlefield-condition-pool.ts`：

```typescript
// src/tower/pools/battlefield-condition-pool.ts
//
// Battlefield condition pool resolver（照搬 encounter-pool.ts 模板）
// - Registry: manifest 全部 entries（含 deprecated）
// - Active Pool: !deprecated entries
// - Fallback: resolveCondition miss 时返回 FALLBACK_CONDITION_ID + console.error
//
// 详见 docs/tower-engineering-principles.md §2 Pool Registry / Active Pool.

import { createRng } from '@/tower/random'

export type BattlefieldConditionKind = 'echo'

export interface BattlefieldConditionPoolEntry {
  id: string
  kind: BattlefieldConditionKind
  params: {
    determinationThreshold: number
    allStatsBonusPct: number
  }
  scoutSummary: string
  /** ISO date / sentinel; non-undefined = excluded from Active Pool */
  deprecated?: string
}

interface BattlefieldConditionPoolManifest {
  manifestVersion: number
  entries: BattlefieldConditionPoolEntry[]
}

export const FALLBACK_CONDITION_ID = 'echo-fallback'
const MANIFEST_URL = `${import.meta.env.BASE_URL}tower/pools/battlefield-condition-pool.json`

let poolCache: BattlefieldConditionPoolManifest | null = null
let inflight: Promise<BattlefieldConditionPoolManifest> | null = null

export function _resetBattlefieldConditionPoolCache(): void {
  poolCache = null
  inflight = null
}

export async function loadBattlefieldConditionPool(): Promise<BattlefieldConditionPoolManifest> {
  if (poolCache) return poolCache
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch(MANIFEST_URL)
    if (!res.ok) {
      throw new Error(`[battlefield-condition-pool] manifest fetch failed: ${res.status}`)
    }
    const manifest = (await res.json()) as BattlefieldConditionPoolManifest
    poolCache = manifest
    inflight = null
    return manifest
  })()
  return inflight
}

export async function resolveCondition(id: string): Promise<BattlefieldConditionPoolEntry> {
  const manifest = await loadBattlefieldConditionPool()
  const found = manifest.entries.find((e) => e.id === id)
  if (found) return found
  console.error(
    `[battlefield-condition-pool] resolveCondition('${id}') miss — Registry contract violated. ` +
      `Falling back to '${FALLBACK_CONDITION_ID}'. Check manifest entry not deleted.`,
  )
  const fallback = manifest.entries.find((e) => e.id === FALLBACK_CONDITION_ID)
  if (!fallback) {
    throw new Error(
      `[battlefield-condition-pool] FALLBACK entry '${FALLBACK_CONDITION_ID}' missing from manifest — ` +
        `this is a hard project invariant violation.`,
    )
  }
  return fallback
}

/**
 * Pick a condition id from Active Pool by seed. Phase 5 not used by startDescent
 * (condition mounting is inline in encounter yaml, not node-level固化),
 * but kept for future use cases (e.g. random boss condition rotation).
 */
export async function pickConditionIdFromActivePool(
  seed: string,
  contextId: string,
  kind: BattlefieldConditionKind,
): Promise<string> {
  const manifest = await loadBattlefieldConditionPool()
  const active = manifest.entries.filter((e) => !e.deprecated && e.kind === kind)
  if (active.length === 0) {
    throw new Error(
      `[battlefield-condition-pool] active pool for kind='${kind}' is empty — check manifest`,
    )
  }
  const rng = createRng(`${seed}::condition::${contextId}`)
  const idx = Math.floor(rng() * active.length)
  return active[idx].id
}
```

- [ ] **Step 5: 运行测试确认 PASS**

Run: `pnpm test src/tower/pools/battlefield-condition-pool.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tower/pools/battlefield-condition-pool.ts src/tower/pools/battlefield-condition-pool.test.ts
git commit -m "feat(tower-pool): add battlefield-condition-pool resolver"
```

---

### Task 6: Battlefield-condition manifest

**Files:**
- Create: `public/tower/pools/battlefield-condition-pool.json`

- [ ] **Step 1: 创建 manifest**

```json
{
  "manifestVersion": 1,
  "entries": [
    {
      "id": "echo-boss",
      "kind": "echo",
      "params": { "determinationThreshold": 2, "allStatsBonusPct": 0.25 },
      "scoutSummary": "决心 ≤ 2 时获得超越之力（攻防血 +25%）"
    },
    {
      "id": "echo-fallback",
      "kind": "echo",
      "params": { "determinationThreshold": 0, "allStatsBonusPct": 0 },
      "scoutSummary": "（fallback，永不触发）",
      "deprecated": "never-in-pool"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/tower/pools/battlefield-condition-pool.json
git commit -m "data(tower-pool): add battlefield-condition manifest (echo-boss)"
```

---

### Task 7: Event-pool resolver + manifest

**Files:**
- Create: `src/tower/pools/event-pool.ts`
- Create: `src/tower/pools/event-pool.test.ts`
- Create: `public/tower/pools/event-pool.json`

**契约：** 照搬 encounter-pool / battlefield-condition-pool 模板。`EventPoolEntry` 仅含 `id` + `yamlPath`（+ optional `deprecated`），不内联 event 内容 —— 内容在 yaml。

- [ ] **Step 1: 写测试**（结构同 Task 5，mock manifest + 三个核心 path：load 缓存 / resolve Registry / resolve fallback）

`src/tower/pools/event-pool.test.ts`：

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _resetEventPoolCache,
  FALLBACK_EVENT_ID,
  loadEventPool,
  resolveEventEntry,
  pickEventIdFromActivePool,
} from './event-pool'

const MANIFEST_OK = {
  manifestVersion: 1,
  entries: [
    { id: 'healing-oasis',  yamlPath: 'tower/events/healing-oasis.yaml' },
    { id: 'pilgrim-trade',  yamlPath: 'tower/events/pilgrim-trade.yaml' },
    { id: 'event-fallback', yamlPath: 'tower/events/event-fallback.yaml', deprecated: 'never-in-pool' },
  ],
}

function mockFetch(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok, status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response)
}

describe('event-pool', () => {
  afterEach(() => {
    _resetEventPoolCache()
    vi.restoreAllMocks()
  })

  it('loadEventPool caches', async () => {
    const fm = mockFetch(MANIFEST_OK)
    await loadEventPool()
    await loadEventPool()
    expect(fm).toHaveBeenCalledTimes(1)
  })

  it('resolveEventEntry returns Registry including deprecated', async () => {
    mockFetch(MANIFEST_OK)
    const e = await resolveEventEntry('event-fallback')
    expect(e.id).toBe('event-fallback')
  })

  it('resolveEventEntry falls back + console.error on miss', async () => {
    mockFetch(MANIFEST_OK)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const e = await resolveEventEntry('missing-id')
    expect(e.id).toBe(FALLBACK_EVENT_ID)
    expect(errSpy).toHaveBeenCalled()
  })

  it('pickEventIdFromActivePool deterministic by seed + excludes deprecated', async () => {
    mockFetch(MANIFEST_OK)
    const a = await pickEventIdFromActivePool('seed-1', 42)
    const b = await pickEventIdFromActivePool('seed-1', 42)
    expect(a).toBe(b)
    expect(['healing-oasis', 'pilgrim-trade']).toContain(a)
  })

  it('pickEventIdFromActivePool throws on empty active', async () => {
    mockFetch({
      manifestVersion: 1,
      entries: [
        { id: 'event-fallback', yamlPath: 'x', deprecated: 'never-in-pool' },
      ],
    })
    await expect(pickEventIdFromActivePool('seed', 1)).rejects.toThrow(/active pool.*empty/)
  })
})
```

- [ ] **Step 2: 运行测试 FAIL**

Run: `pnpm test src/tower/pools/event-pool.test.ts`
Expected: FAIL

- [ ] **Step 3: 实施 resolver**

`src/tower/pools/event-pool.ts`：

```typescript
// src/tower/pools/event-pool.ts
// Event pool resolver. Template identical to encounter-pool / battlefield-condition-pool.
// See docs/tower-engineering-principles.md §2.

import { createRng } from '@/tower/random'

export interface EventPoolEntry {
  id: string
  yamlPath: string
  deprecated?: string
}

interface EventPoolManifest {
  manifestVersion: number
  entries: EventPoolEntry[]
}

export const FALLBACK_EVENT_ID = 'event-fallback'
const MANIFEST_URL = `${import.meta.env.BASE_URL}tower/pools/event-pool.json`

let poolCache: EventPoolManifest | null = null
let inflight: Promise<EventPoolManifest> | null = null

export function _resetEventPoolCache(): void {
  poolCache = null
  inflight = null
}

export async function loadEventPool(): Promise<EventPoolManifest> {
  if (poolCache) return poolCache
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch(MANIFEST_URL)
    if (!res.ok) throw new Error(`[event-pool] manifest fetch failed: ${res.status}`)
    const manifest = (await res.json()) as EventPoolManifest
    poolCache = manifest
    inflight = null
    return manifest
  })()
  return inflight
}

export async function resolveEventEntry(id: string): Promise<EventPoolEntry> {
  const manifest = await loadEventPool()
  const found = manifest.entries.find((e) => e.id === id)
  if (found) return found
  console.error(
    `[event-pool] resolveEventEntry('${id}') miss — Registry contract violated. ` +
      `Falling back to '${FALLBACK_EVENT_ID}'. Check manifest entry not deleted.`,
  )
  const fallback = manifest.entries.find((e) => e.id === FALLBACK_EVENT_ID)
  if (!fallback) {
    throw new Error(
      `[event-pool] FALLBACK entry '${FALLBACK_EVENT_ID}' missing — hard invariant violation.`,
    )
  }
  return fallback
}

export async function pickEventIdFromActivePool(
  seed: string,
  nodeId: number,
): Promise<string> {
  const manifest = await loadEventPool()
  const active = manifest.entries.filter((e) => !e.deprecated)
  if (active.length === 0) {
    throw new Error(`[event-pool] active pool is empty — check manifest`)
  }
  const rng = createRng(`${seed}::event::${nodeId}`)
  const idx = Math.floor(rng() * active.length)
  return active[idx].id
}
```

- [ ] **Step 4: 运行测试 PASS**

Run: `pnpm test src/tower/pools/event-pool.test.ts`
Expected: PASS

- [ ] **Step 5: 创建 event-pool.json（只写 fallback + placeholder，yaml 文件 Task 8 创建）**

`public/tower/pools/event-pool.json`：

```json
{
  "manifestVersion": 1,
  "entries": [
    { "id": "healing-oasis",  "yamlPath": "tower/events/healing-oasis.yaml" },
    { "id": "pilgrim-trade",  "yamlPath": "tower/events/pilgrim-trade.yaml" },
    { "id": "battle-trap",    "yamlPath": "tower/events/battle-trap.yaml" },
    { "id": "training-dummy", "yamlPath": "tower/events/training-dummy.yaml" },
    { "id": "mystic-stele",   "yamlPath": "tower/events/mystic-stele.yaml" },
    { "id": "event-fallback", "yamlPath": "tower/events/event-fallback.yaml", "deprecated": "never-in-pool" }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/tower/pools/event-pool.ts src/tower/pools/event-pool.test.ts public/tower/pools/event-pool.json
git commit -m "feat(tower-pool): add event-pool resolver + manifest"
```

---

### Task 8: Event types + loader + evaluator

**Files:**
- Modify: `src/tower/types.ts`（加 types）
- Create: `src/tower/events/event-loader.ts`
- Create: `src/tower/events/event-loader.test.ts`
- Create: `src/tower/events/event-evaluator.ts`
- Create: `src/tower/events/event-evaluator.test.ts`

**契约：** MongoDB-like operator `$gte / $lte / $gt / $lt / $eq / $ne`。不引入 `$not / $or / $and / $in`（deferred backlog P5-D-10）。`EventOutcome` 仅 `crystals` / `determination` 两 kind（P5-D-02）。

- [ ] **Step 1: 加 types**

`src/tower/types.ts` 追加（在 `ScoutInfo` 附近）：

```typescript
// ============================================================
// 事件节点 (Event) — spec §2.3 / phase 5
// ============================================================

export type NumberComparator = {
  $gte?: number
  $lte?: number
  $gt?: number
  $lt?: number
  $eq?: number
  $ne?: number
}

export type EventRequirement = {
  determination?: NumberComparator
  crystals?: NumberComparator
  // Future phases: weaponId?: StringComparator, advancedJobId?: StringComparator
}

export type EventOutcome =
  | { kind: 'crystals'; delta: number }
  | { kind: 'determination'; delta: number }

export interface EventOptionDef {
  id: string
  label: string
  requires?: EventRequirement
  outcomes: EventOutcome[]
}

export interface EventDef {
  id: string
  title: string
  description: string
  options: EventOptionDef[]
}

// ============================================================
// TowerNode 扩展
// ============================================================
```

然后在 `TowerNode` 接口加字段：

```typescript
export interface TowerNode {
  // ...existing fields
  encounterId?: string // phase 4 既有
  /** 事件节点开局固化的 event id；非事件节点 undefined */
  eventId?: string
}
```

- [ ] **Step 2: 写 loader 测试**

`src/tower/events/event-loader.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import { parseEventYaml } from './event-loader'

const VALID_YAML = `
id: healing-oasis
title: 治愈绿洲
description: 你发现一汪清澈的泉水
options:
  - id: drink
    label: 饮用泉水
    outcomes:
      - { kind: determination, delta: 1 }
  - id: leave
    label: 离开
    outcomes: []
`

const WITH_REQUIRES = `
id: pilgrim-trade
title: 朝圣者交易
description: A pilgrim offers a trade
options:
  - id: give-det
    label: 献出 1 决心
    requires:
      determination: { $gte: 2 }
    outcomes:
      - { kind: determination, delta: -1 }
      - { kind: crystals, delta: 8 }
`

describe('parseEventYaml', () => {
  it('parses valid event definition', () => {
    const e = parseEventYaml(VALID_YAML)
    expect(e.id).toBe('healing-oasis')
    expect(e.title).toBe('治愈绿洲')
    expect(e.options).toHaveLength(2)
    expect(e.options[0].outcomes).toEqual([{ kind: 'determination', delta: 1 }])
  })

  it('parses requires with MongoDB-like operator', () => {
    const e = parseEventYaml(WITH_REQUIRES)
    expect(e.options[0].requires).toEqual({ determination: { $gte: 2 } })
  })

  it('throws on missing id / title / options', () => {
    expect(() => parseEventYaml(`title: x\noptions: []`)).toThrow(/id/)
    expect(() => parseEventYaml(`id: x\noptions: []`)).toThrow(/title/)
  })

  it('throws on invalid outcome kind', () => {
    expect(() => parseEventYaml(`
id: bad
title: Bad
description: d
options:
  - id: o
    label: L
    outcomes:
      - { kind: invalid_kind, delta: 1 }
`)).toThrow(/outcome.*kind/)
  })
})
```

- [ ] **Step 3: 运行测试 FAIL**

Run: `pnpm test src/tower/events/event-loader.test.ts`
Expected: FAIL (module 不存在)

- [ ] **Step 4: 实施 loader**

`src/tower/events/event-loader.ts`：

```typescript
// src/tower/events/event-loader.ts
// Event YAML parser with schema validation.

import yaml from 'yaml'
import type { EventDef, EventOptionDef, EventOutcome, EventRequirement, NumberComparator } from '@/tower/types'

const VALID_OUTCOME_KINDS = new Set(['crystals', 'determination'])
const VALID_OPS: (keyof NumberComparator)[] = ['$gte', '$lte', '$gt', '$lt', '$eq', '$ne']

export function parseEventYaml(source: string): EventDef {
  const raw = yaml.parse(source)
  if (!raw || typeof raw !== 'object') {
    throw new Error('[event-loader] YAML must be a mapping')
  }
  if (typeof raw.id !== 'string') throw new Error('[event-loader] missing or invalid `id`')
  if (typeof raw.title !== 'string') throw new Error('[event-loader] missing or invalid `title`')
  if (typeof raw.description !== 'string') throw new Error('[event-loader] missing or invalid `description`')
  if (!Array.isArray(raw.options)) throw new Error('[event-loader] `options` must be an array')

  const options: EventOptionDef[] = raw.options.map((o: any, i: number) => {
    if (typeof o.id !== 'string') throw new Error(`[event-loader] options[${i}].id invalid`)
    if (typeof o.label !== 'string') throw new Error(`[event-loader] options[${i}].label invalid`)
    if (!Array.isArray(o.outcomes)) throw new Error(`[event-loader] options[${i}].outcomes must be array`)
    const outcomes: EventOutcome[] = o.outcomes.map((out: any, j: number) => {
      if (!VALID_OUTCOME_KINDS.has(out.kind)) {
        throw new Error(`[event-loader] options[${i}].outcomes[${j}].kind invalid: ${out.kind}`)
      }
      if (typeof out.delta !== 'number') {
        throw new Error(`[event-loader] options[${i}].outcomes[${j}].delta must be number`)
      }
      return { kind: out.kind, delta: out.delta }
    })
    const requires = o.requires ? parseRequires(o.requires, i) : undefined
    return { id: o.id, label: o.label, requires, outcomes }
  })

  return { id: raw.id, title: raw.title, description: raw.description, options }
}

function parseRequires(raw: any, optIdx: number): EventRequirement {
  const result: EventRequirement = {}
  for (const [field, comparator] of Object.entries(raw)) {
    if (field !== 'determination' && field !== 'crystals') {
      throw new Error(`[event-loader] options[${optIdx}].requires.${field} unknown field`)
    }
    const cmp: NumberComparator = {}
    if (!comparator || typeof comparator !== 'object') {
      throw new Error(`[event-loader] options[${optIdx}].requires.${field} must be object`)
    }
    for (const [op, val] of Object.entries(comparator)) {
      if (!VALID_OPS.includes(op as keyof NumberComparator)) {
        throw new Error(`[event-loader] options[${optIdx}].requires.${field}.${op} invalid operator`)
      }
      if (typeof val !== 'number') {
        throw new Error(`[event-loader] options[${optIdx}].requires.${field}.${op} must be number`)
      }
      cmp[op as keyof NumberComparator] = val
    }
    result[field as 'determination' | 'crystals'] = cmp
  }
  return result
}

/**
 * Load event by id via event-pool manifest → fetch yaml → parse.
 * Wraps pool resolver + fetch + parse.
 */
export async function loadEventById(id: string): Promise<EventDef> {
  const { resolveEventEntry } = await import('@/tower/pools/event-pool')
  const entry = await resolveEventEntry(id)
  const url = `${import.meta.env.BASE_URL}${entry.yamlPath}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[event-loader] fetch ${url} failed: ${res.status}`)
  const source = await res.text()
  return parseEventYaml(source)
}
```

- [ ] **Step 5: 运行测试 PASS**

Run: `pnpm test src/tower/events/event-loader.test.ts`
Expected: PASS

- [ ] **Step 6: 写 evaluator 测试**

`src/tower/events/event-evaluator.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import type { EventRequirement } from '@/tower/types'
import { evaluateRequirement } from './event-evaluator'

describe('evaluateRequirement', () => {
  const ctx = { determination: 3, crystals: 10 }

  it('undefined requires → always true', () => {
    expect(evaluateRequirement(undefined, ctx)).toBe(true)
  })

  it('$gte passes / fails', () => {
    expect(evaluateRequirement({ determination: { $gte: 3 } }, ctx)).toBe(true)
    expect(evaluateRequirement({ determination: { $gte: 4 } }, ctx)).toBe(false)
  })

  it('$lte passes / fails', () => {
    expect(evaluateRequirement({ crystals: { $lte: 10 } }, ctx)).toBe(true)
    expect(evaluateRequirement({ crystals: { $lte: 9 } }, ctx)).toBe(false)
  })

  it('$gt / $lt strict', () => {
    expect(evaluateRequirement({ determination: { $gt: 3 } }, ctx)).toBe(false)
    expect(evaluateRequirement({ determination: { $gt: 2 } }, ctx)).toBe(true)
    expect(evaluateRequirement({ crystals: { $lt: 10 } }, ctx)).toBe(false)
    expect(evaluateRequirement({ crystals: { $lt: 11 } }, ctx)).toBe(true)
  })

  it('$eq / $ne', () => {
    expect(evaluateRequirement({ determination: { $eq: 3 } }, ctx)).toBe(true)
    expect(evaluateRequirement({ determination: { $eq: 4 } }, ctx)).toBe(false)
    expect(evaluateRequirement({ crystals: { $ne: 10 } }, ctx)).toBe(false)
    expect(evaluateRequirement({ crystals: { $ne: 5 } }, ctx)).toBe(true)
  })

  it('multiple operators on same field AND', () => {
    // det ∈ [2, 5): det=3 ✓
    expect(evaluateRequirement({ determination: { $gte: 2, $lt: 5 } }, ctx)).toBe(true)
    expect(evaluateRequirement({ determination: { $gte: 4, $lt: 5 } }, ctx)).toBe(false)
  })

  it('multiple fields AND', () => {
    expect(evaluateRequirement(
      { determination: { $gte: 3 }, crystals: { $gte: 5 } },
      ctx,
    )).toBe(true)
    expect(evaluateRequirement(
      { determination: { $gte: 3 }, crystals: { $gte: 20 } },
      ctx,
    )).toBe(false)
  })
})
```

- [ ] **Step 7: 运行测试 FAIL**

Run: `pnpm test src/tower/events/event-evaluator.test.ts`
Expected: FAIL

- [ ] **Step 8: 实施 evaluator**

`src/tower/events/event-evaluator.ts`：

```typescript
// src/tower/events/event-evaluator.ts
// MongoDB-like operator evaluation for EventRequirement.

import type { EventRequirement } from '@/tower/types'

export interface RequirementContext {
  determination: number
  crystals: number
}

export function evaluateRequirement(
  req: EventRequirement | undefined,
  ctx: RequirementContext,
): boolean {
  if (!req) return true
  for (const [field, cmp] of Object.entries(req)) {
    if (!cmp) continue
    const value = ctx[field as keyof RequirementContext]
    if (cmp.$gte !== undefined && !(value >= cmp.$gte)) return false
    if (cmp.$lte !== undefined && !(value <= cmp.$lte)) return false
    if (cmp.$gt  !== undefined && !(value >  cmp.$gt))  return false
    if (cmp.$lt  !== undefined && !(value <  cmp.$lt))  return false
    if (cmp.$eq  !== undefined && !(value === cmp.$eq)) return false
    if (cmp.$ne  !== undefined && !(value !== cmp.$ne)) return false
  }
  return true
}
```

- [ ] **Step 9: 运行测试 PASS**

Run: `pnpm test src/tower/events/event-evaluator.test.ts`
Expected: PASS

- [ ] **Step 10: Typecheck + 回归**

Run: `pnpm typecheck && pnpm test:run`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/tower/types.ts src/tower/events/event-loader.ts src/tower/events/event-loader.test.ts src/tower/events/event-evaluator.ts src/tower/events/event-evaluator.test.ts
git commit -m "feat(tower-event): add EventDef types + YAML loader + requirement evaluator"
```

---

## Phase C：决心 / 战败延迟结算 / Interceptor

### Task 9: `changeDetermination(intent)` + interceptor hook

**Files:**
- Modify: `src/tower/types.ts`（加 interceptor types）
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

**契约：** 所有决心变化必须走 `changeDetermination(intent)` 单入口。phase 5 interceptors 数组永远空；入口链式应用 + cancel 立即终止。

- [ ] **Step 1: 加 interceptor types**

`src/tower/types.ts` 追加：

```typescript
// ============================================================
// Determination change interceptor — spec §3.7 / phase 5
// ============================================================

export type DeterminationChangeIntent = {
  source: 'mob-wipe' | 'elite-wipe' | 'boss-wipe' | 'event' | 'campfire-offer' | (string & {})
  delta: number
  encounterId?: string
  eventId?: string
}

export type DeterminationChangeResult = {
  delta: number
  cancelled: boolean
  cancelReason?: string
}

export type DeterminationInterceptor = (
  intent: DeterminationChangeIntent,
  current: DeterminationChangeResult,
) => DeterminationChangeResult
```

- [ ] **Step 2: 写测试**

`src/stores/tower.test.ts` 追加：

```typescript
describe('changeDetermination interceptor', () => {
  it('empty interceptors: pass-through apply', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    const r = store.changeDetermination({ source: 'mob-wipe', delta: -1 })
    expect(r).toEqual({ delta: -1, cancelled: false })
    expect(store.determination).toBe(4)
  })

  it('clamps to [0, maxDetermination]', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.changeDetermination({ source: 'event', delta: +3 })
    expect(store.determination).toBe(5)  // clamp upper

    store._hydrateForTest({ determination: 1, maxDetermination: 5 })
    store.changeDetermination({ source: 'boss-wipe', delta: -5 })
    expect(store.determination).toBe(0)  // clamp lower
  })

  it('single interceptor modifies delta', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.interceptors.push((intent, current) => ({
      ...current, delta: current.delta * 2,  // 损失加倍
    }))
    store.changeDetermination({ source: 'mob-wipe', delta: -1 })
    expect(store.determination).toBe(3)  // 5 + (-1 × 2) = 3
  })

  it('interceptor cancels → determination unchanged', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.interceptors.push((intent, current) => ({
      delta: 0, cancelled: true, cancelReason: '无敌光环',
    }))
    const r = store.changeDetermination({ source: 'mob-wipe', delta: -1 })
    expect(r.cancelled).toBe(true)
    expect(r.cancelReason).toBe('无敌光环')
    expect(store.determination).toBe(5)
  })

  it('multi interceptor chain order + cancel terminates chain', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    const log: string[] = []
    store.interceptors.push((intent, cur) => { log.push('a'); return cur })
    store.interceptors.push((intent, cur) => {
      log.push('b')
      return { delta: 0, cancelled: true, cancelReason: 'stop' }
    })
    store.interceptors.push((intent, cur) => { log.push('c'); return cur })
    store.changeDetermination({ source: 'mob-wipe', delta: -1 })
    expect(log).toEqual(['a', 'b'])  // c never called
  })
})
```

- [ ] **Step 3: 运行测试 FAIL**

Run: `pnpm test src/stores/tower.test.ts`
Expected: FAIL (`changeDetermination` / `interceptors` 不存在)

- [ ] **Step 4: 实施 action + interceptor 字段**

`src/stores/tower.ts`，在 defineStore 的 state 返回对象里加 `interceptors`（注意：Pinia store 的非持久化字段可以放在 state 但标注不写入 IndexedDB，或放在 composition API 的 ref 外；phase 4 已有 state 字段如 `schemaResetNotice` 等在内存 only，照此模式）：

```typescript
// 在 state() 返回对象内:
state: () => ({
  // ...existing
  interceptors: [] as DeterminationInterceptor[],
}),
```

在 actions 里加：

```typescript
changeDetermination(intent: DeterminationChangeIntent): DeterminationChangeResult {
  let result: DeterminationChangeResult = { delta: intent.delta, cancelled: false }
  for (const f of this.interceptors) {
    result = f(intent, result)
    if (result.cancelled) break
  }
  if (!result.cancelled) {
    this.determination = Math.max(0, Math.min(this.maxDetermination, this.determination + result.delta))
  }
  return result
},
```

- [ ] **Step 5: 运行测试 PASS**

Run: `pnpm test src/stores/tower.test.ts`
Expected: PASS

- [ ] **Step 6: 回归 + typecheck**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/tower/types.ts src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower-store): add changeDetermination interceptor hook API"
```

---

### Task 10: 迁移 phase 4 决心扣减点到 `changeDetermination` + `onCombatWipe`

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

**契约：** phase 4 的 `deductDeterminationOnWipe()` (扣 -1) 被 `onCombatWipe(kind, encounterId)` 替代，按 kind 分发 mob/elite = -1、boss = -2，走 `changeDetermination({ source: '<kind>-wipe', ... })`。

- [ ] **Step 1: 写测试**

```typescript
describe('onCombatWipe', () => {
  it('mob wipe deducts -1 via changeDetermination', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.onCombatWipe('mob', 'mob-frost-sprite')
    expect(store.determination).toBe(4)
  })

  it('elite wipe deducts -1', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.onCombatWipe('elite', 'elite-fortune-trial')
    expect(store.determination).toBe(4)
  })

  it('boss wipe deducts -2', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.onCombatWipe('boss', 'boss-tower-warden')
    expect(store.determination).toBe(3)
  })

  it('respects interceptor cancel', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 5, maxDetermination: 5 })
    store.interceptors.push(() => ({ delta: 0, cancelled: true, cancelReason: 'divine' }))
    store.onCombatWipe('boss', 'boss-x')
    expect(store.determination).toBe(5)
  })
})
```

- [ ] **Step 2: 运行测试 FAIL**

Expected: FAIL

- [ ] **Step 3: 实施 + 迁移 phase 4 调用点**

在 `src/stores/tower.ts` actions 内新增：

```typescript
onCombatWipe(kind: 'mob' | 'elite' | 'boss', encounterId: string): DeterminationChangeResult {
  const source = `${kind}-wipe` as DeterminationChangeIntent['source']
  const delta = kind === 'boss' ? -2 : -1
  return this.changeDetermination({ source, delta, encounterId })
},
```

**迁移旧 action**：找 phase 4 的 `deductDeterminationOnWipe` —— 通常签名类似 `deductDeterminationOnWipe(encounterId: string)`。在所有引用方（tower/index.vue、BattleResultOverlay handler 等）改为 `onCombatWipe(encounterKind, encounterId)`，其中 `encounterKind` 需要从 encounter meta / store 的 `pendingCombatNodeId` 对应 node 的 encounter 拿。

- [ ] **Step 4: 删除旧 `deductDeterminationOnWipe`（如果存在）**

grep `deductDeterminationOnWipe` 找所有引用点，全部迁移后删除。

- [ ] **Step 5: 运行测试 PASS**

Expected: PASS

- [ ] **Step 6: 回归（特别注意 phase 4 的战斗失败流程仍工作）**

Run: `pnpm test:run`
Expected: PASS —— phase 4 BattleResultOverlay 测试应该通过（如果旧测试直接调 `deductDeterminationOnWipe` 则需改测试或依赖 `onCombatWipe` 的 mob case）

- [ ] **Step 7: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts src/components/ src/pages/
git commit -m "refactor(tower-store): replace deductDeterminationOnWipe with onCombatWipe routing through interceptor"
```

---

### Task 11: `applyEventOutcome(out)` 走 interceptor

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: 写测试**

```typescript
describe('applyEventOutcome', () => {
  it('crystals outcome adds delta', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ crystals: 10 })
    store.applyEventOutcome({ kind: 'crystals', delta: 5 })
    expect(store.crystals).toBe(15)
  })

  it('crystals outcome negative delta does not go below 0 (clamp)', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ crystals: 3 })
    store.applyEventOutcome({ kind: 'crystals', delta: -10 })
    expect(store.crystals).toBe(0)
  })

  it('determination outcome routes through changeDetermination with source=event', () => {
    const store = useTowerStore(pinia)
    store._hydrateForTest({ determination: 2, maxDetermination: 5 })
    const sources: string[] = []
    store.interceptors.push((intent, cur) => { sources.push(intent.source); return cur })
    store.applyEventOutcome({ kind: 'determination', delta: 1 })
    expect(sources).toEqual(['event'])
    expect(store.determination).toBe(3)
  })
})
```

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施**

```typescript
applyEventOutcome(out: EventOutcome): void {
  switch (out.kind) {
    case 'crystals':
      this.crystals = Math.max(0, this.crystals + out.delta)
      break
    case 'determination':
      this.changeDetermination({ source: 'event', delta: out.delta })
      break
  }
},
```

- [ ] **Step 4: 运行 PASS + typecheck + 回归**

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower-store): add applyEventOutcome routing determination through interceptor"
```

---

### Task 12: `startDescent` 固化 `eventId` 到 event 节点

**Files:**
- Modify: `src/stores/tower.ts`
- Modify: `src/stores/tower.test.ts`

- [ ] **Step 1: 写测试**

```typescript
describe('startDescent event node crystallization', () => {
  it('fills eventId on each event node', async () => {
    const store = useTowerStore(pinia)
    await store.startNewRun('swordsman')
    await store.enterJobPicker()
    await store.startDescent()
    const eventNodes = Object.values(store.run!.towerGraph.nodes).filter(n => n.kind === 'event')
    for (const n of eventNodes) {
      expect(typeof n.eventId).toBe('string')
      expect(n.eventId!.length).toBeGreaterThan(0)
    }
  })

  it('non-event nodes remain eventId undefined', async () => {
    const store = useTowerStore(pinia)
    await store.startNewRun('swordsman')
    await store.enterJobPicker()
    await store.startDescent()
    const nonEvent = Object.values(store.run!.towerGraph.nodes).filter(n => n.kind !== 'event')
    for (const n of nonEvent) {
      expect(n.eventId).toBeUndefined()
    }
  })
})
```

注：实际测试需 mock event-pool fetch；使用 `vi.mock('@/tower/pools/event-pool', ...)` 提供最简固定返回。

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施 — 扩展 startDescent**

在 `src/stores/tower.ts` 的 `startDescent` action 内，phase 4 已有"遍历战斗节点填 encounterId"逻辑；追加"遍历 event 节点填 eventId"：

```typescript
// in startDescent, after phase 4 encounterId loop
const { pickEventIdFromActivePool } = await import('@/tower/pools/event-pool')
for (const node of Object.values(this.run!.towerGraph.nodes)) {
  if (node.kind === 'event') {
    node.eventId = await pickEventIdFromActivePool(this.run!.seed, node.id)
  }
}
// persist after all crystallization
await this._persistRun()
```

- [ ] **Step 4: 运行 PASS + 回归**

- [ ] **Step 5: Commit**

```bash
git add src/stores/tower.ts src/stores/tower.test.ts
git commit -m "feat(tower-store): crystallize eventId on event nodes in startDescent"
```

---

### Task 13: Battle-runner death window runtime

**Files:**
- Modify: `src/game/battle-runner.ts`
- Modify: `src/game/battle-runner.test.ts` 或新建 death-window 专用测试

**契约：** 玩家 hp ≤ 0 → `enterDeathWindow`（不立即 `combat:ended`）；每帧 `tickDeathWindow` 检查三种结束条件；`finalizeDeathWindow(result)` emit `combat:ended`。

- [ ] **Step 1: 写集成测试**

`src/game/battle-runner.test.ts` 追加（新 describe block）：

```typescript
describe('death window runtime', () => {
  it('player death does NOT immediately emit combat:ended', async () => {
    const { bus, scene } = await setupBattle({ /* 最简 boss encounter */ })
    const endedListener = vi.fn()
    bus.on('combat:ended', endedListener)
    const diedListener = vi.fn()
    bus.on('player:died', diedListener)

    // Force player death via direct damage
    scene.player.hp = 0
    bus.emit('damage:dealt', {
      source: scene.boss, target: scene.player, amount: 99999, skill: { name: 'test' },
    })

    expect(diedListener).toHaveBeenCalledTimes(1)
    expect(endedListener).not.toHaveBeenCalled()
    expect(scene.deathWindow).not.toBeNull()
  })

  it('death window timeout → finalize wipe', async () => {
    const { bus, scene, advance } = await setupBattle({})
    scene.player.hp = 0
    bus.emit('damage:dealt', { source: scene.boss, target: scene.player, amount: 99999, skill: { name: 'test' } })
    expect(scene.deathWindow).not.toBeNull()

    // advance 10s + 1ms
    advance(10001)
    expect(scene.deathWindow).toBeNull()
    // combat:ended should have fired with 'wipe'
  })

  it('boss DoT kill within window → finalize victory', async () => {
    const { bus, scene, buffSystem, advance } = await setupBattle({})
    // Apply a lethal DoT onto boss from player
    const lethalDot: BuffDef = {
      id: 'lethal', name: 'L', type: 'debuff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'dot', potency: 99, interval: 1000 }],
    }
    scene.boss.hp = 500  // nearly dead
    applyPeriodicBuff(scene.boss, lethalDot, scene.player, scene.gameTime, buffSystem)

    // Player dies
    scene.player.hp = 0
    bus.emit('damage:dealt', { source: scene.boss, target: scene.player, amount: 99999, skill: { name: 'x' } })
    expect(scene.deathWindow).not.toBeNull()

    // tick DoT 2s (boss dies at t = 1s from DoT)
    advance(2000)
    // expect combat:ended { result: 'victory' }
  })

  it('all player DoTs expired → early finalize wipe', async () => {
    const { bus, scene, buffSystem, advance } = await setupBattle({})
    const shortDot: BuffDef = {
      id: 'short', name: 'S', type: 'debuff', duration: 2000, stackable: false, maxStacks: 1,
      effects: [{ type: 'dot', potency: 0.1, interval: 1000 }],
    }
    scene.boss.hp = 999999  // not killable by DoT
    applyPeriodicBuff(scene.boss, shortDot, scene.player, scene.gameTime, buffSystem)

    scene.player.hp = 0
    bus.emit('damage:dealt', { source: scene.boss, target: scene.player, amount: 99999, skill: { name: 'x' } })

    // Advance past DoT duration (2s) + buff expiration grace
    advance(3000)
    expect(scene.deathWindow).toBeNull()  // finalize should have fired with 'wipe'
  })
})
```

注：`setupBattle` helper 若 phase 4 已有用它；没有则按现有 `startTimelineDemo` 签名封装最简 helper（mock canvas / 无 AOE 等）。

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施 death window state + enter/tick/finalize**

`src/game/battle-runner.ts` 顶部常量：

```typescript
const DEATH_WINDOW_MS = 10000
```

在 `startTimelineDemo` 内（或 scene 构造 context 里），加 `deathWindow` 字段到 scene state：

```typescript
// 在 scene state 初始化附近（s 对象）
s.deathWindow = null as null | { startedAt: number; deadline: number }
```

替换 L273-279 玩家死亡分支：

```typescript
// Player died → enter death window (don't immediately end combat)
if (payload.target.id === s.player.id && payload.target.hp <= 0) {
  if (!s.battleOver && !s.deathWindow) {
    enterDeathWindow()
  }
}

function enterDeathWindow() {
  const now = scheduler.combatElapsed
  s.deathWindow = { startedAt: now, deadline: now + DEATH_WINDOW_MS }
  s.bus.emit('player:died', { gameTime: now })
  // Import BuffSystem instance — phase 4 should expose via scene; if not, s.combatResolver.buffSystem or similar
  const buffSystem = s.combatResolver.buffSystem // adjust to actual path
  buffSystem.clearDeathBuffs(s.player)
  // Boss timeline / AI / DoT tick continue running
}

function tickDeathWindow(gameTime: number) {
  if (!s.deathWindow) return
  // 1. Boss dies → player wins (DoT comeback)
  if (boss.hp <= 0) {
    finalizeDeathWindow('victory')
    return
  }
  // 2. Time up
  if (gameTime >= s.deathWindow.deadline) {
    finalizeDeathWindow('wipe')
    return
  }
  // 3. All player DoTs on boss expired → early finalize wipe
  const hasActivePlayerDot = boss.buffs.some(b =>
    b.periodic?.effectType === 'dot' && b.periodic.sourceCasterId === s.player.id
  )
  if (!hasActivePlayerDot) {
    finalizeDeathWindow('wipe')
    return
  }
}

function finalizeDeathWindow(result: 'victory' | 'wipe') {
  if (!s.deathWindow) return
  scriptRunner.disposeAll()
  s.bus.emit('combat:ended', { result, elapsed: scheduler.combatElapsed })
  s.endBattle(result)
  s.deathWindow = null
}
```

然后在主循环每帧（找 phase 4 的 game loop tick 函数，通常是 `update(dt)` 或 `tick(gameTime)`）加 `tickDeathWindow(gameTime)`。定位：grep `scheduler.update` / `tickPeriodicBuffs` 的调用点，在同一 tick 循环加一行 `tickDeathWindow(scheduler.combatElapsed)`。

**注意**：Boss 死亡分支 (battle-runner.ts:265-271) 保持不变，仍走原路径立即 emit `combat:ended { victory }`。

- [ ] **Step 4: 运行测试 PASS**

可能 setupBattle helper 不存在；先确认 phase 4 的 battle-runner 测试怎么构造 scene，参考同模式。

- [ ] **Step 5: 回归**

Run: `pnpm test:run`

- [ ] **Step 6: Commit**

```bash
git add src/game/battle-runner.ts src/game/battle-runner.test.ts
git commit -m "feat(battle): add death window runtime for DoT-comeback resolution"
```

---

## Phase D：场地机制 runtime

### Task 14: `COMMON_BUFFS.echo` 定义

**Files:**
- Create: `src/demo/common-buffs/echo.ts`
- Modify: `src/demo/common-buffs/index.ts`（如果 COMMON_BUFFS 是聚合导出；否则改为实际文件）

**契约：** echo = `attack_modifier 0.25` + `mitigation 0.25` + `max_hp_modifier 0.25`，`preserveOnDeath: true`，`duration: -1`（永久，战斗结束随 scene 销毁）。无 icon 字段（用户后补）。

- [ ] **Step 1: 确认 COMMON_BUFFS 现有结构**

grep `COMMON_BUFFS` 定位定义文件。可能在 `src/demo/common-buffs.ts`（单文件）或 `src/demo/common-buffs/index.ts`（目录拆分）。

- [ ] **Step 2: 定义 echo buff**

若 `src/demo/common-buffs/` 是目录结构：

`src/demo/common-buffs/echo.ts`：

```typescript
import type { BuffDef } from '@/core/types'

/**
 * Echo (超越之力) — phase 5 battlefield condition buff.
 * - Activates on boss combat when determination ≤ 2 (threshold configurable via condition pool).
 * - Three modifier effects: +25% base attack / +25% mitigation / +25% base maxHp.
 * - preserveOnDeath: true — survives death bookkeeping (FF14 raise reservation; no visible phase 5 effect).
 * - duration: -1 — tied to scene lifetime (no buff-system expiration).
 */
export const echo: BuffDef = {
  id: 'echo',
  name: '超越之力',
  description: '攻击 +25% / 减伤 +25% / 最大生命 +25%',
  type: 'buff',
  duration: -1,
  stackable: false,
  maxStacks: 1,
  preserveOnDeath: true,
  effects: [
    { type: 'attack_modifier', value: 0.25 },
    { type: 'mitigation', value: 0.25 },
    { type: 'max_hp_modifier', value: 0.25 },
  ],
}
```

在 `src/demo/common-buffs/index.ts` 聚合：

```typescript
export { echo } from './echo'
// ...其他 existing exports
```

若 COMMON_BUFFS 是单文件对象，则在该对象内加 `echo: { ... }`。

- [ ] **Step 3: 写单元测试（sanity check）**

`src/demo/common-buffs/echo.test.ts`（或加到既有测试文件）：

```typescript
import { describe, expect, it } from 'vitest'
import { echo } from './echo'

describe('COMMON_BUFFS.echo', () => {
  it('has preserveOnDeath: true', () => {
    expect(echo.preserveOnDeath).toBe(true)
  })

  it('has three effect types in expected order', () => {
    expect(echo.effects.map(e => e.type)).toEqual([
      'attack_modifier', 'mitigation', 'max_hp_modifier',
    ])
    expect(echo.effects.every(e => (e as any).value === 0.25)).toBe(true)
  })

  it('duration = -1 (tied to scene lifetime)', () => {
    expect(echo.duration).toBe(-1)
  })
})
```

- [ ] **Step 4: 运行 PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/demo/common-buffs/echo.ts src/demo/common-buffs/echo.test.ts src/demo/common-buffs/index.ts
git commit -m "feat(buff): add COMMON_BUFFS.echo for超越之力 battlefield condition"
```

---

### Task 15: `activateEchoCondition` + `activateCondition` dispatcher

**Files:**
- Create: `src/tower/conditions/echo.ts`
- Create: `src/tower/conditions/echo.test.ts`

- [ ] **Step 1: 写测试**

`src/tower/conditions/echo.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import { createEntity } from '@/entity/entity'
import { BuffSystem } from '@/combat/buff'
import { EventBus } from '@/core/event-bus'
import { activateCondition } from './echo'
import type { BattlefieldConditionPoolEntry } from '@/tower/pools/battlefield-condition-pool'

function setup(determination: number, playerHp = 10000, playerAtk = 1000) {
  const bus = new EventBus()
  const buffSystem = new BuffSystem(bus)
  const player = createEntity({ id: 'p', type: 'player', hp: playerHp, attack: playerAtk })
  return { bus, buffSystem, player, determination }
}

describe('activateCondition (echo dispatcher)', () => {
  const ECHO_BOSS: BattlefieldConditionPoolEntry = {
    id: 'echo-boss', kind: 'echo',
    params: { determinationThreshold: 2, allStatsBonusPct: 0.25 },
    scoutSummary: '',
  }

  it('determination > threshold → no buff applied', () => {
    const { buffSystem, player } = setup(5)
    activateCondition(ECHO_BOSS, { player, buffSystem, gameTime: 0 }, { determination: 5 })
    expect(player.buffs).toHaveLength(0)
  })

  it('determination == threshold → echo applied', () => {
    const { buffSystem, player } = setup(2)
    activateCondition(ECHO_BOSS, { player, buffSystem, gameTime: 0 }, { determination: 2 })
    expect(player.buffs).toHaveLength(1)
    expect(player.buffs[0].defId).toBe('echo')
  })

  it('determination < threshold → echo applied', () => {
    const { buffSystem, player } = setup(1)
    activateCondition(ECHO_BOSS, { player, buffSystem, gameTime: 0 }, { determination: 1 })
    expect(player.buffs[0].defId).toBe('echo')
  })

  it('applied echo: getAttack / getMaxHp reflect +25%', () => {
    const { buffSystem, player } = setup(2, 10000, 1000)
    activateCondition(ECHO_BOSS, { player, buffSystem, gameTime: 0 }, { determination: 2 })
    expect(buffSystem.getAttack(player)).toBe(1250)
    expect(buffSystem.getMaxHp(player)).toBe(12500)
    expect(player.hp).toBe(10000) // hp NOT adjusted on apply
  })
})
```

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施**

`src/tower/conditions/echo.ts`：

```typescript
// src/tower/conditions/echo.ts
// Battlefield condition activation — phase 5 MVP only supports `echo` kind.

import type { BattlefieldConditionPoolEntry } from '@/tower/pools/battlefield-condition-pool'
import type { Entity } from '@/entity/entity'
import type { BuffSystem } from '@/combat/buff'
import { echo as echoBuff } from '@/demo/common-buffs/echo'

export interface ConditionActivationScene {
  player: Entity
  buffSystem: BuffSystem
  gameTime: number
}

export interface ConditionTowerContext {
  determination: number
}

export function activateCondition(
  cond: BattlefieldConditionPoolEntry,
  scene: ConditionActivationScene,
  ctx: ConditionTowerContext,
): void {
  switch (cond.kind) {
    case 'echo':
      return activateEchoCondition(cond, scene, ctx)
    // Future: case 'electric_field': return activateElectricFieldCondition(...)
  }
}

function activateEchoCondition(
  cond: BattlefieldConditionPoolEntry,
  scene: ConditionActivationScene,
  ctx: ConditionTowerContext,
): void {
  if (ctx.determination > cond.params.determinationThreshold) return
  scene.buffSystem.applyBuff(scene.player, echoBuff, scene.player, scene.gameTime)
}
```

注：`applyBuff` 的签名是 `applyBuff(target, def, source, gameTime?)` 还是 `applyBuff(target, def, sourceId, gameTime?)`，以 phase 4 现有实现为准；测试 mock setup 要一致。

- [ ] **Step 4: 运行 PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/tower/conditions/echo.ts src/tower/conditions/echo.test.ts
git commit -m "feat(tower-condition): add activateCondition dispatcher + echo activator"
```

---

### Task 16: EncounterLoader 解析 `conditions` 字段

**Files:**
- Modify: `src/game/encounter-loader.ts`
- Modify: `src/game/encounter-loader.test.ts`
- Modify: `src/config/schema.ts`（如有 zod schema）

- [ ] **Step 1: 写测试**

`src/game/encounter-loader.test.ts` 追加：

```typescript
describe('encounter-loader conditions field', () => {
  const WITH_CONDITIONS = `
arena: { name: t, shape: circle, radius: 15, boundary: wall }
entities: { boss: { type: mob, group: boss, hp: 100, attack: 1, speed: 1, size: 1, facing: 0, position: { x: 0, y: 0, z: 0 }, autoAttackRange: 4, aggroRange: 8 } }
player: { position: { x: 0, y: -12, z: 0 } }
boss_ai: { chaseRange: 4, autoAttackRange: 4, autoAttackInterval: 3000, aggroRange: 8 }
local_skills: {}
skills: {}
phases: { phase_default: { actions: [] } }
conditions: [echo-boss]
`

  it('parses conditions: string[]', () => {
    const data = parseEncounterYaml(WITH_CONDITIONS)
    expect(data.conditions).toEqual(['echo-boss'])
  })

  it('absent conditions → undefined (or empty array; confirm contract)', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.conditions).toBeUndefined()
  })

  it('throws on non-array conditions', () => {
    expect(() => parseEncounterYaml(WITH_CONDITIONS.replace('[echo-boss]', 'not-an-array'))).toThrow(/conditions.*array/)
  })
})
```

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施**

`src/game/encounter-loader.ts` 在 parse 函数内加：

```typescript
// after parsing other fields
if (raw.conditions !== undefined) {
  if (!Array.isArray(raw.conditions)) {
    throw new Error('[encounter-loader] `conditions` must be an array of string ids')
  }
  for (const c of raw.conditions) {
    if (typeof c !== 'string') throw new Error('[encounter-loader] conditions entries must be strings')
  }
  data.conditions = raw.conditions as string[]
}
```

`EncounterData` interface 加：

```typescript
export interface EncounterData {
  // ...existing
  conditions?: string[]
}
```

- [ ] **Step 4: 运行 PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/game/encounter-loader.ts src/game/encounter-loader.test.ts src/config/schema.ts
git commit -m "feat(encounter): parse conditions field for battlefield condition activation"
```

---

### Task 17: EncounterRunner mount consumes conditions

**Files:**
- Modify: `src/components/tower/EncounterRunner.vue`
- Modify: `src/components/tower/EncounterRunner.test.ts`（如 phase 4 已建）

- [ ] **Step 1: 写测试**（component mount 测试，mock scene / encounter）

大概思路：mount runner with encounter yaml containing `conditions: [echo-boss]` + towerStore determination = 2 → 检查 player.buffs 含 echo。

由于 runner 是 Vue component 且依赖 babylon scene，集成测可能复杂；可以单测 `activateConditionsForScene(encounterData, scene, towerCtx)` helper 函数（抽出逻辑）。

- [ ] **Step 2: 抽出 helper**

在 `src/components/tower/EncounterRunner.vue` 的 `<script setup>` 内，把 condition activation 逻辑抽到 `src/tower/conditions/activate-for-encounter.ts`：

```typescript
// src/tower/conditions/activate-for-encounter.ts
import { resolveCondition } from '@/tower/pools/battlefield-condition-pool'
import type { EncounterData } from '@/game/encounter-loader'
import { activateCondition, type ConditionActivationScene, type ConditionTowerContext } from './echo'

export async function activateConditionsForEncounter(
  encounter: EncounterData,
  scene: ConditionActivationScene,
  ctx: ConditionTowerContext,
): Promise<void> {
  const ids = encounter.conditions ?? []
  for (const id of ids) {
    const cond = await resolveCondition(id)
    activateCondition(cond, scene, ctx)
  }
}
```

然后在 `EncounterRunner.vue` 的 scene init 完成后调用：

```vue
<script setup lang="ts">
// ...existing
import { activateConditionsForEncounter } from '@/tower/conditions/activate-for-encounter'
import { useTowerStore } from '@/stores/tower'

// in onMounted, after startTimelineDemo onInit:
async function onSceneInit(scene: any) {
  const encounterData = scene.encounterData  // encounter-loader 结果，需 expose
  const towerStore = useTowerStore()
  await activateConditionsForEncounter(encounterData, {
    player: scene.player,
    buffSystem: scene.combatResolver.buffSystem,  // adjust path
    gameTime: 0,
  }, {
    determination: towerStore.determination,
  })
}
</script>
```

具体挂载点：找 phase 4 的 `startTimelineDemo(..., onInit)` —— onInit 回调就是 scene ready 时机。

- [ ] **Step 3: 写 helper 单测**

`src/tower/conditions/activate-for-encounter.test.ts`：

```typescript
describe('activateConditionsForEncounter', () => {
  it('activates all conditions in encounter.conditions list', async () => {
    // mock resolveCondition to return echo-boss entry
    // call activateConditionsForEncounter
    // assert player.buffs contains echo
  })

  it('noop when encounter.conditions undefined or []', async () => {
    // ...
  })
})
```

- [ ] **Step 4: 运行 PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/components/tower/EncounterRunner.vue src/tower/conditions/activate-for-encounter.ts src/tower/conditions/activate-for-encounter.test.ts
git commit -m "feat(tower-runner): activate battlefield conditions on encounter mount"
```

---

## Phase E：事件 UI

### Task 18: `EventOptionPanel.vue` 组件

**Files:**
- Create: `src/components/tower/EventOptionPanel.vue`
- Create: `src/components/tower/EventOptionPanel.test.ts`

**契约：** modal 叠 in-path；渲染 options；按 `evaluateRequirement` 灰化 disabled；点选项 → 应用 outcomes 数组 → emit `resolved`。不可关闭（没有 close 按钮，强制决策）。

- [ ] **Step 1: 写测试**

```typescript
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EventOptionPanel from './EventOptionPanel.vue'
import { createPinia, setActivePinia } from 'pinia'
import { useTowerStore } from '@/stores/tower'

const EVENT = {
  id: 'test-event', title: 'Test', description: 'desc',
  options: [
    { id: 'opt-a', label: 'A', outcomes: [{ kind: 'determination', delta: 1 }] },
    { id: 'opt-b', label: 'B', requires: { crystals: { $gte: 100 } }, outcomes: [] },
  ],
}

describe('EventOptionPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders title + description + options', () => {
    const w = mount(EventOptionPanel, { props: { event: EVENT } })
    expect(w.text()).toContain('Test')
    expect(w.text()).toContain('desc')
    expect(w.findAll('button')).toHaveLength(2)
  })

  it('disables option with unmet requires', () => {
    const store = useTowerStore()
    store._hydrateForTest({ crystals: 5 })
    const w = mount(EventOptionPanel, { props: { event: EVENT } })
    const buttons = w.findAll('button')
    expect((buttons[1].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('applies outcomes + emits resolved on click', async () => {
    const store = useTowerStore()
    store._hydrateForTest({ determination: 2, maxDetermination: 5 })
    const w = mount(EventOptionPanel, { props: { event: EVENT } })
    await w.findAll('button')[0].trigger('click')
    expect(store.determination).toBe(3)
    expect(w.emitted().resolved).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行 FAIL**

- [ ] **Step 3: 实施**

`src/components/tower/EventOptionPanel.vue`：

```vue
<template lang="pug">
.event-modal(@click.self.stop)
  .event-modal__card
    h2.event-modal__title {{ event.title }}
    p.event-modal__desc {{ event.description }}
    ul.event-modal__options
      li(v-for="opt in event.options" :key="opt.id")
        button.event-modal__option(
          :disabled="!isAvailable(opt)"
          @click="onSelect(opt)"
        )
          span {{ opt.label }}
          span.event-modal__hint(v-if="!isAvailable(opt)") {{ requireHint(opt) }}
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import { evaluateRequirement } from '@/tower/events/event-evaluator'
import type { EventDef, EventOptionDef } from '@/tower/types'

const props = defineProps<{ event: EventDef }>()
const emit = defineEmits<{ resolved: [optionId: string] }>()

const store = useTowerStore()

const ctx = computed(() => ({
  determination: store.determination,
  crystals: store.crystals,
}))

function isAvailable(opt: EventOptionDef): boolean {
  return evaluateRequirement(opt.requires, ctx.value)
}

function requireHint(opt: EventOptionDef): string {
  // minimal hint; polish phase 可以精细化
  return '条件不满足'
}

function onSelect(opt: EventOptionDef) {
  for (const out of opt.outcomes) {
    store.applyEventOutcome(out)
  }
  emit('resolved', opt.id)
}
</script>

<style scoped lang="scss">
.event-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.event-modal__card {
  background: #1a1a1a;
  color: #eee;
  padding: 24px;
  border-radius: 8px;
  max-width: 480px;
  width: 90%;
}
.event-modal__title { margin: 0 0 12px; font-size: 20px; }
.event-modal__desc { margin: 0 0 20px; line-height: 1.5; opacity: 0.85; }
.event-modal__options { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.event-modal__option {
  width: 100%;
  padding: 10px 16px;
  background: #2a2a2a;
  color: #eee;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  &:hover:not(:disabled) { background: #333; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}
.event-modal__hint { font-size: 11px; opacity: 0.6; margin-top: 2px; }
</style>
```

- [ ] **Step 4: 运行 PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add src/components/tower/EventOptionPanel.vue src/components/tower/EventOptionPanel.test.ts
git commit -m "feat(tower-event): add EventOptionPanel modal component"
```

---

### Task 19: `DeathWindowVignette.vue` 组件

**Files:**
- Create: `src/components/hud/DeathWindowVignette.vue`

- [ ] **Step 1: 实施（无需单测 — 纯视觉 + bus 监听）**

`src/components/hud/DeathWindowVignette.vue`：

```vue
<template lang="pug">
Transition(name="vignette")
  .death-vignette(v-if="active")
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getEventBus } from '@/core/event-bus'  // adjust to actual singleton path

const props = defineProps<{ bus: ReturnType<typeof getEventBus> }>()
const active = ref(false)

function onDied() { active.value = true }
function onEnded() { active.value = false }

onMounted(() => {
  props.bus.on('player:died', onDied)
  props.bus.on('combat:ended', onEnded)
})
onUnmounted(() => {
  props.bus.off('player:died', onDied)
  props.bus.off('combat:ended', onEnded)
})
</script>

<style scoped lang="scss">
.death-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 80px rgba(255, 0, 0, 0.45);
  animation: death-pulse 1.2s ease-in-out infinite alternate;
  z-index: 500;
}
@keyframes death-pulse {
  from { box-shadow: inset 0 0 60px rgba(255, 0, 0, 0.30); }
  to   { box-shadow: inset 0 0 120px rgba(255, 0, 0, 0.60); }
}
.vignette-enter-active, .vignette-leave-active { transition: opacity 200ms ease; }
.vignette-enter-from, .vignette-leave-to { opacity: 0; }
</style>
```

注：`bus` 通过 prop 传入（父组件持有 scene bus），避免 global singleton 依赖。

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/DeathWindowVignette.vue
git commit -m "feat(hud): add DeathWindowVignette for player-death delayed resolution UX"
```

---

### Task 20: `BattleResultOverlay` 按钮矩阵重构

**Files:**
- Modify: `src/components/hud/BattleEndOverlay.vue` 或 `src/components/tower/BattleResultOverlay.vue`（phase 4 定义的爬塔专用版）
- Modify: 对应 test 文件

**契约：** 按 §4.1 矩阵渲染 4 种情形（kind ∈ {mob/elite, boss} × determination {>0, ==0}）。

- [ ] **Step 1: 定位 phase 4 的 overlay 文件**

`grep -l "BattleResultOverlay\|tower.*wipe\|tower.*retry" src/components/`

按 phase 4 spec §6 应该是 `src/components/tower/BattleResultOverlay.vue`。

- [ ] **Step 2: 写测试**

```typescript
describe('BattleResultOverlay matrix', () => {
  it('mob wipe + det > 0 shows [retry] [abandon-salvage]', () => {
    const w = mountWithStore({ determination: 3 }, { encounterKind: 'mob', result: 'wipe' })
    expect(w.text()).toMatch(/重试/)
    expect(w.text()).toMatch(/放弃.*水晶低保/)
  })

  it('boss wipe + det > 0 shows [retry] [abandon-ended]', () => {
    const w = mountWithStore({ determination: 3 }, { encounterKind: 'boss', result: 'wipe' })
    expect(w.text()).toMatch(/重试/)
    expect(w.text()).toMatch(/放弃.*整局结束/)
  })

  it('any kind + det == 0 shows only [enter-settlement]', () => {
    for (const kind of ['mob', 'elite', 'boss'] as const) {
      const w = mountWithStore({ determination: 0 }, { encounterKind: kind, result: 'wipe' })
      expect(w.findAll('button')).toHaveLength(1)
      expect(w.text()).toMatch(/进入结算/)
    }
  })
})
```

- [ ] **Step 3: 实施**

按矩阵重构 template。核心：

```vue
<template lang="pug">
.overlay(v-if="visible")
  .card
    h2 {{ titleText }}
    .actions(v-if="determination > 0")
      button.retry(@click="$emit('retry')") 重试
      button.abandon(@click="$emit('abandon')") {{ abandonLabel }}
    .actions(v-else)
      button.settle(@click="$emit('settle')") 进入结算
</template>

<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  visible: boolean
  result: 'wipe' | 'victory'
  encounterKind: 'mob' | 'elite' | 'boss'
  determination: number
}>()
defineEmits<{ retry: []; abandon: []; settle: [] }>()

const titleText = computed(() => props.result === 'wipe' ? '战斗失败' : '胜利')
const abandonLabel = computed(() =>
  props.encounterKind === 'boss' ? '放弃（整局结束）' : '放弃（拿 50% 水晶低保）'
)
</script>
```

父组件（tower/index.vue）监听 emit 事件：
- `retry` → `gameKey++` 重挂 EncounterRunner
- `abandon` + mob/elite → `abandonCurrentCombat()`（phase 4 既有，发 50% 水晶 + 标 completed + 回 in-path）
- `abandon` + boss → phase 切 `'ended'`
- `settle` → phase 切 `'ended'`

（**注意**：扣决心已经在 `combat:ended` 监听时通过 `onCombatWipe` 完成，overlay 只展示 + 接收用户选择）

- [ ] **Step 4: 运行 PASS + typecheck + 回归**

- [ ] **Step 5: Commit**

```bash
git add src/components/tower/BattleResultOverlay.vue src/components/tower/BattleResultOverlay.test.ts
git commit -m "feat(tower-ui): refactor BattleResultOverlay to phase 5 button matrix"
```

---

## Phase F：YAML 内容

### Task 21: 5 个 event yaml 文件

**Files:**
- Create: `public/tower/events/healing-oasis.yaml`
- Create: `public/tower/events/pilgrim-trade.yaml`
- Create: `public/tower/events/battle-trap.yaml`
- Create: `public/tower/events/training-dummy.yaml`
- Create: `public/tower/events/mystic-stele.yaml`
- Create: `public/tower/events/event-fallback.yaml`

- [ ] **Step 1: 建 5 个 event yaml**

`public/tower/events/healing-oasis.yaml`：

```yaml
id: healing-oasis
title: 治愈绿洲
description: 你发现一汪清澈的泉水。喝下去，似乎能让你重燃决心。
options:
  - id: drink
    label: 饮用泉水（+1 决心）
    outcomes:
      - { kind: determination, delta: 1 }
  - id: leave
    label: 礼貌离开
    outcomes: []
```

`public/tower/events/pilgrim-trade.yaml`：

```yaml
id: pilgrim-trade
title: 朝圣者交易
description: 一位虔诚的朝圣者愿意与你交易决心与水晶。
options:
  - id: give-determination
    label: 献出 1 决心 → 8 水晶
    requires:
      determination: { $gte: 2 }
    outcomes:
      - { kind: determination, delta: -1 }
      - { kind: crystals, delta: 8 }
  - id: give-crystals
    label: 献出 5 水晶 → 1 决心
    requires:
      crystals: { $gte: 5 }
    outcomes:
      - { kind: crystals, delta: -5 }
      - { kind: determination, delta: 1 }
  - id: leave
    label: 礼貌离开
    outcomes: []
```

`public/tower/events/battle-trap.yaml`：

```yaml
id: battle-trap
title: 战斗陷阱
description: 你触发了一处陷阱，前方笼罩着诡异的迷雾。
options:
  - id: tank
    label: 硬扛（-1 决心）
    outcomes:
      - { kind: determination, delta: -1 }
  - id: bypass
    label: 付 6 水晶绕路
    requires:
      crystals: { $gte: 6 }
    outcomes:
      - { kind: crystals, delta: -6 }
```

`public/tower/events/training-dummy.yaml`：

```yaml
id: training-dummy
title: 训练假人
description: 一具老旧的训练假人。专心练剑能让你重燃决心，但需要消耗补给。
options:
  - id: train
    label: 练剑（-8 水晶 → +1 决心）
    requires:
      crystals: { $gte: 8 }
    outcomes:
      - { kind: crystals, delta: -8 }
      - { kind: determination, delta: 1 }
  - id: leave
    label: 离开
    outcomes: []
```

`public/tower/events/mystic-stele.yaml`：

```yaml
id: mystic-stele
title: 神秘石碑
description: 一块古老的石碑刻满符文。触摸它或破坏它会带来不同后果。
options:
  - id: touch
    label: 触摸（-5 水晶 → +1 决心）
    requires:
      crystals: { $gte: 5 }
    outcomes:
      - { kind: crystals, delta: -5 }
      - { kind: determination, delta: 1 }
  - id: destroy
    label: 破坏（-1 决心 → +12 水晶）
    requires:
      determination: { $gte: 2 }
    outcomes:
      - { kind: determination, delta: -1 }
      - { kind: crystals, delta: 12 }
  - id: leave
    label: 离开
    outcomes: []
```

`public/tower/events/event-fallback.yaml`：

```yaml
id: event-fallback
title: 什么也没发生
description: 你警觉地环顾四周，但一切安然无事。
options:
  - id: continue
    label: 继续前行
    outcomes: []
```

- [ ] **Step 2: 手动验证 6 个 yaml 解析正常**

写一个临时脚本或 Vitest 测试，遍历所有 event yaml 调 `parseEventYaml`：

```typescript
// src/tower/events/event-loader.integration.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { parseEventYaml } from './event-loader'

const EVENT_IDS = [
  'healing-oasis', 'pilgrim-trade', 'battle-trap',
  'training-dummy', 'mystic-stele', 'event-fallback',
]

describe.each(EVENT_IDS)('event yaml: %s', (id) => {
  it(`${id} parses valid EventDef`, () => {
    const source = readFileSync(`public/tower/events/${id}.yaml`, 'utf-8')
    const def = parseEventYaml(source)
    expect(def.id).toBe(id)
    expect(def.options.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: 运行 PASS**

Run: `pnpm test src/tower/events/event-loader.integration.test.ts`

- [ ] **Step 4: Commit**

```bash
git add public/tower/events/*.yaml src/tower/events/event-loader.integration.test.ts
git commit -m "data(tower-event): add 5 MVP events + fallback yaml"
```

---

### Task 22: Elite encounter yaml × 2

**Files:**
- Create: `public/encounters/tower/elite-fortune-trial.yaml`
- Create: `public/encounters/tower/elite-aoe-marathon.yaml`

**注意：** 这两个 yaml 较长（含多个 skill + timeline actions）。数值为初始拍板值，调优期会改。参照 phase 4 `mob-frost-sprite.yaml` 的字段结构。

- [ ] **Step 1: elite-fortune-trial.yaml（DPS check 向，巴儿达木式背对机制）**

```yaml
# elite-fortune-trial.yaml — 精英：命运试炼者
# 核心机制循环（30s）：普攻 / 8s 背对读条 / 18s 陨石点名 / 28s DPS check 末日
# 超时：180s 叠愤怒 + loop 回 30s 重演
# TTK 目标：120-180s

arena:
  name: 命运试炼之间
  shape: circle
  radius: 16
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 180000
    attack: 280
    speed: 3.2
    size: 1.8
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 10

player:
  position: { x: 0, y: -13, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 10

local_buffs:
  elite_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }
  meteor_debuff:
    name: 陨石标记
    type: debuff
    stackable: true
    maxStacks: 4
    duration: 30000
    effects:
      - { type: vulnerability, value: 0.10 }

local_skills:
  boss_auto:
    name: 普攻
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  back_attack_tell:
    name: 邪神铁拳（背对）
    type: spell
    castTime: 5000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: cone, fromCaster: true, halfAngle: 90 }
        shape: { type: circle, radius: 14 }
        resolveDelay: 5000
        hitEffectDuration: 500
        effects:
          - { type: damage, potency: 5.5 }
  meteor_mark:
    name: 陨石落下
    type: spell
    castTime: 3000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }  # 假设引擎支持玩家位置 anchor；若不支持按最近 target anchor
        direction: { type: none }
        shape: { type: circle, radius: 5 }
        resolveDelay: 5000
        hitEffectDuration: 500
        effects:
          - { type: damage, potency: 4.0 }
          - { type: apply_buff, buffId: meteor_debuff, target: self }
  dps_check_doom:
    name: 末日审判
    type: spell
    castTime: 4000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 30 }
        resolveDelay: 4000
        hitEffectDuration: 500
        effects:
          - { type: damage, potency: 8.0 }
  elite_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: single
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: elite_enrage, target: caster }

skills: {}

phases:
  phase_default:
    actions:
      - { at: 0, action: enable_ai }
      - { at: 8000, action: use, use: back_attack_tell }
      - { at: 18000, action: use, use: meteor_mark }
      - { at: 28000, action: use, use: dps_check_doom }
      - { at: 58000, action: use, use: back_attack_tell }
      - { at: 68000, action: use, use: meteor_mark }
      - { at: 78000, action: use, use: dps_check_doom }
      - { at: 108000, action: use, use: back_attack_tell }
      - { at: 118000, action: use, use: meteor_mark }
      - { at: 128000, action: use, use: dps_check_doom }
      - { at: 158000, action: use, use: back_attack_tell }
      - { at: 168000, action: use, use: meteor_mark }
      - { at: 178000, action: use, use: dps_check_doom }
      - { at: 180000, action: use, use: elite_enrage_stack }
      - { at: 180001, action: loop, loop: 30000 }
```

- [ ] **Step 2: elite-aoe-marathon.yaml（AOE 马拉松向）**

```yaml
# elite-aoe-marathon.yaml — 精英：无尽风暴
# 核心机制循环（25s）：2s 3 连小圆 / 10s 十字 / 18s 5 连点名
# 超时：150s 叠愤怒 + loop 回 25s 重演
# TTK 目标：120-150s；攻击力较低但 AOE 密集

arena:
  name: 无尽风暴之域
  shape: circle
  radius: 17
  boundary: wall

entities:
  boss:
    type: mob
    group: boss
    hp: 150000
    attack: 200
    speed: 2.8
    size: 1.5
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 10

player:
  position: { x: 0, y: -14, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 10

local_buffs:
  elite_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }

local_skills:
  boss_auto:
    name: 普攻
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  chain_aoe_1:
    name: 连环乱雷·一
    type: spell
    castTime: 1500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 4 }
        resolveDelay: 1500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 3.0 }
  chain_aoe_2:
    name: 连环乱雷·二
    type: spell
    castTime: 1500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 4 }
        resolveDelay: 1500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 3.0 }
  chain_aoe_3:
    name: 连环乱雷·三
    type: spell
    castTime: 1500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 4 }
        resolveDelay: 1500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 3.0 }
  cross_aoe:
    name: 十字切割
    type: spell
    castTime: 2500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: rect, length: 30, width: 5 }
        resolveDelay: 2500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 5.0 }
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: rect, length: 5, width: 30 }
        resolveDelay: 2500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 5.0 }
  multi_marker_1:
    name: 连续点名·1
    type: spell
    castTime: 1500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 3 }
        resolveDelay: 1500
        hitEffectDuration: 400
        effects:
          - { type: damage, potency: 3.5 }
  elite_enrage_stack:
    name: 愤怒叠层
    type: ability
    targetType: single
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: elite_enrage, target: caster }

skills: {}

phases:
  phase_default:
    actions:
      - { at: 0, action: enable_ai }
      - { at: 2000, action: use, use: chain_aoe_1 }
      - { at: 3500, action: use, use: chain_aoe_2 }
      - { at: 5000, action: use, use: chain_aoe_3 }
      - { at: 10000, action: use, use: cross_aoe }
      - { at: 18000, action: use, use: multi_marker_1 }
      - { at: 19500, action: use, use: multi_marker_1 }
      - { at: 21000, action: use, use: multi_marker_1 }
      - { at: 22500, action: use, use: multi_marker_1 }
      - { at: 27000, action: use, use: chain_aoe_1 }
      - { at: 28500, action: use, use: chain_aoe_2 }
      - { at: 30000, action: use, use: chain_aoe_3 }
      - { at: 35000, action: use, use: cross_aoe }
      - { at: 43000, action: use, use: multi_marker_1 }
      - { at: 44500, action: use, use: multi_marker_1 }
      - { at: 46000, action: use, use: multi_marker_1 }
      - { at: 47500, action: use, use: multi_marker_1 }
      - { at: 150000, action: use, use: elite_enrage_stack }
      - { at: 150001, action: loop, loop: 25000 }
```

- [ ] **Step 3: 手动浏览器验证 2 个 elite 加载 + 战斗可玩**

`pnpm dev` → 打开 `/encounter/elite-fortune-trial`（如果独立模拟器允许直接传 id；否则先 Task 23 把 encounter 加入 pool 后走 tower 路径测）

- [ ] **Step 4: Commit**

```bash
git add public/encounters/tower/elite-fortune-trial.yaml public/encounters/tower/elite-aoe-marathon.yaml
git commit -m "data(tower-encounter): add 2 elite encounters (fortune-trial DPS check + aoe-marathon)"
```

---

### Task 23: Boss encounter yaml + `conditions: [echo-boss]`

**Files:**
- Create: `public/encounters/tower/boss-tower-warden.yaml`

**结构：** 3 阶段（HP 66% / 33% 阈值切换）+ 阶段 invul 5s + 末段硬狂暴。

**注意：** Phase 3 的 timeline scheduler 是否支持"基于 boss HP 阈值切换 phase"？需要确认 — phase 4 的 mob yaml 只用单 phase。若不支持，需要 implementer 扩展 phase trigger 机制（属于新功能，超出 phase 5 spec）。**Implementer 工作开始前 grep `timeline-scheduler.ts` 或 phase-trigger 逻辑**，若不支持基于 hp 阈值的 phase 切换，则**退化方案**：只用单 phase + 在 timeline 固定时间点放机制（牺牲"玩家打得快跳阶段"的动态性），或加 phase 触发字段支持（单独 task）。

**退化方案下的 boss yaml**：

```yaml
# boss-tower-warden.yaml — 塔之守望者（phase 5 MVP 退化版）
# 3 阶段线性时间轴 + 硬狂暴 @ t=240s
# TTK 目标：3-5 min；echo 在开战时激活

arena:
  name: 塔之巅
  shape: circle
  radius: 20
  boundary: wall

conditions:
  - echo-boss

entities:
  boss:
    type: mob
    group: boss
    hp: 600000
    attack: 350
    speed: 3
    size: 2.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 5
    aggroRange: 12

player:
  position: { x: 0, y: -15, z: 0 }

boss_ai:
  chaseRange: 5
  autoAttackRange: 5
  autoAttackInterval: 3000
  aggroRange: 12

local_buffs:
  phase_invul:
    name: 阶段切换
    type: buff
    stackable: false
    maxStacks: 1
    duration: 5000
    effects:
      - { type: invulnerable }

local_skills:
  boss_auto:
    name: 普攻
    type: ability
    targetType: single
    requiresTarget: true
    range: 5
    effects: [{ type: damage, potency: 1 }]

  # Phase 1 机制
  p1_aoe:
    name: 黯蚀波
    type: spell
    castTime: 2500
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 7 }
        resolveDelay: 2500
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 4.5 }]
  p1_marker:
    name: 定罪点名
    type: spell
    castTime: 3000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 5 }
        resolveDelay: 3000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 4.0 }]

  # Phase 2 解锁
  p2_shrink_marker:
    name: 缩圈点名
    type: spell
    castTime: 3000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: target }
        direction: { type: none }
        shape: { type: circle, radius: 3 }
        resolveDelay: 3000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 5.5 }]

  # Phase 3 all-on + 硬狂暴
  p3_fulminating:
    name: 审判雷霆
    type: spell
    castTime: 2000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 8 }
        resolveDelay: 2000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 5.0 }]
  enrage:
    name: 灭尽（硬狂暴）
    type: spell
    castTime: 5000
    targetType: aoe
    requiresTarget: false
    range: 0
    zones:
      - anchor: { type: caster }
        direction: { type: none }
        shape: { type: circle, radius: 50 }
        resolveDelay: 5000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 9999 }]

  apply_phase_invul:
    name: 阶段切换 invul
    type: ability
    targetType: single
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: phase_invul, target: caster }

skills: {}

phases:
  phase_default:
    actions:
      - { at: 0, action: enable_ai }
      # Phase 1: 0–80s
      - { at: 8000, action: use, use: p1_aoe }
      - { at: 20000, action: use, use: p1_marker }
      - { at: 32000, action: use, use: p1_aoe }
      - { at: 50000, action: use, use: p1_marker }
      - { at: 65000, action: use, use: p1_aoe }
      # Phase 2 切换 invul 5s: 80–85s
      - { at: 80000, action: use, use: apply_phase_invul }
      # Phase 2: 85–160s
      - { at: 95000, action: use, use: p1_aoe }
      - { at: 108000, action: use, use: p2_shrink_marker }
      - { at: 122000, action: use, use: p1_marker }
      - { at: 135000, action: use, use: p2_shrink_marker }
      - { at: 150000, action: use, use: p1_aoe }
      # Phase 3 切换 invul: 160–165s
      - { at: 160000, action: use, use: apply_phase_invul }
      # Phase 3: 165–240s（密集 + 叠层）
      - { at: 170000, action: use, use: p3_fulminating }
      - { at: 185000, action: use, use: p2_shrink_marker }
      - { at: 195000, action: use, use: p3_fulminating }
      - { at: 210000, action: use, use: p1_marker }
      - { at: 220000, action: use, use: p3_fulminating }
      # 硬狂暴 @ 240s
      - { at: 240000, action: use, use: enrage }
```

- [ ] **Step 1: 检查引擎是否支持 `conditions` 字段顶层解析（Task 16 已做）**

- [ ] **Step 2: 创建 boss yaml（上面内容）**

- [ ] **Step 3: 手动浏览器验证**

加入 encounter pool 前先在独立模拟器测（如 `/encounter/boss-tower-warden`）。

- [ ] **Step 4: Commit**

```bash
git add public/encounters/tower/boss-tower-warden.yaml
git commit -m "data(tower-encounter): add boss-tower-warden (3 linear phases + hard enrage + echo condition)"
```

---

### Task 24: 扩容 encounter-pool.json

**Files:**
- Modify: `public/tower/pools/encounter-pool.json`

- [ ] **Step 1: 追加 3 entries**

在 `public/tower/pools/encounter-pool.json` 的 `entries` 数组末尾（mob-fallback 之后或之前均可，deprecated 保持最末）追加：

```jsonc
{
  "id": "elite-fortune-trial",
  "yamlPath": "encounters/tower/elite-fortune-trial.yaml",
  "kind": "elite",
  "scoutSummary": "命运试炼者：限时 DPS check + 答错叠 debuff",
  "rewards": { "crystals": 35 }
},
{
  "id": "elite-aoe-marathon",
  "yamlPath": "encounters/tower/elite-aoe-marathon.yaml",
  "kind": "elite",
  "scoutSummary": "无尽风暴：连环 AOE 高密度躲避",
  "rewards": { "crystals": 35 }
},
{
  "id": "boss-tower-warden",
  "yamlPath": "encounters/tower/boss-tower-warden.yaml",
  "kind": "boss",
  "scoutSummary": "塔之守望者：三阶段 + 硬狂暴",
  "rewards": { "crystals": 80 }
}
```

- [ ] **Step 2: 集成测试 — encounter-pool 能 resolve 新 entries + pick from active by kind**

追加到 `src/tower/pools/encounter-pool.test.ts` 或 integration test：

```typescript
it('resolveEncounter returns elite-fortune-trial entry', async () => {
  _resetEncounterPoolCache()
  // real fetch against public/ — requires setup file serving; or mock with actual manifest content
  const entry = await resolveEncounter('elite-fortune-trial')
  expect(entry.kind).toBe('elite')
  expect(entry.rewards.crystals).toBe(35)
})

it('pickEncounterIdFromActivePool by kind returns elite only for elite kind', async () => {
  _resetEncounterPoolCache()
  const id = await pickEncounterIdFromActivePool('seed-1', 7, 'elite')
  expect(['elite-fortune-trial', 'elite-aoe-marathon']).toContain(id)
})
```

- [ ] **Step 3: 运行 PASS + 回归**

- [ ] **Step 4: Commit**

```bash
git add public/tower/pools/encounter-pool.json src/tower/pools/encounter-pool.test.ts
git commit -m "data(tower-pool): extend encounter pool with 2 elites + 1 boss"
```

---

## Phase G：UI 整合

### Task 25: `NodeConfirmPanel` 移除 disabled + 显示场地机制

**Files:**
- Modify: `src/components/tower/NodeConfirmPanel.vue`

- [ ] **Step 1: 确认 phase 4 既有实现位置**

- [ ] **Step 2: 删除 elite/boss `[进入]` disabled 分支**

grep 文件中 `phase 5 实装` 文案位置，删除条件分支；启用 `[进入]` 按钮。

- [ ] **Step 3: 加"场地机制"显示区块**

在 template 中为 boss 节点加场地机制列表（mob/elite 节点不显示）：

```vue
<template lang="pug">
//- ...existing
.confirm-panel__conditions(v-if="conditions.length > 0")
  h4 本场战斗激活的场地机制
  ul
    li(v-for="c in conditions" :key="c.id")
      span {{ c.scoutSummary }}
      span.trigger-hint(v-if="isActivelyTriggered(c)") （当前将立即触发）
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { resolveCondition } from '@/tower/pools/battlefield-condition-pool'
import { loadEncounter } from '@/game/encounter-loader'  // or equivalent
// ...

const conditions = ref<Array<{ id: string; scoutSummary: string; kind: string; params: any }>>([])

onMounted(async () => {
  if (props.node.kind !== 'boss') return
  const encounterId = props.node.encounterId
  if (!encounterId) return
  // Load encounter yaml to read conditions
  const encMeta = await resolveEncounter(encounterId)
  const encData = await loadEncounter(encMeta.yamlPath)
  for (const cid of encData.conditions ?? []) {
    const c = await resolveCondition(cid)
    conditions.value.push(c)
  }
})

const towerStore = useTowerStore()

function isActivelyTriggered(c: { kind: string; params: any }): boolean {
  if (c.kind === 'echo') {
    return towerStore.determination <= c.params.determinationThreshold
  }
  return false
}
</script>
```

- [ ] **Step 4: Typecheck + 手动测试**

`pnpm dev` → 打开 tower → 走到 boss 节点 → 点击 → 确认面板显示 echo scoutSummary + 触发状态。

- [ ] **Step 5: Commit**

```bash
git add src/components/tower/NodeConfirmPanel.vue
git commit -m "feat(tower-ui): enable elite/boss entry; show battlefield conditions on boss"
```

---

### Task 26: `tower/index.vue` 整合 event modal + DeathWindowVignette + boss 放弃

**Files:**
- Modify: `src/pages/tower/index.vue`

- [ ] **Step 1: 整合 EventOptionPanel**

当玩家点 event 节点进入时：

```vue
<script setup lang="ts">
// ...existing
import EventOptionPanel from '@/components/tower/EventOptionPanel.vue'
import { loadEventById } from '@/tower/events/event-loader'
import type { EventDef } from '@/tower/types'

const activeEvent = ref<EventDef | null>(null)

async function onEventNodeEnter(node: TowerNode) {
  if (!node.eventId) {
    console.error('[tower] event node missing eventId', node)
    return
  }
  activeEvent.value = await loadEventById(node.eventId)
}

function onEventResolved(optionId: string) {
  // mark node completed
  store.markNodeCompleted(currentNodeId)
  activeEvent.value = null
}
</script>

<template lang="pug">
//- ...existing
EventOptionPanel(
  v-if="activeEvent"
  :event="activeEvent"
  @resolved="onEventResolved"
)
DeathWindowVignette(
  v-if="scene?.bus"
  :bus="scene.bus"
)
</template>
```

- [ ] **Step 2: Boss 放弃路径 → ended**

找 phase 4 BattleResultOverlay 的 abandon emit handler，加 kind 分支：

```typescript
function onAbandon(encounterKind: 'mob' | 'elite' | 'boss') {
  if (encounterKind === 'boss') {
    store.transitionToEnded()  // phase 4 既有或新增
  } else {
    store.abandonCurrentCombat()  // phase 4 既有：50% 水晶 + completed + 回 in-path
  }
}
```

- [ ] **Step 3: Typecheck + 手动测试**

完整走一遍 tower 流程：
- 起点 → 走到 event 节点 → modal 弹 → 选项应用 → 节点 completed → 继续
- 走到 boss 节点 → 放弃 → 直接进 ended
- boss 战打死 → 胜利 → ... (phase 6 结算)

- [ ] **Step 4: Commit**

```bash
git add src/pages/tower/index.vue
git commit -m "feat(tower-page): integrate EventOptionPanel + DeathWindowVignette + boss abandon → ended"
```

---

### Task 27: Manual QA 集成清单

**Files:**
- 不改代码；产出 `docs/tower-p5-qa-checklist.md` 或 inline 到 plan

- [ ] **Step 1: 走完下列场景**

```
□ 启动新 run → 走到 event 节点 → treating-oasis → +1 决心
□ 走到 pilgrim-trade → 三个选项渲染 / requires 正确灰化
□ 走到 battle-trap → 付水晶绕 / 硬扛扣决心两条路径
□ 走到 mystic-stele → 双向 trade 正确应用
□ 走到 mob 节点 → 战斗 wipe → overlay 弹（决心 -1）→ 重试 OR 放弃（50% 水晶 + completed）
□ 走到 elite 节点（fortune-trial）→ 战斗胜（+35 水晶）
□ 走到 elite 节点（aoe-marathon）→ 战斗 wipe → 放弃 → 50% 水晶 + completed
□ 走到 boss 节点 → NodeConfirmPanel 显示 echo scoutSummary
□ 决心 ≤ 2 时 boss 节点 → NodeConfirmPanel 显示"将立即触发"+ boss 战开始 player 有 echo buff (HUD 展示)
□ Boss 战死亡 → death window → 红色毛边显示 → 10s 超时 → overlay 弹（决心 -2）→ 重试
□ Boss 战 DoT 翻盘胜 → 死后 DoT 继续 tick 打死 boss → 不扣决心 → 胜利结算
□ 决心归 0 时战斗 wipe → overlay 只显示 [进入结算] 按钮 → 进 ended
□ Boss 战选放弃 → ended（不走低保）
□ 全程 typecheck OK + 全测 PASS + 浏览器 console 无未预期 error
```

- [ ] **Step 2: 若发现 bug，建 fix task**

- [ ] **Step 3: Commit（QA 文档）**

```bash
git add docs/tower-p5-qa-checklist.md
git commit -m "docs(tower): add phase 5 manual QA checklist"
```

---

## Phase H：文档 sync

### Task 28: GDD §2.14 表 sync

**Files:**
- Modify: `docs/brainstorm/2026-04-17-rougelike.md`

- [ ] **Step 1: 定位 §2.14 表**

在 GDD 找到决心表：

```markdown
| 小怪/精英失败（选重试）      | -1 ❤️            | ...
| 小怪/精英失败（选放弃）      | 0                | 节点标记"已通过"，获得放弃低保（见 2.14.1）
```

- [ ] **Step 2: 改成 phase 5 新语义**

```markdown
| 小怪/精英失败（选重试）      | -1 ❤️（扣减时机 = 战斗结束弹窗瞬间）| ...
| 小怪/精英失败（选放弃）      | -1 ❤️（同上，放弃也扣；phase 5 后改动，强化沉没成本）| 节点标记"已通过"，获得放弃低保（见 2.14.1）
| Boss 失败                    | -2 ❤️（同上）| HP 回满后再次挑战；决心 ≤ 0 时进结算
```

（具体措辞按 GDD 既有风格微调）

- [ ] **Step 3: 加注释说明 phase 5 变更**

在 §2.14 末尾或表下加一条：

```markdown
> **Phase 5 更新（2026-04-18）**：决心扣减时机统一到"战斗结束弹窗弹出瞬间"，不再区分重试 / 放弃按钮档位。放弃仍提供 50% 水晶低保（小怪/精英）或直接进结算（boss）。
```

- [ ] **Step 4: Commit**

```bash
git add docs/brainstorm/2026-04-17-rougelike.md
git commit -m "docs(gdd): sync §2.14 determination table to phase 5 semantics (abandon also deducts)"
```

---

## Self-Review Checklist（plan 自审，写完才做）

**1. Spec coverage（对照 spec §2 IN 清单）**

- [x] 场地机制 runtime — Tasks 5, 6, 15, 16, 17
- [x] 超越之力实施 — Tasks 2, 14, 15, 17
- [x] `attack_modifier` / `max_hp_modifier` effect — Tasks 1, 2, 3
- [x] 事件节点 runtime — Tasks 7, 8, 12, 18, 21, 26
- [x] `EventRequirement` MongoDB-like — Task 8
- [x] 精英战实施 — Tasks 22, 24, 25
- [x] Boss 战实施 — Tasks 23, 24, 25
- [x] 决心扣减重构 — Tasks 9, 10, 20
- [x] 战败延迟结算 — Tasks 13, 19
- [x] `preserveOnDeath` runtime — Task 4, 14
- [x] 决心变化 interceptor hook — Tasks 9, 11
- [x] `NodeConfirmPanel` 修整 — Task 25
- [x] Encounter pool 扩容 — Task 24
- [x] GDD sync — Task 28

**2. Placeholder scan**

全部 task 都包含完整代码示例或精确命令；no "TBD / implement later / similar to Task N" 占位。

**3. Type 一致性**

- `DeterminationInterceptor` / `DeterminationChangeIntent` / `DeterminationChangeResult` 在 Task 9 定义后贯穿 Tasks 10, 11 使用
- `EventDef` / `EventOption` / `EventOutcome` / `NumberComparator` 在 Task 8 定义后 Tasks 18, 21 使用
- `BattlefieldConditionPoolEntry` 在 Task 5 定义后 Tasks 15, 17, 25 使用
- Entity `baseAttack` / `baseMaxHp` 在 Task 1 加，Tasks 2, 3 消费（`getAttack` / `getMaxHp`）
- `BuffEffectDef.attack_modifier` / `max_hp_modifier` 在 Task 2 加，Task 14 echo buff 消费

**4. 依赖顺序**

Tasks 1-4 (引擎基建) → 5-8 (pool 基建) → 9-12 (store) → 13 (death window 需 clearDeathBuffs from Task 4) → 14-17 (condition + echo 需 buff types from Tasks 1-2) → 18-20 (event UI + overlay) → 21-24 (YAML) → 25-27 (整合) → 28 (doc sync)。

---

**Plan 完成，共 28 tasks。**
