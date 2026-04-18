# Rougelike Tower — Phase 5 (Elite / Boss / Events / Death-Window) 设计

> Scope：把精英战 / Boss 战 / 事件节点接入爬塔流程，落地超越之力（Echo）作为首个**场地机制**实例，引入决心扣减时机重构 + 战败延迟结算 (death window) + 死亡 buff `preserveOnDeath` 处理 + 决心变化 interceptor hook。引擎层新增两个 buff effect modifier (`attack_modifier` / `max_hp_modifier`) 作为 phase 6 魔晶石词条的基建。
>
> 本 phase 同时建立 **场地机制 pool** 与 **事件 pool**（按 phase 4 工程宪法 §2 模板）；并新建 `docs/tower-deferred-backlog.md` 作为跨 phase 延后项总账。

---

## 1. Spec Reference

- **GDD**: `docs/brainstorm/2026-04-17-rougelike.md`
  - §2.3（随机事件）
  - §2.5.2（精英战设计原则 + FF14 灵感库）
  - §2.13（Boss 战 — 硬狂暴 / 决心 -2 / 超越之力翻盘）
  - §2.14（决心 — 表 sync 项见 §9）
  - §2.14.3（超越之力 The Echo）
  - §2.15（死亡惩罚）
  - §7.2（MVP 事件 5 个边界）
  - §7.4（场地机制作为可复用模式 / 数据与引擎分离）
- **项目宪法**: `docs/tower-engineering-principles.md`
  - §2 Pool Registry / Active Pool 分离
  - §3 开局一次性 rng 固化（event 节点扩展）
  - §6 单路由状态机（event 用 modal 叠 in-path，不引入新 phase）
  - §7 战斗结束归属（death window 在引擎层延迟 emit）
  - §9 死亡 buff 清除策略（phase 5 实施）
  - §10 战败延迟结算（phase 5 实施）
- **Phase 1 / 2 / 3 / 4 产物**:
  - `src/tower/types.ts` — `TowerNode` / `TowerRun` / `BattleldfieldCondition`(echo 占位) / `TOWER_RUN_SCHEMA_VERSION`
  - `src/tower/pools/encounter-pool.ts` — phase 5 condition / event pool resolver 直接照搬模板
  - `src/stores/tower.ts` — phase 4 决心扣减 / 放弃低保 / `pendingCombatNodeId` / `startDescent` 固化 encounterId
  - `src/components/tower/NodeConfirmPanel.vue` — phase 5 移除 elite/boss disabled stub + 显示场地机制
  - `src/components/tower/EncounterRunner.vue` — phase 5 mount 时消费 encounter yaml `conditions` 字段
  - `src/components/hud/BattleEndOverlay.vue` / `BattleResultOverlay.vue`(phase 4) — phase 5 重构按钮矩阵
  - `src/combat/buff-periodic.ts` — phase 3 dead-entity 跳 tick + invul 跳 tick（death window 直接复用）
  - `src/combat/buff.ts` — phase 5 新增 `clearDeathBuffs` + `getAttackModifier` + `getMaxHpModifier`
- **Memory 铺底**:
  - `project_defeat_delayed_resolution.md` — DoT 致死翻盘语义
  - `project_death_buff_handling.md` — `preserveOnDeath` 策略

---

## 2. Scope

### IN（phase 5 必做）

**场地机制 (battlefield condition) runtime**:
- 新建 `public/tower/pools/battlefield-condition-pool.json` manifest
- 新建 `src/tower/pools/battlefield-condition-pool.ts` resolver（照搬 encounter-pool.ts）
- Encounter YAML 顶层加 `conditions?: string[]` 可选字段（id 引用池）
- `EncounterRunner` mount 时按 yaml `conditions` 列表激活 condition；按 condition kind dispatch 到具体 handler
- MVP 1 个 condition kind: `echo`

**超越之力 (echo) 实施**:
- 新增 buff `COMMON_BUFFS.echo`（attack +25% / mit +25% / maxHp +25%，`preserveOnDeath: true`）
- `activateEchoCondition(cond, scene, towerCtx)`：决心 ≤ threshold 时给 player apply echo buff，否则 noop
- 引擎新增两个 buff effect type:
  - `attack_modifier`: `entity.attack` 改读 `getAttack(entity, buffSystem)` = `baseAttack × (1 + sum)`，DoT/AA snapshot 冻结时刻使用此值
  - `max_hp_modifier`: `entity.maxHp` 改读 `getMaxHp(entity, buffSystem)` = `baseMaxHp × (1 + sum)`；apply 时 hp 不补偿（FF14 严谨派，依赖 idle regen 兜视觉）；remove 时 hp 截到 newMaxHp

**事件节点 (event) runtime**:
- 新建 `public/tower/pools/event-pool.json` manifest
- 新建 `src/tower/pools/event-pool.ts` resolver
- `TowerNode.eventId?: string` 字段
- `startDescent` 扩展：固化 event 节点 `eventId`，namespace `'event'`
- 5 个事件 yaml: `healing-oasis` / `pilgrim-trade` / `battle-trap` / `training-dummy` / `mystic-stele` + `event-fallback`
- `EventOptionPanel.vue`: modal 叠在 in-path 上，渲染选项 / 应用 outcome / 节点 completed
- 不引入 `'in-event'` phase；event 流程整体在 `'in-path'` 内完成
- `EventRequirement` 走 MongoDB-like operator（`$gte / $lte / $gt / $lt / $eq / $ne`），无字符串 DSL
- `EventOutcome` MVP 仅两 kind: `crystals` / `determination`，clamp 决心 [0, maxDetermination]

