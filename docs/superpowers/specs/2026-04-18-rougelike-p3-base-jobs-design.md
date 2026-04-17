# Rougelike Tower — Phase 3 (Base Jobs & Job Selection UI) 设计

> Scope：为爬塔肉鸽模式实装 **3 个基础职业**（剑术师 / 弓箭手 / 咒术师）、**真正的职业选择流程**、**no-run 存档感知入口**，以及所需的**战斗引擎 periodic-effect 基础设施**（DoT / HoT / MP regen 统一 tick framework + `next_cast_instant` cast hook）。phase3 完成后，玩家能在 `/tower` 的 no-run 阶段看到存档摘要并继续或开新局；无存档时点"新游戏"进入职业选择画面，从 3 张卡片里挑选基础职业开始下潜，并在后续节点战斗中打出各基础职业的完整技能循环。

## 1. Spec Reference

- GDD：`docs/brainstorm/2026-04-17-rougelike.md` §1.3（低技术下限原则）/ §2.11（职业系统）/ §7.1（MVP 必做）/ §7.4（技术架构原则）
- 数值平衡规范：`docs/job-balance.md`
- Phase 1 / 2 产物：
  - `src/tower/types.ts` — `TowerRun` / `TowerRunPhase` / `BaseJobId`
  - `src/stores/tower.ts` — `useTowerStore`
  - `src/pages/tower/index.vue`
  - `src/tower/graph/*`（phase 2 的图生成，phase 3 不改）
- 现有 job 范式：`src/jobs/{warrior, bard, black-mage, ...}`
- 现有战斗引擎：`src/combat/{buff.ts, damage.ts}` / `src/core/types.ts`

---

## 2. Scope

### IN（phase 3 必做）

- **三个基础职业实现**（新建 `src/jobs/{swordsman, archer, thaumaturge}/`）
  - 走现有 `PlayerJob` 接口，加入 `src/jobs/index.ts` 的 `JOBS` 数组（与 6 个进阶 job 平级，不分注册表）
  - colocated `*.test.ts`（数值健康 + 核心技能行为）
- **新增 caster role skill**：`ROLE_LUCID_DREAMING`（醒梦）放 `src/jobs/commons/role-skills.ts`
- **战斗引擎 periodic-effect framework**（统一处理 `dot` / `hot` / `mp_regen`）：
  - initial tick on apply
  - 默认 3s 周期（由 buff effect.interval 决定，实际设计全部用 3000ms）
  - 快照机制：apply 瞬间记录施加者攻击 + damage_increase 汇总 + 目标防御
  - 基于 game loop `gameTime` 驱动，**不用 setInterval**
  - 覆盖刷新 / 过期 / 驱散语义
  - 新增 `src/combat/buff-periodic.ts`（或在 `buff.ts` 扩展，实现侧择优）
  - 新增 colocated `buff-periodic.test.ts`
- **`BuffEffectDef` 扩展**（`src/core/types.ts`）：追加 `mp_regen` / `next_cast_instant`
- **`next_cast_instant` cast flow hook**：修改 cast 启动路径，在 caster buff 中查找 `next_cast_instant` effect，命中则 castTime 归 0 + 可选 consume
- **`TowerRunPhase` 改名 + 新增**（`src/tower/types.ts`）：
  - 旧 `selecting-job`（原义 pre-descent lobby）→ 改名 `ready-to-descend`
  - `selecting-job`（新义 "正在选职业"）重新引入
  - union 整体：`'no-run' | 'selecting-job' | 'ready-to-descend' | 'in-path' | 'in-combat' | 'ended'`
- **Store 扩展**（`src/stores/tower.ts`）：
  - 新增 action `enterJobPicker()`：set phase → `'selecting-job'`，不创建 run
  - `startNewRun(baseJobId)` 改设 phase → `'ready-to-descend'`（名字对齐新语义）
  - `hydrate()` 读取 run 数据到 `run.value`（即使 phase 仍为 `'no-run'`），供 UI 存档摘要消费
  - `continueLastRun()` 从 `run.towerGraph.nodes` 非空与否**推断**恢复的 phase（非空 → `'in-path'`；空 → `'ready-to-descend'`）；不 bump schemaVersion
- **no-run 存档感知 UI**（`src/pages/tower/index.vue`）：
  - 无存档：沿用当前 "新游戏 / 教程 / 返回" 布局；"新游戏" 改调 `tower.enterJobPicker()` 而非 `startNewRun('swordsman')`
  - 有存档：显示存档摘要卡片（职业 / 等级 / 水晶 / 开始时间）+ [继续] [放弃并结算] [返回主菜单]（**不显示"教程"**）
  - "放弃并结算" 触发二次确认对话；确认后 `resetRun()`
- **二次确认对话组件**（新建 `src/components/common/ConfirmDialog.vue`）
- **职业选择 UI**（`selecting-job` phase 下渲染，新建 `src/components/tower/JobPicker.vue` + `JobPickerCard.vue`）：
  - 3 张横排卡片 + 返回按钮
  - 卡片显示：职业名 / 类别 label / description / 技能预览（前 3 个 skill 名）
  - 点击卡片 → `tower.startNewRun(job.id)` → phase 跳到 `'ready-to-descend'`

### OUT（phase 3 不做，后续 phase 承接）

- 6 个进阶 job 新增（复用现有）
- 武器系统 & 武器切换触发 job 转换 —— **phase 6**
- 第 0 节点随机武器 + 3 选 1 策略卡 —— **phase 6**
- 魔晶石词条配装 —— **phase 6**
- 结算系统（金币 / 抽卡 / 定轨券等局外产物）——"放弃并结算" 按钮 phase 3 仅 `resetRun()`，结算逻辑留 `TODO(phase 6)` 注释
- 教程塔 hand-crafted graph —— **phase 7**
- 决心 runtime、超越之力场地机制 —— **phase 5**
- 战斗节点确认弹窗 / 侦察 / 进战斗 —— **phase 4**
- 新技能 / buff 的 icon 素材（由用户手工补；本 phase 新增的 `SkillDef` / `BuffDef` 定义里 `icon` 字段一律留空）
- 职业选择 UI 的视觉细节（spacing / 动效 / 键盘导航）—— 按默认风格写骨架，在 dev server 目视后迭代，不阻塞 phase 3 merge

---

## 3. 关键设计决策

### 3.1 基础职业复用 `PlayerJob` 接口，加入 `JOBS`

基础职业与进阶 job **共用同一注册表**（`src/jobs/index.ts` 的 `JOBS` 数组）与同一类型（`PlayerJob`）。差异仅通过 `BaseJobId` union 在持久化层（`TowerRun.baseJobId`）收窄。

理由：
- 战斗引擎 / HUD / skill panel / skill bar 一律消费 `PlayerJob`，零改动接入
- base vs advanced 的语义差异只存在于 tower 爬塔流程中（第 0 节点起始 job、武器切换进阶），不需要 runtime 隔离
- GDD §2.11 已明示"武器与基础职业无强制映射"，不强行约束就是最简

### 3.2 基础职业数值显著弱于进阶

玩家**单用基础职业**（不切武器进阶）应该过不了 Boss。实现手段：
- HP / ATK 档位明显低于进阶（HP 6500-7500 vs 进阶 8000-10000；ATK 700-1000 vs 进阶 1000-1200）
- 技能数量严格 1-3（对齐 GDD §2.11 "技能 1-3 个"）
- 无 combo finisher / 无多阶段循环
- DPM 落在 ~0.70-0.90× baseline，低于进阶 job 的 ~1.0-1.15×

"111 平 A 也能通关" 的 GDD §1.3 承诺 **不适用于基础职业自身**，仅适用于"剑术师拾取战士武器后的战士状态"—— 基础职业是新手起步缓冲，进阶 job 才是核心游戏体验。

### 3.3 Periodic-effect tick framework 统一处理 `dot` / `hot` / `mp_regen`

`dot` / `hot` 在 `BuffEffectDef` union 里定义已久，但 `src/combat/buff.ts` 的 effect dispatch **没有 runtime 实装**（仅 tooltip 层识别）。phase 3 从零实装统一的 periodic tick，三者语义对齐：

**共同约束**：
- `interval` 默认 3000ms，由 buff effect 的 `interval` 字段读取
- **无 initial tick**：apply 瞬间仅记 snapshot + 设 `nextTickAt = applyAt + interval`；不立即 fire
- 末 tick 包含：若 `nextTickAt === expireAt`（精确对齐）则 fire 后再 expire（inclusive end）
- Tick 总数 = `floor(duration / interval)`（18s/3s = 6 tick；21s/3s = 7 tick；30s/3s = 10 tick）
- Apply 时 snapshot 只冻结 **caster 端** 的 `attack` + `casterIncreases` + `potency`（mp_regen 额外冻结 `targetMaxMp`）；**target 端 mitigation / vulnerability 在 tick 时 live 读取**
- 每帧 `gameTime >= nextTickAt && nextTickAt <= expireAt` 触发 fire；fire 后 `nextTickAt += interval`；用 `while` 循环追赶掉帧
- 同 buffId 在未过期时再次 apply 视为**覆盖刷新**：旧实例直接摘除（**不 fire pending tick**，即**无续毒补偿**）；新实例重新 snapshot + `nextTickAt = newApplyAt + interval`
- buff 过期 / 被驱散 / entity 死亡（非施加者死亡）→ 摘除实例；无 timer handle 残留
- 施加者死亡不中断 DoT tick（buff 仍在 target 上，tick 继续用 snapshot 的 caster 端数据；target 端 mitigation / vulnerability 随 target 身上当前状态变化）

**为什么默认不做"续毒补偿"（refresh-fires-pending-tick）**：补偿机制会引入"每 GCD 续毒 vs 自然过期再续"的 degenerate 玩法分析负担 —— 若未来某位设计师做了一个"潜力 + 小 DoT"复合 GCD 技能，不评估就让玩家能靠 spam 续毒额外榨出 ~5-6% DPS，修起来要回炉所有技能数值。Phase 3 选择保守默认：覆盖刷新时 pending tick 直接抛弃，损失约 2% DPM 但设计安全。未来若确有职业需要"积极续毒奖励"玩法，走 `BuffDef.refreshFiresPendingTick?: boolean` opt-in（本 phase 不实装，留给实际有需要时设计）。

**为什么 snapshot 只冻结 caster 端，target 端 live**（FF14 常规认知）：
- Caster 端（攻击 / damage_increase）经常是"爆发窗口短 cd + 施加者主动操作"的产物，冻结能让"开 buff 后上 DoT 吃满窗口"成为策略
- Target 端（mitigation / vulnerability）是防御方主动操作，live 读取让"吃 DoT 后开减伤" / "上 vuln 后被打加伤"立刻生效，防御方有操作空间
- 与 `calculateDamage` 既有模型严格对齐，vulnerability 与 caster damage_increase 同在加算池（`increases: [...casterIncreases, vulnerability]`），mitigation 乘算

**`next_cast_instant` 独立 hook**：
- 不走 periodic tick framework
- 在 cast start 前扫 caster 身上 `next_cast_instant` buff；命中则 `castTime = 0`
- `consumeOnCast: true` 时施法 resolve 后摘除该 buff
- 与技能自带 `castTimeWithBuff` 互斥：技能侧 hit 优先；否则查 buff 侧

### 3.4 状态机改名 + no-run 存档感知 + phase 推断

**`TowerRunPhase` 改名** 让语义与代码可读性对齐：
- 旧 `selecting-job` 实际行为是 "run 已创建，pre-descent lobby"，名字误导
- 新 `selecting-job` = "玩家正在卡片界面选职业，无 run"
- 新 `ready-to-descend` = "run 已落盘，准备下潜"（旧 `selecting-job` 改名而来）

**状态机**：
```
no-run ──[无存档]点"新游戏"──► selecting-job ──选卡片触发 startNewRun(id)──► ready-to-descend ──startDescent()──► in-path → in-combat → ended
  ▲                                 │                                         │                                    │
  │                                 └── "返回" ────────────────────────────► no-run                                │
  │                                                                                                                 │
  └──[有存档]──默认显示摘要─┬─ "继续" ──continueLastRun()── 推断 phase (ready-to-descend / in-path) ─────────────────┘
                           └─ "放弃并结算" ─二次确认─► resetRun() ► no-run (无存档)
```

**Phase 推断逻辑**（避免 bump schemaVersion）：
- `continueLastRun()` load run 后：若 `Object.keys(run.towerGraph.nodes).length === 0` → 恢复 `'ready-to-descend'`；否则 `'in-path'`
- `'in-combat'` 不会被持久化进 phase 推断范围（战斗中关闭 tab 按 in-path 恢复，由 phase 4/5 战斗接入时再治理）