**精英战 (elite) 实施**:
- Encounter pool 加 2 个 elite entries
- 2 个精英 yaml:
  - `elite-fortune-trial.yaml` (DPS check 向，灵感 = 巴儿达木霸道)
  - `elite-aoe-marathon.yaml` (AOE 马拉松向，连环密集 AOE)
- 两者均含软超时 loop（180s/150s 后叠愤怒 + loop 回到机制起点）
- 精英战死亡扣 -1 决心（与 mob 同档）
- 精英战放弃低保 = 50% 水晶（与 mob 同档）

**Boss 战 (boss) 实施**:
- Encounter pool 加 1 个 boss entry
- 1 个 boss yaml: `boss-tower-warden.yaml`，3 阶段（66% / 33% 阈值切换）+ 阶段过渡 invul + 末段硬狂暴（`enrage` 单体高伤直接秒杀）
- 顶层声明 `conditions: ["echo-boss"]`（挂超越之力）
- Boss 战死亡扣 -2 决心
- Boss 战 BattleResultOverlay [放弃] = 整局结束（不走低保流程）

**决心扣减时机重构（修整 phase 4）**:
- 扣减时机**统一**到 `combat:ended { result: 'wipe' }` 处理时（弹 BattleResultOverlay 之前）
- 不再区分"重试 / 放弃"按钮的扣减差异；按钮文案剥离 `❤️ cost` 标记
- 扣减档位：mob/elite = -1，boss = -2
- 决心 == 0 时 BattleResultOverlay **退化**为单一 `[进入结算]` 按钮（任意 kind，玩家不能带 0 决心继续走 in-path）
- Boss 战 `[放弃]`（决心 > 0）= 直接进 ended，不走低保

**战败延迟结算 (death window)**:
- 玩家 `hp ≤ 0` 触发 → 引擎层 `enterDeathWindow`，**不立即** emit `combat:ended`
- Game loop 每帧 `tickDeathWindow`：
  1. boss 死 → `finalizeDeathWindow('victory')`（DoT 翻盘，**不扣**决心）
  2. 时间窗口超时（`DEATH_WINDOW_MS = 10000`） → `finalizeDeathWindow('wipe')`
  3. boss 身上的 player DoT 全部过期 → 提前 `finalizeDeathWindow('wipe')`
- UI 层：监听 `player:died` 事件，触发屏幕边缘红色毛边闪烁（CSS box-shadow inset + keyframes）；监听 `combat:ended` 关闭
- 触发条件 = 玩家死亡（**所有战斗都启用**，不限 boss kind）
- 与 phase 3 既有行为兼容：DoT tick 在 dead entity (`!alive`) 自动跳过；boss invul 期间 DoT tick 也已自动跳过（`buff-periodic.ts:132 + :222`）

**死亡 buff `preserveOnDeath` runtime**:
- `BuffSystem.clearDeathBuffs(entity)`：保留 `preserveOnDeath: true`，移除其他
- 调用点：`enterDeathWindow` 触发后立即对 `player` 调用一次
- Phase 5 内**无可见消费场景**（echo 战斗结束随 scene 销毁；重试新挂 entity buffs 空），仅建立 hook + 契约预留 raise / 战斗内 respawn 接入

**决心变化 interceptor hook**:
- `TowerStore.changeDetermination(intent)` 单一入口
- `intent.source`: `'mob-wipe' | 'elite-wipe' | 'boss-wipe' | 'event' | 'campfire-offer' | string`
- `interceptors: DeterminationInterceptor[]` 数组（phase 5 永远空）
- 链式应用 + cancel 立即终止
- 所有 phase 5 决心变化点（mob/elite/boss wipe / event outcome）必须走此 API

**`NodeConfirmPanel` 修整**:
- 移除 elite/boss `[进入]` disabled stub + "phase 5 实装"文案
- Boss 节点显示场地机制列表（从 yaml `conditions` 字段读 → resolver 拿 scoutSummary → 渲染）
- Echo condition 当前满足触发条件时高亮提示（"你的决心 = 2，将获得 +25% 全属性"）

**Encounter pool 扩容**:
- 加 2 elite + 1 boss entries
- `kind` 字段已支持 `mob | elite | boss`（phase 4 已定义），无需扩 union

**文档同步**:
- 新建 `docs/tower-deferred-backlog.md`
- 修订 GDD §2.14 表格（"放弃不扣决心" → "放弃也扣 -1/-2"，sync phase 5 改动）

### OUT（phase 5 不做，明确入 deferred backlog）

- 第 0 节点武器 + 3 选 1 策略卡 — phase 6+
- 奖励节点 / 篝火节点 runtime — phase 6
- 结算 / 金币 / 抽卡 / 定轨券 — phase 6
- 武器 / 魔晶石 / 词条配装 — phase 6
- 局外甲胄 / 抽卡 / 绝境战 — phase 7+
- 教程塔 — phase 7
- 精英"小游戏向"机制（跳舞机 / 质数机器人）— 引擎缺非战斗判定 runtime
- 事件 outcome 扩容（魔晶石 / 武器 / 局外持续 buff）— 待 phase 6 systems
- 事件池扩容到 20+ — 待 outcome 扩容后
- echo 视觉补血 (instant_heal_pct 第二条款 FF14 战栗模式) — 调优窗口决定
- speed_modify 之外的其他词条 modifier (crit-rate / crit-damage / skill-speed) — phase 6 魔晶石
- preserveOnDeath 真消费场景（raise / 战斗内 respawn）— 待 raise 系统设计
- Determination interceptor 真实使用者 + UI 浮字反馈 — 策略卡 phase 7
- Battlefield condition 扩容（电场 / 二阶段狂暴 / 深层迷宫专属）— 框架就绪后任意时间
- Event requirement 扩容操作符 (`$not / $or / $and / $in`) — 真有需求时
- Phase 3 polish backlog（boss 血条 debuff / DoT 跳字 / buff apply-remove 浮字 / 雷达图 / portrait）— 独立施工
- 数值平衡 — phase 6 魔晶石 + 词条上线后才成系统问题，本 phase 保持 phase 4 数值档位

---

## 3. 关键工程决策

### 3.1 场地机制 = pool + 内联挂载（C 方案）

**决策**：condition 定义放 pool（id + 参数），但**挂载关系内联在 encounter yaml** (`conditions: [...]`)，不固化进 `TowerNode`。

**理由**：
- id 进 pool 满足宪法 §2 "已发布 id 永不删 / 改核心效果新 id" 契约 — echo 之后扩展"持续电场" / "boss 二阶段狂暴" 时 id 是稳定演化身份
- 挂载关系内联避开 `TowerNode` 字段膨胀 + 避开开局固化 conditionIds 的复杂度
- `startDescent` 不需要知道 condition；进战斗时由 `EncounterRunner` 读 yaml 现解析即可
- "同一 encounter 不同 condition 组合"在 MVP 不需要

**反方案不采纳**：
- A (完整 pool + 固化 conditionIds 进 TowerNode)：MVP 只 1 entry 1 挂载，结构空
- B (纯内联): id 失去演化身份，未来宪法 §2 兼容性破坏

### 3.2 超越之力翻译 = "攻击 +25% / 减伤 +25% / 最大生命 +25%"

**决策**：echo 三条 effect:
- `{ type: 'attack_modifier', value: 0.25 }` — 新增 effect type
- `{ type: 'mitigation', value: 0.25 }` — 复用现有，已乘算分层
- `{ type: 'max_hp_modifier', value: 0.25 }` — 新增 effect type

**理由（关键 — 乘算分层）**：
- `damage_increase` 是 additive 池子（`1 + sum`）— echo 用此会被其他增伤稀释，语义不对
- `attack_modifier` 走基础值乘法层（`baseAttack × (1 + sum_of_modifiers)`），与 `damage_increase` 池子分层独立
- `mitigation` 已是乘算分层 (`(1-v1)(1-v2)...`)，直接用
- `max_hp_modifier` 同 attack 走基础值乘法层

**FF14 严谨派 — max_hp 不补偿当前 hp**：
- apply 时 hp 不动；remove 时 hp 截到 newMaxHp
- 进 boss 战瞬间血条显示 80% 是预期表现
- 视觉 corner case 由现有 `player-input-driver.ts:14-21` idle regen 兜底（脱战 20% per 3s，第一个 tick 即满血）
- 需要"加血上限同时回血"必须显式叠 `instant_heal` 第二条款（FF14 战栗模式）— phase 5 不做，入 deferred

**phase 6 收益**：魔晶石 HP 词条 / 攻击词条直接复用这两套 modifier，不用再造

### 3.3 事件 = pool + modal 叠 in-path（不引入新 phase）

**决策**：事件 runtime 不引入 `'in-event'` `TowerRunPhase` 成员；用 `EventOptionPanel.vue` modal 叠在 in-path 上即可。

**理由**：
- 宪法 §6 单路由状态机原则
- 事件没有"中途暂停回头"语义（决策原子性由 modal 强制不点选项不能关闭）
- 不加 phase 成员避免 schema/blueprint version bump
- 节点完成后自然回到 in-path，无状态机抖动

### 3.4 EventRequirement = MongoDB-like operator（不用字符串 DSL）

**决策**：`requires: { determination: { $gte: 2 } }`，operator 集 `$gte/$lte/$gt/$lt/$eq/$ne`。

**理由**：
- 视觉 / 规范 / 代码三方面均优于字符串 DSL
- TypeScript union 严格类型，无正则解析
- 同字段多 operator 天然 AND（`{ $gte: 2, $lt: 5 }`）
- 行业 well-known 模式
- phase 6+ 加 `weaponId / advancedJobId` 等 string 字段 check 时平滑扩展

**MVP 不引入 `$not / $or / $and / $in`** — 5 个事件用基础比较器够，真有需求再加。

### 3.5 决心扣减时机统一到结算瞬间

**决策**：扣减发生在 `combat:ended { wipe }` 处理时（BattleResultOverlay 弹之前），不再"重试按钮才扣"。

**理由**：
- 重试 / 放弃统一扣 = 强化 GDD §2.14 "沉没成本陷阱"语义（放弃也有重量）
- HUD 决心数即时更新，按钮文案不需带 cost
- 决心 == 0 退化按钮逻辑由扣后状态自然导出
- 配合 death window：DoT 翻盘胜不触发 combat:ended/wipe → 不扣 ✅