**不 bump `TOWER_RUN_SCHEMA_VERSION`**：`TowerRun` 数据 shape 不变，`TowerRunPhase` 不在持久化 payload 里。

### 3.5 图标由用户后补

新增的 `SkillDef` / `BuffDef` 定义**一律不写 `icon` 字段**。现有共享 role skill（`ROLE_DASH` / `ROLE_SECOND_WIND` 等）保留自带 icon；若基础职业复用任何现有 skill 则继承其 icon。用户在 merge 前手工补新 icon。

---

## 4. 职业设计与数值

基础数值参照 `docs/job-balance.md`（reference baseline: Adventurer ATK 1000, 60s theoretical 68,000, measured baseline 54,400 DPS-based）。

### 4.1 剑术师 Swordsman

**定位**：物理近战 / 低 ATK / 高 HP（保命简单）/ 1 GCD + 1 oGCD / 目标 DPM ~0.70-0.75×

**stats**：
| 字段 | 值 |
|------|-----|
| id | `swordsman` |
| name | 剑术师 |
| category | `JobCategory.Melee` |
| HP | 7500 |
| MP | 10000 |
| ATK | 700 |
| speed | 5 |
| autoAttackRange | 3.5 |
| gcdDuration | 2500 |
| autoAttackSkill | `MELEE_AUTO` |
| autoAttackInterval | 3000 |

**技能栏**：
| 槽位 | id | 名称 | 类型 | 数值 |
|------|-----|------|------|------|
| 1 | `swm_heavy_slash` | 重斩 | weaponskill (GCD) | potency 1.5, range 4, mpCost 0, 无 cd |
| 2 | `swm_guard` | 架式 | ability (oGCD) | cd 30000, apply buff `swm_guard` |
| — | `ROLE_SECOND_WIND` | 内丹（现有共享 role skill，skillBar 末位） | — |
| Q | `ROLE_DASH` | 突进（现有） | — |
| E | `ROLE_BACKSTEP` | 后跳（现有） | — |

**新增 buff**：
- `swm_guard`：duration 8000ms, stackable false, effects `[{ type: 'damage_increase', value: 0.20 }]`

**description**（`PlayerJob.description`）：
> 以单手剑战斗的新晋冒险者。重斩是你唯一的主动输出手段，搭配架式的短暂爆发窗口就能完成循环。攻防均衡，适合新手。

**DPM 核验**（ATK 700）：
- auto: 20 × 700 × 1.0 = 14,000
- 重斩: 24 × 700 × 1.5 = 25,200
- 架式覆盖率 8s/30s = 27% × 20% 加成 × (auto + 重斩) ≈ 2,117
- **合计 ~41,317 = 0.76× baseline** ✓

### 4.2 弓箭手 Archer

**定位**：物理远程 / HP 低 / ATK 中 / 机动强（AA range 10 即天然风筝）/ 2 GCD + 1 oGCD / 目标 DPM ~0.78-0.82×

**stats**：
| 字段 | 值 |
|------|-----|
| id | `archer` |
| name | 弓箭手 |
| category | `JobCategory.PhysRanged` |
| HP | 6500 |
| MP | 10000 |
| ATK | 900 |
| speed | 5 |
| autoAttackRange | 10 |
| gcdDuration | 2500 |
| autoAttackSkill | `PHYS_RANGED_AUTO` |
| autoAttackInterval | 3000 |

**技能栏**：
| 槽位 | id | 名称 | 类型 | 数值 |
|------|-----|------|------|------|
| 1 | `arc_heavy_shot` | 强力射击 | weaponskill (GCD) | potency 1.3, range 12, mpCost 0 |
| 2 | `arc_venom_shot` | 毒药箭 | weaponskill (GCD) | potency 0.3 instant, range 12, apply buff `arc_venom` |
| 3 | `arc_barrage` | 强化 | ability (oGCD) | cd 30000, apply buff `arc_barrage` |
| — | `ROLE_SECOND_WIND` | 内丹（现有） | — |
| Q | `ROLE_DASH_FORWARD` | 前冲（现有） | — |
| E | `ROLE_BACKSTEP` | 后跳（现有） | — |

**新增 buff**：
- `arc_venom`：debuff on target, duration 18000ms, stackable false, effects `[{ type: 'dot', potency: 0.3, interval: 3000 }]`
- `arc_barrage`：buff on caster, duration 6000ms, effects `[{ type: 'damage_increase', value: 0.30 }]`

**description**：
> 以弓矢远程狙击的猎人。强力射击是稳定输出，毒药箭让敌人持续流血，强化爆发窗口内能打出爆炸伤害。机动性强，善于风筝走打。

**DPM 核验**（ATK 900）：
- auto: 20 × 900 × 0.5 = 9,000
- 主 GCD（强射）~22.7/60s × 900 × 1.3 = 26,559（毒箭占 ~1.3 GCD）
- 毒箭 instant: 0.3 potency × 3.3 次 × 900 = 891
- 毒箭 DoT tick: ~20 tick × 900 × 0.3 = 5,400
- 强化覆盖率 6s/30s = 20% × 30% 加成 on GCD 伤害：(26,559 + 891 + 5,400) × 0.06 = 1,970
- **合计 ~43,820 = 0.81× baseline** ✓

### 4.3 咒术师 Thaumaturge

**定位**：魔法远程 / HP 中 / ATK 高 / 读条爆发 / 2 GCD + 1 oGCD + 1 role oGCD / 目标 DPM ~0.85-0.90×

**stats**：
| 字段 | 值 |
|------|-----|
| id | `thaumaturge` |
| name | 咒术师 |
| category | `JobCategory.Caster` |
| HP | 6500 |
| MP | 10000 |
| ATK | 1000 |
| speed | 5 |
| autoAttackRange | 3.5（`CASTER_AUTO` 的 range；spell 自身 range 20 由技能 def 承载，与 stats 字段独立） |
| gcdDuration | 2500 |
| autoAttackSkill | `CASTER_AUTO` |
| autoAttackInterval | 3000 |
| noMpRegen | false（默认自然回 MP） |

**技能栏**：
| 槽位 | id | 名称 | 类型 | 数值 |
|------|-----|------|------|------|
| 1 | `thm_stone` | 辉石魔砾 | spell (GCD 读条) | castTime 2000, potency 2.0, range 20, mpCost 400 |
| 2 | `thm_cure` | 治疗 | spell (GCD 读条) | castTime 2000, heal potency 5, targetType single, requiresTarget false（self heal）, mpCost 2400 |
| 3 | `thm_swiftcast` | 即刻咏唱 | ability (oGCD) | cd 40000, apply buff `thm_swiftcast_ready` |
| — | `ROLE_LUCID_DREAMING` | 醒梦（**新增共享** role skill，skillBar 末位挂载） | — |
| Q | `ROLE_DASH` | 突进（现有） | — |
| E | `ROLE_BACKSTEP` | 后跳（现有） | — |