**配套修改**：GDD §2.14 表"放弃 0 cost" → "放弃也扣"，phase 5 末尾文档同步。

### 3.6 Death window 触发 = 玩家死亡（不限 kind）

**决策**：所有战斗（mob / elite / boss）玩家 hp ≤ 0 都进 death window；boss 死亡走原 phase 4 路径立刻结算。

**理由**：
- "中毒打远古龙"的 DoT 翻盘梗在所有战斗都成立（GDD §2.5.2 / §2.13 都不限定）
- 触发条件单一（玩家死亡）= 实施简洁，不需要 encounter yaml 标 `delayedResolution: true`
- 窗口长度 = `min(10s, 所有 player DoT 过期)`，无 DoT 时立刻结算（窗口实际 = 0），不影响小怪节奏

### 3.7 决心变化 interceptor hook = phase 5 预留 API

**决策**：`changeDetermination(intent)` 单一入口 + `interceptors[]` 数组（phase 5 永远空）。

**理由**：
- 接口成本极低（10 行代码 + 1-2 测试）
- 锁住"决心变化必须走单一入口"契约 — 避免未来策略卡 / buff / 成就加入时散落 `this.determination -= X` 绕过
- 真消费者（策略卡 phase 7+）出现时仅需 push interceptor，不用追猎散落代码

**示例（phase 7+ 拼死一搏策略卡）**:
```ts
interceptors.push((intent, current) => {
  if (intent.delta < 0 && Math.random() < 0.01) {
    return { delta: 0, cancelled: true, cancelReason: '光之战士的决心：拼死一搏触发！' }
  }
  return current
})
```

### 3.8 preserveOnDeath = 契约预留 hook（phase 5 无可见消费）

**决策**：建立 `clearDeathBuffs(entity)` hook，echo 标 `preserveOnDeath: true`，但 phase 5 跑不出与不写它有差别的 outcome。

**理由**：
- echo 在 boss 战 init 时挂、scene 销毁随之销毁；重试新挂 player entity buffs 空
- DoT 翻盘伤害靠 snapshot 已 freeze，不依赖 player.buffs 是否存活
- 但建立 hook 为未来 raise / 战斗内 respawn 接入做准备
- echo 标 true 的文档意义：标记"这是局内持久 buff，非普通 cooldown"

---

## 4. 状态机流转

### 4.1 BattleResultOverlay 按钮矩阵

| encounterKind | 决心 > 0 | 决心 == 0 |
|---|---|---|
| mob / elite | `[重试]` `[放弃（拿 50% 水晶低保）]` | `[进入结算]` |
| boss | `[重试]` `[放弃（整局结束）]` | `[进入结算]` |

```
in-combat (玩家死亡)
  → enterDeathWindow（不立即 emit combat:ended）
       │
       ├─ boss 死（DoT 翻盘）   → finalizeDeathWindow('victory') → 不扣决心 → in-path (节点 completed + 水晶)
       ├─ 时间窗口超时           → finalizeDeathWindow('wipe')
       ├─ 所有 player DoT 过期   → finalizeDeathWindow('wipe')
       │
       (wipe 路径)
       → changeDetermination({ source: '<kind>-wipe', delta: -<cost> })
       → 弹 BattleResultOverlay
              ├─ [重试]               → in-combat (gameKey++ 重挂)
              ├─ [放弃 mob/elite]     → in-path (节点 completed + 50% 水晶)
              ├─ [放弃 boss]          → ended
              └─ [进入结算 决心==0]   → ended
```

### 4.2 Event 节点流转

```
in-path → 玩家点 event 节点
  → NodeConfirmPanel（侦察免费，event 节点不收 1 水晶）
  → 玩家点 [进入]
  → tower store stays in 'in-path'
  → EventOptionPanel modal mount
       ├─ requires 不满足 → 选项 disabled + tooltip
       └─ 玩家点选项
            → applyOutcomes 数组按顺序原子应用（先扣后给）
              （决心变化走 changeDetermination interceptor 链）
            → modal close
            → 节点标 completed
            → in-path 继续
```

### 4.3 Echo condition 激活时序

```
玩家点 boss 节点 → NodeConfirmPanel
  → resolveCondition('echo-boss') 拿 scoutSummary
  → panel 显示"决心 ≤ 2 时获得超越之力 +25% 全属性"
  → 当前满足条件（决心 ≤ 2）→ 高亮"将立即触发"

玩家点 [进入]
  → tower store transitions 'in-combat'
  → EncounterRunner mount
  → scene init 完成（player.hp = baseMaxHp 满血）
  → 遍历 encounter yaml conditions 字段
  → activateEchoCondition(cond, scene, { determination })
       ├─ determination > threshold → noop
       └─ determination ≤ threshold → applyBuff(player, COMMON_BUFFS.echo, ...)
            → max_hp_modifier 生效 → maxHp ×1.25, hp 不动
            → 血条瞬间显示 80%
  → t = 0~3000ms：player.inCombat = false → idle regen tick
  → t = 3000ms：hp += 0.20 × maxHp → clamp 满血 ✅
  → t > 3000ms：玩家走向 boss / boss 放第一个 AOE → engageCombat → inCombat = true
```