**新增 buff**：
- `thm_swiftcast_ready`：duration 10000ms, stackable false, effects `[{ type: 'next_cast_instant', consumeOnCast: true }]`
- `lucid_dreaming`：duration 21000ms, stackable false, effects `[{ type: 'mp_regen', potency: 0.05, interval: 3000 }]`（21s / 3s = 7 次 tick × 5% = 35% max MP 回复）

**description**：
> 以魔法杖吟唱咒文的学徒。辉石魔砾是慢读条高伤害的主输出，治疗能应急自救，即刻咏唱让你在机动战中抢一个瞬发窗口。身板脆弱，走位是生存关键。

**DPM 核验**（ATK 1000, potency 2.0, 假设 60s 内 2 次治疗）：
- auto: 20 × 1000 × 0.05 = 1,000
- 辉石魔砾：~22 次 × 1000 × 2.0 = 44,000
- 即刻咏唱节省读条：每 40s 约省 2s 读条（约 +0.8 次 stone） × 1.5 次/60s ≈ 2 次 × 2,000 = 2,400
- **合计 ~47,400 = 0.87× baseline** ✓

**MP 循环核验**（60s）：
- 消耗：22 stone × 400 + 2 cure × 2400 = 13,600 MP
- 自然回复 + 醒梦：12,000 + 3,500 ≈ 15,500 MP
- 结余 ~1,900 MP —— 紧张但足够 1 次额外 cure

### 4.4 新增共享 Role Skill：醒梦

放 `src/jobs/commons/role-skills.ts`：

```ts
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

**挂载策略**：phase 3 仅咒术师 skillBar 挂载；进阶 caster job（黑魔法师）保持现状不挂（其 `noMpRegen: true` + 冰火循环是刻意设计，挂醒梦会破坏 MP 管理风味）。`lucid_dreaming` buff 的定义放 `src/jobs/commons/buffs.ts` 的 `COMMON_BUFFS`（供所有 caster 共用引用）。

---

## 5. 战斗引擎扩展

### 5.1 `BuffEffectDef` union 扩展（`src/core/types.ts`）

```ts
export type BuffEffectDef =
  // ... 现有条目
  | { type: 'mp_regen'; potency: number; interval: number }
  | { type: 'next_cast_instant'; consumeOnCast: boolean }
```

### 5.2 Periodic-effect tick framework

**定位**：统一处理 `dot` / `hot` / `mp_regen` 三种 periodic buff effect 的 tick 调度与结算。

**实现位置**：优先拆出 `src/combat/buff-periodic.ts`；若 `buff.ts` 扩展更简洁可合并。设计时机由 implementer 权衡。

**BuffInstance 扩展字段**（对含 periodic effect 的 buff 实例）：
```ts
interface BuffInstance {
  // ... 现有字段
  /** periodic effect 的调度与快照；普通 buff 为 undefined */
  periodic?: {
    /** 下一次 tick 的游戏内时间戳（ms） */
    nextTickAt: number
    /** tick 周期，从 buff 的 periodic effect `.interval` 字段拷贝到此处便于调度（apply 时写入） */
    interval: number
    /** 消费 tick 时按 kind 分派到具体作用 */
    effectType: 'dot' | 'hot' | 'mp_regen'
    /**
     * 仅快照**施加者端**不可 live 的数据；target 端（mitigation / vulnerability）tick 时 live 读取.
     * 字段语义随 effectType 有轻微差异：
     * - dot / hot: 使用 attack + casterIncreases + potency，走 calculateDamage pipeline
     * - mp_regen: 只使用 targetMaxMp + potency（无 caster 端参与）
     */
    snapshot: {
      /** caster.attack at apply；dot / hot 使用 */
      attack: number
      /** caster 身上所有 damage_increase buff value 列表 at apply（加算池的一部分）；dot / hot 使用 */
      casterIncreases: number[]
      /** 此 periodic effect 的 potency（从 buff effect.potency 字段 apply 时拷贝便于 tick 访问） */
      potency: number
      /** mp_regen 专用：target.maxMp at apply（mp_regen 回量 = targetMaxMp × potency） */
      targetMaxMp?: number
    }
    /** 仅 dot 使用：伤害类型（用于 UI / 死亡日志 / 未来元素抗性 hook）；hot / mp_regen 省略 */
    damageType?: DamageType | DamageType[]
    /** 施加者 entity id；施加者死亡不中断 tick；用于溯源 / UI 标注 */
    sourceCasterId: string
  }
}
```

**核心理念**：
- **Snapshot 仅冻结 caster 端**（`attack` 和 `casterIncreases`），tick 时与 **live target 端**（mitigation / vulnerability）汇合走现有 `calculateDamage` pipeline
- 好处：与 `src/combat/damage.ts` 现行模型完全一致（vulnerability + caster increases 同属加算池；mitigation 每层独立乘算）；玩家吃 DoT 后开减伤即时生效
- Apply 瞬间的正确性在 snapshot 记录时保证；tick 时复用已测试的 `calculateDamage` 代码路径，降低测试面

**对单个 buff 仅支持一个 periodic effect**（phase 3 MVP 前提）：若未来出现同一 buff 带多个不同 interval 的 periodic effect（如同时 DoT + mp_drain），`periodic` 需扩展为数组，本 phase 不处理。

**核心 API**：
- `applyPeriodicBuff(target, buffDef, caster, gameTime)`：apply 时：
  1. 若已有同 buffId 实例 → 先摘除（覆盖刷新语义；**不 fire 旧实例的 pending tick**）
  2. 构建 snapshot（仅冻结 caster 端 + potency；target 端留到 tick 时 live 读）：
     - `dot` / `hot`：`{ attack: caster.attack, casterIncreases: buffSystem.getDamageIncreases(caster), potency: effect.potency }`
     - `mp_regen`：`{ attack: 0, casterIncreases: [], potency: effect.potency, targetMaxMp: target.maxMp }`（attack 不用，占位便于类型统一）
  3. 写入新 `BuffInstance.periodic`：`{ nextTickAt: gameTime + interval, interval, effectType, snapshot, damageType?, sourceCasterId }`
  4. **不立即 fire**（首 tick 在 `gameTime + interval` 处触发）
- `tickPeriodicBuffs(gameTime, entities)`：每帧调用：
  ```
  for each entity in entities:
    for each buff inst with periodic:
      while gameTime >= inst.periodic.nextTickAt && inst.periodic.nextTickAt <= inst.expireAt:
        firePeriodicTick(inst, entity, gameTime)
        inst.periodic.nextTickAt += inst.periodic.interval
  ```
- `firePeriodicTick(inst, target, gameTime)`（target-side 值 live 读取）：
  ```ts
  const snap = inst.periodic.snapshot
  switch (inst.periodic.effectType) {
    case 'dot': {
      // caster 端 snapshot（attack + increases）+ target 端 live（vulnerability + mitigations）
      // 汇入同一 damage pipe；vulnerability 和 casterIncreases 加算池，mitigations 乘算
      const dmg = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: [
          ...snap.casterIncreases,
          buffSystem.getVulnerability(target),  // live
        ],
        mitigations: buffSystem.getMitigations(target),  // live
      })
      target.hp = max(0, target.hp - dmg)
      break
    }
    case 'hot': {
      // 治疗无 mitigation / vulnerability；仅 caster 端加算
      const heal = calculateDamage({
        attack: snap.attack,
        potency: snap.potency,
        increases: snap.casterIncreases,
        mitigations: [],
      })
      target.hp = min(target.maxHp, target.hp + heal)
      break
    }
    case 'mp_regen': {
      // 独立计算，不走 calculateDamage
      const amount = snap.targetMaxMp! * snap.potency
      target.mp = min(target.maxMp, target.mp + amount)
      break
    }
  }
  ```

**为什么复用 `calculateDamage` 而不另写一份？** 与现有 damage pipe 共享同一套加算 / 乘算 / floor 语义，未来 damage.ts 新增逻辑（新 buff 类型、暴击、元素抗性等）DoT 自动继承；测试也可部分复用 `damage.test.ts` 的既有断言语境。
- **摘除语义**：buff 过期 / 被 `consume_buffs` 驱散 / entity 死亡 → 从 entity.buffs 数组移除实例；无 timer handle 需清理

**game loop 集成**：`tickPeriodicBuffs(gameTime, entities)` 调用点接在现有 game loop 的 buff duration decrement 逻辑附近。implementer 在 plan 阶段勘定确切位置。

### 5.3 `next_cast_instant` cast hook

在现有 cast 启动路径（skill 执行入口，读 `SkillDef.castTime` 的地方）增加：
```ts
function resolveCastTime(caster, skill): number {
  // 现有：若 skill.castTimeWithBuff 命中 → 走技能侧
  if (skill.castTimeWithBuff && hasBuff(caster, skill.castTimeWithBuff.buffId)) {
    // ... 既有逻辑
    return skill.castTimeWithBuff.castTime
  }
  // 新增：若 caster 有任一带 next_cast_instant effect 的 buff → 读条归 0
  const instantBuff = findBuffWithEffect(caster, 'next_cast_instant')
  if (instantBuff && skill.type === 'spell') {  // 仅对 spell 生效（对齐 FF14 swiftcast 语义）
    pendingInstantBuffConsume = instantBuff  // 缓存，resolve 时消耗
    return 0
  }
  return skill.castTime
}
```
施法 resolve 后若 `pendingInstantBuffConsume.effects.find(e => e.type === 'next_cast_instant').consumeOnCast === true` → 摘除 buff。

**互斥优先级**：`castTimeWithBuff` > `next_cast_instant`。技能自带声明优先（因为可能有 "consume N stacks" 等自定义行为）。

### 5.4 测试覆盖

**背景说明**：历史上项目的 buff 基本作用于玩家自身（`apply_buff` 默认打到 caster）。phase 3 的弓箭手 `arc_venom_shot` 是**首个玩家给敌人**上 debuff / DoT 的技能，而 `next_cast_instant` 与 `mp_regen` 仍是 caster-self 方向。periodic framework 必须在两个方向都正确工作 —— 测试覆盖需要显式覆盖"caster / target 身份分离"的各种组合。

新建 `src/combat/buff-periodic.test.ts` 覆盖：

**基础 tick 行为**：
- **无 initial tick**：apply DoT 后目标 hp 不立即减少；等到 `t=3s` 才有第一次 tick
- 3s tick 对齐：apply 于 `t=0` 的 18s DoT → tick 发生在 `t=3 / 6 / 9 / 12 / 15 / 18`（共 6 次）
- 过期：`t=18s` 末 tick 后 buff 摘除，`t>18s` 不再 tick
- 卡顿补偿：mock gameTime 从 `t=3s` 一次跳到 `t=13s` → 补齐 4 次 tick（`t=3 / 6 / 9 / 12` 的 while 循环追赶），`t=15` 的 tick 仍需等到 `gameTime >= 15s`
- 施加者死亡不中断 DoT（对齐 FF14；buff 仍在 target 身上，tick 继续用 snapshot）

**身份方向边缘情况**（核心新增）：
- **玩家 → Boss DoT**（主流方向，弓箭手毒药箭）：DoT buff 挂在 boss 实体 `buffs` 数组；tick 从 boss 扣 HP；snapshot 的 caster 是玩家；玩家身上 HP/MP 不变
- **Boss → 玩家 DoT**（敌方 AOE 上毒的预留路径）：DoT buff 挂玩家；tick 从玩家扣 HP；snapshot 的 caster 是 boss；验证 snapshot 读取 boss.attack 而非玩家 attack（方向不会搞混）
- **玩家自用 HoT**（phase 3 无此技能但 framework 必须预先支持）：HoT buff 挂玩家，tick 回玩家 HP；验证 `heal potency × caster.attack` 计算用 caster (= self = target) attack
- **玩家给 Boss 上 HoT**（极端边界，phase 3 不会发生但测试走一遍）：验证 buff 确实挂到了 boss 上，tick 回 boss HP（不应当出现，但 framework 不崩溃）
- **Boss 身上同时有玩家 DoT + 敌方团队 buff**（phase 3 boss 有场地机制时）：验证 buff 实例按 id 区分，互不干扰
- **玩家身上同时中 DoT + 有 damage_increase buff**：DoT tick 不吃玩家 damage_increase（因为 snapshot 的是施加者 boss 的 damage_increase；玩家自身 damage_increase 对 damage **taken** 无意义）；非 DoT 攻击对玩家伤害正常走 mitigation

**快照独立 & 覆盖刷新 & live 防御判定（核心场景）**：

（设 ATK 900, `arc_venom` potency 0.3, interval 3s, duration 18s。下面以 target 无 mitigation / vulnerability 为默认。）

场景 A —— **caster 端增伤快照 + buff 过期后 DoT 仍持续加成**：
- `t=0` caster 身上有 `damage_increase 0.20` buff（架式风格，duration 8s）
- `t=0` apply `arc_venom` → snapshot.casterIncreases = [0.20]；`nextTickAt = 3`
- `t=3s` 第一次 tick：`calculateDamage({ attack: 900, potency: 0.3, increases: [0.20], mitigations: [] }) = 900 × 0.3 × 1.20 = 324` → target.hp -= 324 ✓ 吃 +20%
- `t=8s` 架式 buff 过期，caster 身上不再有 damage_increase
- `t=9s` 第 3 次 DoT tick：仍用 snapshot.casterIncreases = [0.20] → target.hp -= 324（caster 端 snapshot 冻结不变）——验证施加者端快照不被后续 buff 状态影响

场景 B —— **target 端减伤 live 判定**（核心新场景）：
- `t=0` apply `arc_venom`（caster 无增伤） → snapshot.casterIncreases = []
- `t=3s` tick：`calculateDamage({ attack: 900, potency: 0.3, increases: [0], mitigations: [] }) = 270`，target.hp -= 270
- `t=4s` target 开 `mitigation 0.20` buff（例如场地机制或自身防御技）
- `t=6s` tick：`calculateDamage({ ..., increases: [0, vuln=0], mitigations: [0.20] }) = 270 × 0.80 = 216` → target.hp -= 216 ✓ 减伤生效
- `t=10s` target 减伤 buff 过期
- `t=12s` tick：`... mitigations: [] = 270` → target.hp -= 270 ✓ 减伤过期后伤害恢复——验证 target 端 mitigation 是 live 的

场景 C —— **target 端 vulnerability live 判定 + 与 caster snapshot 加算池汇合**：
- `t=0` caster 无增伤时 apply `arc_venom` → snapshot.casterIncreases = []
- `t=3s` target 在 `t=2s` 被上 `vulnerability 0.30` debuff
- `t=3s` tick：`calculateDamage({ attack: 900, potency: 0.3, increases: [0, 0.30], mitigations: [] }) = 900 × 0.3 × 1.30 = 351` → target.hp -= 351 ✓ vuln 加成生效
- `t=6s` target 的 vuln 仍在
- `t=6s` tick：仍 = 351
- `t=7s` target vuln 过期
- `t=9s` tick：`increases: [0] = 270` → 恢复 baseline 伤害 ✓ 验证 vuln live
- 补充：若此时同时有 caster snapshot `[0.20]` 和 target live vuln `[0.30]`，合并加算 = `1 + 0.20 + 0.30 = 1.50`，伤害 = 405（验证同一加算池）

场景 D —— **覆盖刷新恢复正常伤害**：
- 接场景 A，`t=10s` caster 无 damage_increase 状态下再次 apply `arc_venom`
  - **旧实例的 `nextTickAt = 12s` pending tick 直接抛弃（不 fire）**
  - 新 snapshot.casterIncreases = []，`nextTickAt = 13s`
- `t=12s` 无 tick 发生——验证覆盖刷新无 pending tick 补偿
- `t=13s` tick：270（无加成）——验证覆盖刷新正确替换 snapshot

场景 E —— **爆发窗口优化的正确玩法**：
- `t=0` apply `arc_venom`，caster 无增伤 → snapshot.casterIncreases = []
- `t=1.5s` caster 开 `arc_barrage` +30%
- `t=2s` 再次 apply `arc_venom` → **旧 pending tick 抛弃**；新 snapshot.casterIncreases = [0.30]；`nextTickAt = 5`
- `t=5s` tick：`increases: [0.30]` → 351
- `t=7.5s` barrage 过期（6s duration）
- `t=8s` tick：仍 351（caster snapshot 冻结）——验证 buff 过期后 DoT 仍吃加成
- 玩家策略：barrage 开启后立刻覆盖 DoT，6 跳全吃 barrage 加成（总多打 `6 × (351-270) = 486`，代价是旧 DoT 的 t=3 pending tick 丢失的 270） → 净收益 +216 伤害

场景 F —— **施加者死亡后 target 端变化继续 live 影响 tick**：
- `t=0` caster 给 boss 上 `arc_venom`，snapshot.casterIncreases = []
- `t=5s` caster 死亡，snapshot 不受影响（施加者端数据已冻结）
- `t=6s` boss 上 `vulnerability 0.30` debuff（例如场地机制触发）
- `t=6s` tick：`increases: [0, 0.30] = 351` → 即使 caster 已死，tick 仍能吃 live target vuln
- 验证"施加者死亡不中断 tick + target 端 live 判定" 两条规则复合生效 —— 即 FF14 召唤师 DoT 击杀 boss 的经典致敬场景在技术上可行

**驱散语义**：
- `consume_buffs` 技能击中带 DoT 的目标 → buff 摘除，不再 tick
- 目标死亡（HP → 0）→ 所有 periodic buff 清理（与现有 buff 生命周期一致）

**mp_regen 专项**：
- 21s duration / 3s interval → 7 次 tick
- 每次 tick MP 加 `potency × maxMp`（不超 maxMp）
- 玩家自用（`ROLE_LUCID_DREAMING`）：caster = target = 玩家；snapshot 的 targetMaxMp 是玩家 maxMp
- target.mp 已是 maxMp 时 tick 不溢出

`next_cast_instant` 测试：
- apply `thm_swiftcast_ready` 后 spell 读条归 0
- 施法完成后 buff 被消耗（若 `consumeOnCast: true`）
- 非 spell 技能（weaponskill / ability）不触发 next_cast_instant 消耗
- 与 `castTimeWithBuff` 共存时，技能自带声明优先

---

## 6. UI 层设计

### 6.1 `no-run` 存档感知

`hydrate()` 改动：load run 数据同时设到 `run.value`（schemaVersion 匹配时），供存档摘要消费。phase 仍保持 `'no-run'`。

```ts
async function hydrate(): Promise<void> {
  const loaded = await loadTowerRun()
  savedRunExists.value = loaded !== null
  if (loaded && loaded.schemaVersion === TOWER_RUN_SCHEMA_VERSION) {
    run.value = loaded
  }
}
```

UI 骨架（`src/pages/tower/index.vue` 的 `no-run` 分支）：

```pug
//- 无存档
.tower-panel(v-if="tower.phase === 'no-run' && !tower.savedRunExists")
  .tower-title 爬塔模式
  .tower-subtitle 选择一个入口开始你的攀登
  .tower-actions
    button.tower-btn.primary(@click="tower.enterJobPicker()") 新游戏
    button.tower-btn.secondary(disabled @click="onTutorial") 教程
    button.tower-btn.tertiary(@click="goHome") 返回主菜单