---

## 5. 数据结构扩展

### 5.1 `src/tower/types.ts`

```ts
// 新增可选字段（不 bump SCHEMA_VERSION）
export interface TowerNode {
  // ...existing fields
  /** 事件节点开局固化的 event id；非事件节点 undefined */
  eventId?: string
}

// EventRequirement / EventOutcome / Event types
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
  // 未来扩展: weaponId?: StringComparator, advancedJobId?: StringComparator
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

// Determination interceptor types
export type DeterminationChangeIntent = {
  source: 'mob-wipe' | 'elite-wipe' | 'boss-wipe' | 'event' | 'campfire-offer' | string
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

### 5.2 `src/core/types.ts` BuffEffectDef 扩展

```ts
export type BuffEffectDef =
  | // ...existing
  | { type: 'attack_modifier'; value: number }   // base attack × (1 + sum)
  | { type: 'max_hp_modifier'; value: number }   // base maxHp × (1 + sum)
```

### 5.3 `src/entity/entity.ts` Entity 字段重构

```ts
export interface Entity {
  // ...existing
  baseAttack: number   // 新增（init 时 = opts.attack ?? 0；运行期不被 buff 修改）
  baseMaxHp: number    // 新增（init 时 = opts.hp ?? 0；运行期不被 buff 修改）
  /** @deprecated 保留字段仅用于 init / serialize 兼容；runtime 读取 attack 必须走 BuffSystem.getAttack(entity)，否则会绕过 attack_modifier 池。 */
  attack: number       // = baseAttack at init; never reassigned at runtime
  /** @deprecated 同 attack；runtime 读取 maxHp 必须走 BuffSystem.getMaxHp(entity)。 */
  maxHp: number        // = baseMaxHp at init; never reassigned at runtime
}

// helpers (in BuffSystem)
getAttack(entity: Entity): number {
  return entity.baseAttack * (1 + this.getAttackModifier(entity))
}
getMaxHp(entity: Entity): number {
  return entity.baseMaxHp * (1 + this.getMaxHpModifier(entity))
}
getAttackModifier(entity: Entity): number {
  return this.collectEffects(entity)
    .filter(e => e.effect.type === 'attack_modifier')
    .reduce((sum, e) => sum + e.effect.value, 0)
}
getMaxHpModifier(entity: Entity): number { /* 同 */ }
```

**消费点改造**:
- `buff-periodic.ts:buildPeriodicSnapshot`：`caster.attack` → `buffSystem.getAttack(caster)`
- `combat-resolver.ts` 普攻 / 技能伤害公式：所有 `entity.attack` 读取改 `getAttack`
- `entity.ts:createEntity`：init 时 `baseAttack = opts.attack ?? 0`，`baseMaxHp = opts.hp ?? 0`
- HUD HP 条 / damage floater / 任何展示 maxHp 的位置：改读 `getMaxHp` 派生值

### 5.4 `src/core/types.ts` BuffDef.preserveOnDeath（已有，phase 5 接 handler）

字段定义不变；新增消费点 `BuffSystem.clearDeathBuffs(entity)`（见 §7.2）。

### 5.5 `src/stores/tower.ts` TowerStore 扩展

```ts
// Pinia store 实例字段（非 reactive state、不进 TowerRun 持久化序列化）
interface TowerStoreInstance {
  /**
   * Phase 5 新增：玩家方决心变化拦截器链。
   * Phase 5 永远空数组；策略卡 / 系统 buff / 成就 (phase 7+) 真消费者出现时 push 注册。
   * 不持久化（每次 store 实例化为空），按需在 phase 6/7 设计跨局持久化方案。
   */
  interceptors: DeterminationInterceptor[]
}

// Death window state 由 battle-runner / GameScene 实例持有（生命周期与 scene 同步），不在 TowerStore，亦不进 TowerRun 序列化

// store actions
changeDetermination(intent: DeterminationChangeIntent): DeterminationChangeResult
applyEventOutcome(out: EventOutcome): void
onCombatWipe(encounterKind: 'mob' | 'elite' | 'boss', encounterId: string): void   // 替换 phase 4 的 deductDeterminationOnWipe
```

### 5.6 `public/tower/pools/battlefield-condition-pool.json`（新建）

```jsonc
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

### 5.7 `public/tower/pools/event-pool.json`（新建）

```jsonc
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

### 5.8 `public/tower/pools/encounter-pool.json` 扩容

phase 4 既有 5 个 mob entries 不动，追加：

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

---

## 6. UI 组件设计

### 6.1 `src/components/tower/EventOptionPanel.vue`（新建）

- modal 叠在 in-path 上（fixed inset full screen + 半透明遮罩）
- 渲染 `EventDef.title / description`
- 选项按钮列表：每个 button 显示 `label`，`requires` 不满足时 disabled + tooltip "缺少 X 水晶 / 决心"
- 点击触发 store action `applyEventOutcome` × 数组顺序
- 应用后 modal close，节点标 completed
- 不可关闭（必须做出决策）

### 6.2 `src/components/tower/NodeConfirmPanel.vue` 修整

- 移除 elite/boss `[进入]` disabled stub + "phase 5 实装"文案 → 启用按钮
- Boss 节点新增 "场地机制" 区块：从 yaml `conditions` 字段读 → resolver 拿 scoutSummary → 列表渲染
- 当前满足条件时高亮（如 echo `determination ≤ 2` 时）+ 提示文案"你的决心 = 2，将立即触发"

### 6.3 `src/components/hud/BattleResultOverlay.vue`（phase 4 重构）

按钮矩阵按 §4.1 实施。新增 prop `encounterKind`（区分 mob/elite/boss 决定按钮文案）+ 自动按 `tower.determination` 决定按钮组合。

### 6.4 `src/components/hud/DeathWindowVignette.vue`（新建）

- 全屏 fixed overlay（pointer-events: none）
- 监听 `player:died` 事件 → 显示 + CSS keyframes pulse
- 监听 `combat:ended` → 隐藏
- CSS: `box-shadow: inset 0 0 80px rgba(255,0,0,0.4)`, `@keyframes pulse 1s ease-in-out infinite alternate`

---

## 7. 战斗接入与 battle-runner 扩展

### 7.1 EncounterRunner 消费 conditions

`EncounterRunner.vue` mount 后、scene init 完成、`combat:started` 之前的窗口：

```ts
// in onMounted
const encounter = await loadEncounter(yamlPath)
await scene.init()
for (const condId of encounter.conditions ?? []) {
  const cond = await resolveCondition(condId)
  activateCondition(cond, scene, { determination: towerStore.determination })
}
```

`activateCondition` dispatcher：

```ts
function activateCondition(cond, scene, towerCtx) {
  switch (cond.kind) {
    case 'echo': return activateEchoCondition(cond, scene, towerCtx)
    // 未来：case 'electric_field': ...
  }
}

function activateEchoCondition(cond, scene, towerCtx) {
  if (towerCtx.determination > cond.params.determinationThreshold) return
  scene.combatSystem.applyBuff(scene.player, COMMON_BUFFS.echo, scene.player, scene.gameTime)
}
```

### 7.2 battle-runner death window 改造

替换 `battle-runner.ts:273-279` 玩家死亡分支：

```ts
// 当前：直接 emit combat:ended wipe
// 改为：进 death window
if (payload.target.id === s.player.id && payload.target.hp <= 0) {
  if (!s.battleOver && !s.deathWindow) {
    enterDeathWindow()
  }
}

function enterDeathWindow() {
  s.deathWindow = { startedAt: gameTime, deadline: gameTime + DEATH_WINDOW_MS }
  s.bus.emit('player:died', { gameTime })
  buffSystem.clearDeathBuffs(s.player)   // §7.3 hook
  // boss timeline / AI / DoT tick 继续跑
}

// 加入主循环
function tickDeathWindow(gameTime: number) {
  if (!s.deathWindow) return
  if (boss.hp <= 0) return finalizeDeathWindow('victory')
  if (gameTime >= s.deathWindow.deadline) return finalizeDeathWindow('wipe')
  const hasActivePlayerDot = boss.buffs.some(b =>
    b.periodic?.effectType === 'dot' && b.periodic.sourceCasterId === s.player.id
  )
  if (!hasActivePlayerDot) return finalizeDeathWindow('wipe')
}

function finalizeDeathWindow(result: 'victory' | 'wipe') {
  scriptRunner.disposeAll()
  s.bus.emit('combat:ended', { result, elapsed: scheduler.combatElapsed })
  s.endBattle(result)
  s.deathWindow = null
}
```

**boss 死亡分支不变**（仍走原路径立即 `combat:ended { victory }`）。

### 7.3 BuffSystem 新方法

```ts
// src/combat/buff.ts
clearDeathBuffs(entity: Entity): void {
  entity.buffs = entity.buffs.filter(inst => {
    const def = this.defMap.get(inst.defId)
    return def?.preserveOnDeath === true
  })
}

getAttackModifier(entity: Entity): number {
  return this.collectEffects(entity)
    .filter(e => e.effect.type === 'attack_modifier')
    .reduce((sum, e) => sum + (e.effect as any).value, 0)
}

getMaxHpModifier(entity: Entity): number { /* 同 */ }

getAttack(entity: Entity): number {
  return entity.baseAttack * (1 + this.getAttackModifier(entity))
}