//- 有存档
.tower-panel(v-else-if="tower.phase === 'no-run' && tower.savedRunExists && tower.run")
  .tower-title 爬塔模式
  .tower-subtitle 进行中的下潜
  .run-summary
    .summary-row
      span.label 职业
      span.value {{ displayJobName(tower.run) }}
    .summary-row
      span.label 等级
      span.value {{ tower.run.level }}
    .summary-row
      span.label 水晶
      span.value {{ tower.run.crystals }}
    .summary-row
      span.label 开始于
      span.value {{ formatStartedAt(tower.run.startedAt) }}
  .tower-actions
    button.tower-btn.primary(@click="onContinue") 继续
    button.tower-btn.secondary(@click="showAbandonDialog = true") 放弃并结算
    button.tower-btn.tertiary(@click="goHome") 返回主菜单
  ConfirmDialog(
    v-if="showAbandonDialog"
    title="确定放弃这次攀登吗？"
    message="所有进度将丢失。"
    confirm-text="放弃"
    cancel-text="取消"
    @confirm="onAbandon"
    @cancel="showAbandonDialog = false"
  )
```

**`displayJobName`**：返回 `advancedJobId ?? baseJobId` 对应的 `PlayerJob.name`。基础职业也走同一个查询（`getJob(id).name`），只要 3 个基础 job 加到 `JOBS` 即可。

**`formatStartedAt`**：
```ts
// 首选：@vueuse/core 的 useTimeAgo
import { useTimeAgo } from '@vueuse/core'
// fallback：new Date(ts).toLocaleString()
```

**`onAbandon`**：
```ts
function onAbandon() {
  // TODO(phase 6): 接入结算系统 — 按 GDD §2.16 根据 run.level / run.crystals / run.materia
  // 计算金币奖励并展示结算界面。当前仅清档回主菜单。
  tower.resetRun()
  showAbandonDialog.value = false
}
```

### 6.2 二次确认对话 `ConfirmDialog.vue`

新建 `src/components/common/ConfirmDialog.vue`（common 目录是新的，需要 unplugin-vue-components 自动注册 prefix 按文件夹生效，自注册为 `<CommonConfirmDialog />`；或者直接放 `src/components/` 顶层让其注册为 `<ConfirmDialog />`）。

**实现细节**：
- Props：`title: string`, `message: string`, `confirmText?: string = '确定'`, `cancelText?: string = '取消'`, `confirmVariant?: 'danger' | 'normal' = 'normal'`
- Emits：`confirm`, `cancel`
- 模板：固定定位覆盖层 + 中央卡片，点击覆盖层或按 Esc 触发 cancel
- 样式沿用 `MenuShell` 风格（深色半透明 + 细边框）

implementer 具体组件位置 / 自注册前缀在 plan 阶段按项目 unplugin-vue-components 规则定。

### 6.3 职业选择 `JobPicker` + `JobPickerCard`

`src/components/tower/JobPicker.vue`：
- 渲染 3 张 `<JobPickerCard>` 横排
- 顶部标题"选择起始职业"
- 底部返回按钮（→ `tower.setPhase('no-run')`）

`src/components/tower/JobPickerCard.vue`：
- Props：`job: PlayerJob`
- 显示：
  - 职业名（大字）
  - 类别 label（JOB_CATEGORY_LABELS[job.category]）
  - description（1-2 行）
  - 技能预览：`job.skillBar.slice(0, 3).map(s => s.skill.name)`（hover 出 tooltip，复用 `use-tooltip`）
  - icon 字段留空；fallback 显示职业名首字（fallback 机制由 implementer 在现有 HUD icon 工具函数里检查是否已有）
- Emits：`pick`（父组件接到后调 `tower.startNewRun(job.id)`）
- hover 高亮 / selected 状态交互留给 implementer 按现有 MenuShell 风格

### 6.4 `/tower/index.vue` 路由分支

```pug
if tower.phase === 'no-run'
  // 上文 6.1 两分支