getMaxHp(entity: Entity): number {
  return entity.baseMaxHp * (1 + this.getMaxHpModifier(entity))
}
```

**注意**：apply / remove 时 maxHp 重算后，**hp 不动** (FF14 严谨派)；唯独 remove 时 `hp > newMaxHp` 截断到 newMaxHp（避免 overflow）。

---

## 8. 测试策略

### 8.1 Pool resolver（3 套）

每个 pool 一组：
- `loadXxxPool()` 缓存命中 / 缺失 manifest 抛错
- `resolveXxx(id)` Registry 命中 / fallback 命中 + console.error / fallback 也缺失抛 hard error
- `pickXxxIdFromActivePool(seed, ...)` deterministic by seed / 排除 deprecated / active 为空抛错
- `_resetXxxPoolCache()` helper

### 8.2 Battlefield condition

- `activateEchoCondition` 单测：决心 > / == / < threshold 三档分支
- `attack_modifier` / `max_hp_modifier` 单测：
  - `getAttack(entity)` 返回 `baseAttack × (1 + sum)`
  - DoT snapshot 冻结后 echo remove 不影响已快照值
  - `getMaxHp(entity)` 返回 `baseMaxHp × (1 + sum)`
  - apply 时 hp 不动
  - remove 时 hp 截断（仅当 hp > newMaxHp 时）
- 集成测：boss yaml 含 `conditions: ["echo-boss"]` + 决心 = 2 → mount 后 player.buffs 包含 echo + 三 effect 都生效

### 8.3 Event runtime

- yaml 解析单测（5 个 events 各一）
- `evaluateRequirement` 单测：6 种 comparator 真假分支 + 多 comparator AND
- `applyEventOutcome` 单测：crystals/determination 加减 + clamp 边界
- EventOptionPanel 集成测：requires 不满足 disabled / 点击 outcome 应用 + 节点 completed

### 8.4 决心扣减重构 (4.1)

- mob/elite wipe → 扣 -1，决心 0 时按钮退化 [进入结算]
- boss wipe → 扣 -2，[放弃] 文案 = "整局结束"
- 扣减时机：`combat:ended { wipe }` 触发后 BattleResultOverlay 渲染前完成

### 8.5 Death window (4.2)

- 玩家 hp = 0 → `enterDeathWindow` 触发 + 不立即 emit `combat:ended`
- 窗口期内 boss 被 player DoT 打死 → `finalizeDeathWindow('victory')` + 不扣决心
- 窗口超时 → `finalizeDeathWindow('wipe')` + 扣决心
- 所有 player DoT 过期 → 提前 `finalizeDeathWindow('wipe')`
- boss invul 期 DoT 跳过（既有 `buff-periodic.ts:132` 兜住）+ 集成测：death window 内 boss 上天 → DoT 失效 → 超时判负

### 8.6 preserveOnDeath hook (4.3)

- `clearDeathBuffs(entity)` 单测：保留 `preserveOnDeath: true`，移除 false / undefined
- 集成：echo 标 true → death window 内 player.buffs 仍含 echo

### 8.7 Determination interceptor (4.4)

- 空 interceptors → pass-through（行为完全等同 phase 4）
- 单 interceptor 改 delta → 修改后值生效
- interceptor cancel → determination 不变
- 多 interceptor 链式 / cancel 立即终止链

---

## 9. 迁移与兼容

### 9.1 版本号 bump 决策

| 字段 | 操作 |
|---|---|
| `TOWER_RUN_SCHEMA_VERSION` | **不 bump**（仅加可选字段 `TowerNode.eventId?`） |
| `TOWER_BLUEPRINT_CURRENT` | **不 bump**（不加 NodeKind / 不改 K_SCHEDULE / 图算法） |
| `TOWER_BLUEPRINT_MIN_SUPPORTED` | **不 bump** |
| Pool 内容（condition / event / encounter 扩容） | **改 manifest**，按宪法 §2 不 bump 任何版本 |
| `BuffEffectDef` union 加 `attack_modifier` / `max_hp_modifier` | **不 bump**（buff 实例只存 defId，不直接序列化 effect） |

### 9.2 GDD 文档同步

GDD `docs/brainstorm/2026-04-17-rougelike.md` §2.14 表格当前描述：

> 小怪/精英失败（选放弃）| 0 | 节点标记"已通过"，获得放弃低保

phase 5 改为：

> 小怪/精英失败（选放弃）| -1 ❤️ | 节点标记"已通过"，获得放弃低保（决心扣减时机统一到结算窗弹出瞬间，重试 / 放弃同档）

实施计划末尾需修订该表 + §2.14 散落"重试 -1"描述。

### 9.3 现有 phase 4 行为保留

- 现有 5 个 mob YAML 不动
- 现有 phase 4 决心扣减点 (`deductDeterminationOnWipe`) 由 `onCombatWipe(kind, ...)` + `changeDetermination(intent)` 内部封装替换；测试覆盖确保 mob 战行为不变
- Encounter pool / blueprint version / 侦察缓存全部不动

### 9.4 新增 entity baseAttack / baseMaxHp 兼容

- `createEntity` init 时 `baseAttack = opts.attack ?? 0`、`baseMaxHp = opts.hp ?? 0`
- `entity.attack` / `entity.maxHp` 字段保留为 init 值（无 modifier 时 base = derived）
- 现有所有读取改走 `BuffSystem.getAttack/getMaxHp`；测试覆盖确保无 modifier 时数值不变

---

## 10. Phase 5 不回答的 Open Questions（留给后续 phase）

- Echo buff 视觉补血是否需要（FF14 战栗模式 instant_heal_pct 第二条款）— 调优期决定
- Echo 翻译损失（"全属性 +25%"实际只覆盖攻防血，未含暴击 / 技速 / mp 等）的体感差距是否可接受 — playtest 决定
- Boss 战放弃的 UI 强提示设计（防误点）— 实施阶段酌情加二次确认
- Death window 内屏幕红毛边的具体动画曲线 / 频率 — 实施 polish
- Event modal 关闭动画 / 选项 hover tooltip 细节 — 实施 polish
- Boss timeline `enrage` 技能的具体 potency 数值 + 阶段切换 invul 时长 — 实施时按 phase 4 数值档位调

---

## 11. 文件改动清单

### 新建

```
docs/tower-deferred-backlog.md                                  # 跨 phase 延后项总账
public/tower/pools/battlefield-condition-pool.json
public/tower/pools/event-pool.json
public/encounters/tower/elite-fortune-trial.yaml
public/encounters/tower/elite-aoe-marathon.yaml
public/encounters/tower/boss-tower-warden.yaml
public/tower/events/healing-oasis.yaml
public/tower/events/pilgrim-trade.yaml
public/tower/events/battle-trap.yaml
public/tower/events/training-dummy.yaml
public/tower/events/mystic-stele.yaml
public/tower/events/event-fallback.yaml                         # Registry 必备 fallback（id 'event-fallback' 永不进 Active Pool）
src/tower/pools/battlefield-condition-pool.ts
src/tower/pools/battlefield-condition-pool.test.ts
src/tower/pools/event-pool.ts
src/tower/pools/event-pool.test.ts
src/tower/conditions/echo.ts                                    # activateEchoCondition + dispatcher
src/tower/conditions/echo.test.ts
src/tower/events/event-loader.ts                                # yaml → EventDef
src/tower/events/event-loader.test.ts
src/tower/events/event-evaluator.ts                             # evaluateRequirement
src/tower/events/event-evaluator.test.ts
src/components/tower/EventOptionPanel.vue
src/components/tower/EventOptionPanel.test.ts
src/components/hud/DeathWindowVignette.vue
src/demo/common-buffs/echo.ts                                   # COMMON_BUFFS.echo 定义
```

### 改动

```
docs/brainstorm/2026-04-17-rougelike.md                         # §2.14 表 sync (放弃也扣决心)
public/tower/pools/encounter-pool.json                          # +2 elite +1 boss entries
src/tower/types.ts                                              # +TowerNode.eventId? +EventDef +DeterminationInterceptor types
src/core/types.ts                                               # BuffEffectDef +attack_modifier +max_hp_modifier
src/entity/entity.ts                                            # +baseAttack +baseMaxHp; createEntity init
src/combat/buff.ts                                              # +clearDeathBuffs +getAttackModifier +getMaxHpModifier +getAttack +getMaxHp
src/combat/buff-periodic.ts                                     # buildPeriodicSnapshot 改读 getAttack
src/game/combat-resolver.ts                                     # 普攻 / 技能伤害改读 getAttack
src/game/battle-runner.ts                                       # death window enter/tick/finalize; 玩家死亡分支重构
src/stores/tower.ts                                             # changeDetermination, applyEventOutcome, onCombatWipe, interceptors
src/components/tower/NodeConfirmPanel.vue                       # 移除 elite/boss disabled; 显示场地机制
src/components/tower/EncounterRunner.vue                        # mount 后激活 conditions
src/components/hud/BattleResultOverlay.vue                      # 按钮矩阵重构（phase 4 既有）
src/pages/tower/index.vue                                       # event 节点点击 → EventOptionPanel modal; DeathWindowVignette 挂载
src/config/schema.ts                                            # EncounterDef.conditions?: string[]
src/game/encounter-loader.ts                                    # 解析 conditions 字段
```

### 测试改动

- `src/combat/buff.test.ts` — clearDeathBuffs / getAttack/MaxHp 系列
- `src/combat/buff-periodic.test.ts` — snapshot 改读 getAttack 后 echo 加成生效（保持现有测试通过 + 新加 echo case）
- `src/stores/tower.test.ts` — changeDetermination / interceptor / onCombatWipe / applyEventOutcome
- `src/game/battle-runner.test.ts` — death window 三种结束条件
- 各新建文件配套 `.test.ts`

---

## 12. 工程契约速查（钉在项目脑门上的规则）

phase 5 新加 / 强化的工程契约（与宪法 §11 同步）：

1. **决心变化必须走 `changeDetermination(intent)`**，禁止散落 `this.determination -= X`。违反 = 未来 interceptor 无法拦截 = 策略卡 / 系统 buff 接入时回头大重构。
2. **场地机制挂载 = encounter yaml inline 声明 condition id**；condition def 进 pool。改 condition 核心效果 = 新 id（宪法 §2）。
3. **Death window 触发 = 玩家 hp ≤ 0**（不限 encounter kind）。窗口结束 = boss 死 / 时间到 / 所有 player DoT 过期，三选一。窗口期间引擎层不 emit `combat:ended`。
4. **`max_hp_modifier` 严格不补偿当前 hp**（FF14 严谨派）。需要 "加血上限同时回血" 必须显式叠 `instant_heal` 第二条款。
5. **`attack` / `maxHp` 字段读取**统一走 `BuffSystem.getAttack(entity)` / `getMaxHp(entity)` —— 不许直接读 `entity.attack` / `entity.maxHp`（会绕过 modifier 累加）。
6. **Event outcome MVP 仅 `crystals` / `determination` 两 kind**。新增 outcome kind 必须先 review 是否依赖未实现系统（魔晶石 / 武器 / 局外持续 buff 等），不 review 直接加会造成 runtime 缺位。
7. **EventRequirement 用 MongoDB-like operator**，禁止字符串 DSL；新增 operator 加 union 成员 + 在 evaluator 处理。
8. **Phase 5 `interceptors` 数组永远空**，但入口 API (`changeDetermination`) 必须建好。phase 6/7 加策略卡时只 push interceptor，不改 API。

---

> 本 spec 通过后 → 进 `superpowers:writing-plans` 生成实施计划 → 新分支 `feat/tower-p5-elite-boss-events` 施工。