else if tower.phase === 'selecting-job'
  JobPicker(@pick="onJobPick")  // onJobPick(job) => tower.startNewRun(job.id)
else if tower.phase === 'ready-to-descend' && tower.run
  // 原 selecting-job 模板原封不动搬过来
  // "准备下潜 / 显示 baseJobId + seed / [开始下潜] [重置]"
else if tower.phase === 'in-path' && tower.run
  TowerMap  // 不动
else
  // fallback：ended / in-combat placeholder
```

---

## 7. 文件改动清单

### 新建

- `src/jobs/swordsman/index.ts`（`SWORDSMAN_JOB`）
- `src/jobs/swordsman/skills.ts`（`SWORDSMAN_SKILLS`）
- `src/jobs/swordsman/status.ts`（`SWORDSMAN_BUFFS` — 含 `swm_guard`）
- `src/jobs/swordsman/swordsman.test.ts`
- `src/jobs/archer/index.ts`（`ARCHER_JOB`）
- `src/jobs/archer/skills.ts`（`ARCHER_SKILLS`）
- `src/jobs/archer/status.ts`（`ARCHER_BUFFS` — 含 `arc_venom` / `arc_barrage`）
- `src/jobs/archer/archer.test.ts`
- `src/jobs/thaumaturge/index.ts`（`THAUMATURGE_JOB`）
- `src/jobs/thaumaturge/skills.ts`（`THAUMATURGE_SKILLS`）
- `src/jobs/thaumaturge/status.ts`（`THAUMATURGE_BUFFS` — 含 `thm_swiftcast_ready`）
- `src/jobs/thaumaturge/thaumaturge.test.ts`
- `src/combat/buff-periodic.ts`（或 `buff.ts` 扩展段落）
- `src/combat/buff-periodic.test.ts`
- `src/components/common/ConfirmDialog.vue`（或 `src/components/ConfirmDialog.vue` 视自注册规则定）
- `src/components/tower/JobPicker.vue`
- `src/components/tower/JobPickerCard.vue`

### 修改

- `src/jobs/commons/role-skills.ts` — 追加 `ROLE_LUCID_DREAMING` export
- `src/jobs/commons/buffs.ts` — 追加 `lucid_dreaming` 到 `COMMON_BUFFS`
- `src/jobs/index.ts` — import + export 3 个新 job + 加入 `JOBS` 数组
- `src/core/types.ts` — `BuffEffectDef` 追加 `mp_regen` / `next_cast_instant`；`BuffInstance` 追加 `periodic?` 字段
- `src/combat/buff.ts` — 接入 periodic framework（或 delegate 到 `buff-periodic.ts`）；扩展 buff apply 时的 snapshot + initial tick 行为；扩展摘除语义
- `src/combat/damage.ts` 或 skill cast 入口 — `next_cast_instant` hook
- `src/tower/types.ts` — `TowerRunPhase` union 追加 `'ready-to-descend'`（`selecting-job` 保留但语义变更，在注释里说明）
- `src/stores/tower.ts` — `startNewRun` 改 phase 到 `'ready-to-descend'`；新增 `enterJobPicker`；`hydrate` load run 数据；`continueLastRun` 推断 phase
- `src/pages/tower/index.vue` — no-run 分支存档感知；加 `selecting-job` 分支（JobPicker）；加 `ready-to-descend` 分支（原 selecting-job 内容搬过来）

---

## 8. 测试策略

### 8.1 单元测试

- 每个基础职业 colocated `*.test.ts`：
  - **数值健康**：用 `sim-test-utils.ts` 的 60s 模拟工具验证 DPM 落在目标档位
  - **核心行为**：
    - swordsman: 架式激活后 8s 内 damage_increase 生效 + 过期后失效
    - archer: 毒药箭**对 boss 实体** initial tick / 每 3s tick / 覆盖刷新 / 快照不吃后续 caster buff；强化爆发 6s 加伤
    - thaumaturge: swiftcast 让下一个 spell 读条归 0 且消耗 buff；辉石魔砾读条 & 伤害；治疗 self-heal；醒梦 21s 回 35% max MP
- `src/combat/buff-periodic.test.ts`：见 §5.4（重点覆盖 caster/target 身份方向 + 覆盖刷新时序 + 快照独立性）

### 8.2 Store 测试

`src/stores/tower.test.ts`（若不存在则新建）：
- `enterJobPicker` 设 phase 为 `'selecting-job'` 且不创建 run
- `startNewRun` 设 phase 为 `'ready-to-descend'`（不是旧的 `'selecting-job'`）
- `hydrate` 在存档存在 + schema 匹配时填充 `run.value` 且 phase 保持 `'no-run'`
- `continueLastRun` 在 `towerGraph.nodes` 空时恢复 `'ready-to-descend'`，非空时恢复 `'in-path'`

### 8.3 UI 手动 QA

不写 UI 单测（对齐项目惯例）。合并前 dev server 验证：
- no-run 无存档 → 新游戏 → selecting-job 卡片 → 选卡片 → ready-to-descend → 开始下潜 → in-path 地图 流转无异常
- no-run 有存档（通过先打一局到 in-path 再刷新页面）→ 摘要卡片正确显示 → 继续恢复到地图 / 放弃触发二次确认 → 确认后回到无存档 no-run
- 三个基础职业进入战斗（phase 4 接入前用现有 encounter 单关模拟器手验）技能释放 & buff tooltip 显示正常

---

## 9. 迁移与兼容

- **不 bump `TOWER_RUN_SCHEMA_VERSION`**：`TowerRun` 数据 shape 无变化；phase 推断路径对旧存档透明
- **旧存档兼容**：phase 2 留下的存档 load 后：若 `towerGraph.nodes` 非空（已 startDescent）→ 恢复 `'in-path'`；若空 → 恢复 `'ready-to-descend'`
- **硬编码 `swordsman` 的 phase 2 临时桥去除**：`/tower/index.vue` 里原 `tower.startNewRun('swordsman')` 改为 `tower.enterJobPicker()`
- **`BaseJobId` union 不变**：仍是 `'swordsman' | 'archer' | 'thaumaturge'`；3 个 string 字面量在 phase 3 获得对应 runtime 实现

---

## 10. Phase 3 不回答的 Open Questions（留给后续 phase）

- 基础职业数值是否需要在实战中再调优（DPM 落点 / buff 持续时长 / cd）—— phase 4 引入小怪战斗后在 encounter 里实测
- 职业选择 UI 的键盘 / 手柄导航 —— 需要时再加
- 职业选择后是否应该显示"你还可以在爬塔途中拾取武器切换到进阶 job"的提示 —— UI tutorial / first-run onboarding，phase 7 教程塔一并设计
- `next_cast_instant` 是否要限定仅对 spell 生效（当前设计限定）—— 未来若有"即刻 weaponskill" 需要再扩展
- 基础职业的 icon / 技能 icon 素材 —— 用户手工补，不阻塞 phase 3 merge
- **战败延迟结算（DoT 致死胜利）** —— 玩家 HP 到 0 不立即判负；进入"倒地判定窗口"（例如 10s 或持续到所有 boss 身上的 DoT 过期），期间 boss 上的 DoT tick 继续跑，若 boss 在窗口内被 DoT 打死则判玩家胜。致敬 FF14 历史上绝境战召唤师 DoT 首杀经典。Phase 3 已经通过"施加者死亡不中断 tick"为此铺好基础（见 §5.2 / §5.4），具体结束判定与 UI 表现由 phase 4/5 战斗结束逻辑接入时设计。

- **DoT 专精流派 / DoT 增伤词条** —— 利用 periodic framework 的 `effectType` 字段 + `calculateDamage` 的 `increases` 加算池，可支持"仅对 DoT tick 生效的伤害加成"类词条或 buff。实现路径：在 `firePeriodicTick` 里按 `effectType === 'dot'` 过滤 caster 身上的"DoT 专属 damage_increase"（可通过新 `BuffEffectDef` 类型如 `dot_damage_increase` 或现有 buff 加标签）并塞进 `increases` 数组。架构零改动，只需新的 effect 类型定义 + snapshot 增一份专属 increases 列表。搭配 phase 6 魔晶石词条池扩容 + 未来进阶 job 技能组自选（例：弓箭手进阶成诗人后玩毒伤流），能形成独立的 build 路线。本 phase 不实装，但 periodic framework 的 `effectType` 分派和 snapshot 数据结构要设计成这个扩展不需要重构。
