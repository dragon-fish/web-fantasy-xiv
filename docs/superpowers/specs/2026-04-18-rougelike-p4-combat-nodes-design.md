# Rougelike Tower — Phase 4 (Combat Node Integration) 设计

> Scope：把战斗节点接入爬塔流程。玩家在 `/tower` 的 `in-path` 阶段点击可达节点后，弹出"确认 / 侦察 / 进入 / 取消"面板；进入战斗后在**同一路由**内嵌 `<EncounterRunner>` 播放战斗；战斗结束写回 run 状态（胜利 → 标记节点 + 水晶奖励 → 回地图；失败 → 扣决心 → [重试 / 放弃] 分支）。决心耗尽进入 `ended` 尾屏。本 phase 同时落地一套**抗热更新**的 pool 版本化架构（Registry / Active Pool 分离 + 塔蓝图版本 + 最低支持版本下限），作为后续所有 pool 型内容（事件 / 策略卡 / 场地机制 / 武器 / 魔晶石）的工程基石。

## 1. Spec Reference

- GDD：`docs/brainstorm/2026-04-17-rougelike.md`
  - §2.4（侦察与逃跑）
  - §2.5 / §2.5.1（战斗系统 + 小怪战设计原则）
  - §2.14 / §2.14.1（决心 + 放弃低保）
  - §2.15（死亡惩罚）
  - §7.4（技术架构原则：Tower 单路由 / 数据与引擎分离 / Seeded PRNG）
- 数值平衡规范：`docs/job-balance.md`
- **项目宪法**：`docs/tower-engineering-principles.md` —— phase 4 并行产出的长期工程契约（三层版本体系 / Pool Registry-Active 分离 / 开局一次性 rng 固化 / 侦察历史快照 / 单路由状态机 / 战斗结束归属），后续所有 phase 必须遵守
- Phase 1 / 2 / 3 产物：
  - `src/tower/types.ts` — `TowerRun` / `TowerNode` / `ScoutInfo` / `TOWER_RUN_SCHEMA_VERSION`
  - `src/tower/graph/generator.ts` — 图生成（phase 2）
  - `src/stores/tower.ts` — `useTowerStore`（phase 3 扩展 `enterJobPicker` / `hydrate` / `continueLastRun` 推断 phase）
  - `src/pages/tower/index.vue` — phase 3 no-run 存档感知 / job picker / ready-to-descend / in-path 分支
  - `src/combat/buff-periodic.ts` — phase 3 periodic-effect framework（本 phase 直接消费）
- 现有战斗入口：
  - `src/game/battle-runner.ts` — `startTimelineDemo(canvas, uiRoot, encounterUrl, jobId, onInit)` + `getActiveScene` / `disposeActiveScene`
  - `src/game/encounter-loader.ts` — YAML → `EncounterData`
  - `src/pages/encounter/[id].vue` — 独立模拟器宿主页（phase 4 拆出 `<EncounterRunner>` 后改用组件）
  - `src/components/hud/BattleEndOverlay.vue` — 现有战斗结束覆盖层（phase 4 改造为 runner slot，外部注入按钮区）

---

## 2. Scope

### IN（phase 4 必做）

**战斗节点接入**：
- 战斗节点点击弹 `NodeConfirmPanel` —— 节点类型 + 侦察信息 + [侦察] / [进入] / [取消]
- 侦察消耗 1 水晶，结果缓存 `TowerRun.scoutedNodes[nodeId]`；二次打开直接显示已侦察态，无侦察按钮
- 非战斗节点（reward / campfire / event / start）同一 panel 的简化版（无侦察按钮），[进入] 按钮走 `advanceTo` stub（直接标记通过），功能留 phase 5/6
- 精英 / Boss 节点 panel 显示，[进入] 按钮 **disabled** + 文案 "phase 5 实装"，不接真实战斗

**嵌入式战斗**：
- 抽出 `<EncounterRunner>` 组件，承载 canvas + 全套 HUD 组件 + scene lifecycle
- `/tower` phase 切到 `'in-combat'` 时内嵌渲染 `<EncounterRunner>`；**不 navigate**
- `/encounter/[id].vue` 改用同一个组件，消除重复
- 战斗结束事件 `combat:ended` 通过回调上抛到宿主；tower 宿主消费后走"结算 → 回地图 / ended"分支

**战斗结果回路**：
- 胜利：`completedNodes` 追加当前节点 + `crystals += rewards.crystals`（值从 encounter manifest 读）→ phase 回 `'in-path'`（玩家下次行动从此节点分叉）
- 失败：进入 `BattleResultOverlay` 爬塔态 ——
  - 立即扣 1 决心（boss 本 phase 不做，扣减档位只有 -1）
  - 按钮 [重试]（`scene.restart()`）/ [放弃]（发放 50% crystal 低保 + 标 completedNodes + 回 `'in-path'`）
  - 决心 ≤ 0 时 [重试] 按钮禁用 + 文案"决心已耗尽"；[放弃] 仍可用
- 决心耗尽（任意时刻 `run.determination <= 0`）→ phase 切 `'ended'`，渲染 `TowerEndedScreen` 最简尾屏（[返回主菜单] 按钮触发 `resetRun()`）；结算系统 phase 6 接入

**Pool 版本化架构**（全 phase 通用基石，phase 4 只落地 encounter 一个 pool）：
- 新建 `src/tower/blueprint/version.ts`：`TOWER_BLUEPRINT_CURRENT` + `TOWER_BLUEPRINT_MIN_SUPPORTED`
- `TowerRun` 新增 `blueprintVersion: number`（开局 = `TOWER_BLUEPRINT_CURRENT`）
- `TowerNode` 新增 `encounterId?: string`（战斗节点开局固化）
- 新建 `public/tower/pools/encounter-pool.json` manifest（Registry = 全部 entries；Active Pool = `!deprecated` 子集）
- 新建 `src/tower/pools/encounter-pool.ts`：async `loadEncounterPool()` 首次加载 manifest + 缓存；`resolveEncounter(id): EncounterMeta` 从 Registry 查；`pickEncounterIdFromActivePool(seed, nodeId, kind)` 从 Active Pool 抽
- `continueLastRun()` 校验顺序扩展：
  1. `schemaVersion !== TOWER_RUN_SCHEMA_VERSION` → reset + 现有 notice
  2. `blueprintVersion < TOWER_BLUEPRINT_MIN_SUPPORTED` → reset + 新 notice "本局使用的塔蓝图已过时"
  3. `blueprintVersion > TOWER_BLUEPRINT_CURRENT` → defensive reset + error log
  4. 通过 → 正常 load
- `startDescent()` 改动：graph 生成后，遍历战斗节点，按 `seededRandom(seed, nodeId, 'encounter')` 从 Active Pool 抽 id 填入 `node.encounterId`

**小怪 Encounter 内容**（4 个主题 + 1 个 fallback）：
- `public/encounters/tower/mob-frost-sprite.yaml` — 冰主题，30s 圆形 AOE + 冰冻减速 debuff
- `public/encounters/tower/mob-fire-elemental.yaml` — 火主题，扇形 + 十字 AOE 组合
- `public/encounters/tower/mob-chain-marker.yaml` — 点名主题，15s 周期脚下圆圈落地
- `public/encounters/tower/mob-arena-shrinker.yaml` — 场地收缩，外圈死区渐进压缩
- `public/encounters/tower/mob-fallback.yaml` — 通用占位，defensive 降级兜底（id `mob-fallback` 从不进 Active Pool，但 Registry 含之；`resolveEncounter` 找不到时 fallback 到此）
- 每个小怪 YAML 含 `mob_enrage_stack` skill + `mob_enrage` stackable buff + `loop` action 实现 GDD §2.5.1 软超时（纯配置，无 runtime 改动）

**Encounter YAML schema 扩展**：
- Encounter loader 增加 `local_buffs` 段落解析 + 宿主（`battle-runner.ts`）加载 encounter 后调 `combatResolver.registerBuffs(encounter.localBuffs)` 把 encounter 级 buff 注册入战斗 buffMap
- 不把 buff 定义外提到全局 `COMMON_BUFFS`（保持 encounter 自描述语义，job 共享 buff 才进 `COMMON_BUFFS`）

**UI 组件清单**：
- `src/components/tower/NodeConfirmPanel.vue` — 节点确认 / 侦察面板
- `src/components/tower/EncounterRunner.vue` — 战斗嵌入组件（canvas + HUD + scene lifecycle，外暴露 `onCombatEnded` 回调）
- `src/components/tower/BattleResultOverlay.vue` — 爬塔态战斗结束覆盖层（胜利/失败/重试/放弃按钮区，复用现有 HUD style）
- `src/components/tower/TowerEndedScreen.vue` — 最简 ended 尾屏
- `src/components/tower/RunStatusBar.vue` — 运行时常驻状态栏（职业 / 等级 / ❤️ 决心 / 💎 水晶 / 装备槽 stub / 魔晶石槽 stub）
  - 显示时机：`run.value !== null` 且 phase ∈ `ready-to-descend | in-path | in-combat | ended`
  - `no-run` 无存档 / `selecting-job`：不显示（保留 `.tower-title` 大字作为主菜单标题）
  - `no-run` 有存档：不显示（保留现有 `.run-summary` 卡片，职能是"存档摘要 + 决策入口"）
  - 样式：MenuShell 深色半透明风格，挂 MenuShell 内 MenuBackButton 下方
  - 装备槽 phase 4 stub 显示 `"基础"`；魔晶石槽 phase 4 stub 显示空圆点 × 5（phase 6 填充）

### OUT（phase 4 不做，后续 phase 承接）

- 精英战斗实装（3 类型机制马拉松）—— **phase 5**
- Boss 战斗实装（2-3 阶段 + 硬狂暴 + 决心 -2）—— **phase 5**
- 超越之力场地机制 runtime —— **phase 5**
- 场地机制框架（battlefield condition 通用系统）—— **phase 5**
- 决心 buff / debuff 联动 / 战败延迟结算窗口（DoT 致死胜利）—— **phase 5**
- 死亡 buff 清除策略（`preserveOnDeath` 标记语义） —— **phase 5**
- 事件节点 runtime（随机事件池 / 选择 / 结果）—— **phase 5**
- 奖励节点 runtime（免费水晶 / 魔晶石发放）—— **phase 6**
- 篝火节点 runtime（升级 / 配装 / 奉献）—— **phase 6**
- 第 0 节点随机武器 + 3 选 1 策略卡 —— **phase 6**
- 结算系统 / 金币 / 抽卡 / 定轨券 —— **phase 6**
- 教程塔 hand-crafted graph —— **phase 7**
- Pool resolver 扩展到其他 pool 类型（event / relic / battlefield-condition / weapon / materia-affix）—— **各自 phase 接入时复刻本 phase 的 encounter pool 模式**
- 侦察 UX 细节（动画 / 键盘导航 / tooltip 完整化）—— 按默认风格写骨架，dev server 目视迭代，不阻塞 phase 4 merge
- Icon 素材补齐 —— 用户手工补
- Boss 血条 debuff 渲染 / DoT 跳字 / buff apply-remove 浮字 / 雷达图 / portrait 接入（Phase 3 polish backlog）—— 独立施工

---

## 3. 关键工程决策

### 3.1 三层版本体系 + Pool Registry / Active Pool 分离

**问题**：页游强制热更新场景下，加 encounter / 加事件 / 改数值 / 重构节点类型 / 改图生成算法 —— 这些变更性质不同，用单一 `schemaVersion` 管会导致"改任何 pool 内容都要把所有存档冲掉"。

**解法**：把版本职责拆成三个正交维度。

| 维度 | 用途 | 变更触发 | 对老存档影响 |
|------|------|---------|-------------|
| **`TOWER_RUN_SCHEMA_VERSION`** | `TowerRun` / `TowerGraph` / `TowerNode` **字段 shape** | 增删字段 / 改字段类型 / 改 union 成员 | 不匹配 → 强制 reset + notice（现有机制） |
| **`blueprintVersion`**（新） | 塔蓝图（节点类型集合 + 图生成算法 + K_SCHEDULE）语义 | 节点 kind 增删 / 算法重写 / K schedule 改 | 低于 `MIN_SUPPORTED` → reset + notice；否则继续 |
| **`TOWER_BLUEPRINT_MIN_SUPPORTED`**（新，独立常量） | 运维阀门，硬性作废阈值 | 只有"必须掀桌"时 bump | 存档 `blueprintVersion` 低于此 → 强制作废 |

**Pool 内容**（encounter / event / relic / condition / weapon / materia）**永远不 bump 任何版本**，由下文 Registry / Active Pool 机制吸收变化。

**为什么 graph 算法改用 blueprintVersion 而不是 schemaVersion**：
- 存档里已经**物化**了 `towerGraph.nodes`，runtime 不需要 re-run 算法；算法变更不破坏老存档的数据完整性
- blueprintVersion 存在的意义是**声明"这个存档用的是哪套设计原则"**，将来做 migration / 低版本废弃判定时有据可依
- 拆开后：新加个节点 kind（例如 `trial` 试炼节点）= bump blueprintVersion，老存档不受影响；只有删除现有 kind / 改写现有 kind 语义才需要通过 `MIN_SUPPORTED` 强制作废

**Registry / Active Pool 分离**（适用于所有 pool 型内容）：

| 概念 | 语义 | 变更规则 |
|------|------|---------|
| **Registry**（全量定义表） | 所有**曾经发布过**的 id → def 映射。等于 pool manifest 的全部 entries（含 deprecated） | **append-only**。已发布 id 永不删、永不改语义 |
| **Active Pool**（当前版本抽取候选） | 新开局 rng 从这里抽。等于 manifest 里 `!deprecated` 的 entries | 可增可减，通过 `deprecated` 字段切换 |

**关键契约**：
- **存档里固化的 id 解析走 Registry**，与 Active Pool 无关
- 从 Active Pool 移除一个 id **对老存档完全透明**（老存档仍能通过 Registry 拿到 def）
- 新开局只从 Active Pool 抽，自然不会碰到被移除的 id
- **"效果替换 = 新 id"**（如 `relic_venom_mastery` → `relic_venom_mastery_v2`）；display name 可以相同，玩家 UI 体感"换了平衡"，但 id 层严格独立
- 数值微调 / AOE 半径微调 / 对白改文案 **允许直接改原 YAML**（玩家感知变化符合"敌人学新招"roguelike 精神，此规则限对非持有方生效内容）
- 持有老 id 的老存档持续读取老版本定义（对持有者公平）

### 3.2 开局一次性 rng 固化

`startDescent()` 改动：graph 生成后，遍历 `kind === 'mob' | 'elite' | 'boss'` 节点，按 `seededRandom(seed, nodeId, 'encounter')` 从 Active Pool 抽 id 填入 `node.encounterId`。

**好处**：
- 开局后 `run.seed` 在 pool 维度失去作用——所有 pool 选择都已物化在 `node.*Id` 字段里
- Scout 缓存与战斗实际内容永远对得上（都走同一个 `encounterId` 解析）
- 跨版本"pool 扩容"不会改变老存档的战斗序列（已经固化）
- 只有 seed 的**图结构**维度（节点位置 / 分叉）仍由 seed 决定，但 graph 本身也物化了，所以 seed 其实不再参与 runtime

**未来扩展**：phase 5 事件节点的 `eventId`、phase 6 奖励节点的 `rewardId` 等也在 `startDescent()` 一并固化；phase 6 第 0 节点的武器候选 + 策略卡候选同理在 run 创建时固化（不是 `startDescent()`，是 `startNewRun()`，因为第 0 节点涉及职业选择后的起手包）。

**Phase 4 只固化 encounterId 一种**，其他字段留给后续 phase 按同模式扩展。

### 3.3 EncounterRunner 组件抽离

**当前状态**（phase 3 / phase 3 以前）：`/encounter/[id].vue` 模板中 canvas 由 `useEngine()` 挂载，所有 `Hud*` 组件在模板内平铺，`startTimelineDemo` 直接被页面 `onMounted` 调用。

**phase 4 改动**：抽出 `src/components/tower/EncounterRunner.vue`（也可放 `src/components/common/` —— implementer 按项目 unplugin-vue-components 自注册规则选位置），封装：
- canvas 挂载（`useEngine()` 内聚）
- 所有 `Hud*` 组件模板（原封搬到组件里）
- `startTimelineDemo` / `disposeActiveScene` 生命周期
- Props：`encounterUrl: string`, `jobId: string`, `onInit?: BattleInitCallback`
- Emits：`combat-ended` with payload `{ result: 'victory' | 'wipe', elapsed: number }`
- **不 emit** retry / resume —— 战斗重试等交互由**外部 result overlay** 决定是否重挂组件（gameKey 递增模式）

**关键设计点 —— 战斗结束通知**：
- 在 `EncounterRunner.vue` 内监听 `bus.on('combat:ended', payload => emit('combat-ended', payload))`，把事件转发成 Vue emit
- **不阻塞原有 `scene.endBattle('victory' | 'wipe')` 逻辑**（现有死亡动画 + battle-over 锁仍保留），只是多一条通往外部的管道

**`/encounter/[id].vue` 改造**：模板简化为仅渲染 `<EncounterRunner>` + 练习模式 onInit 注入 + tutorial 跳过按钮；自身不再消费 `combat-ended`（独立模拟器依然靠 `HudBattleEndOverlay` 提供重试，不走 tower 结算分支）。

**为什么不让 `EncounterRunner` 自带 `BattleEndOverlay`**：
- 独立模拟器要的 overlay 行为 = [重试]/[返回列表]（游离，不扣决心，不固化结果）
- 爬塔要的 overlay 行为 = [重试 -1 ❤️] / [放弃 (-50% 低保)]（扣决心，固化结果）
- 两者 overlay 由宿主负责挂载，runner 只负责把 `combat-ended` 事件抛出来
- 现有 `HudBattleEndOverlay` 保留不变，但从"组件内置"改为"由宿主按需渲染"（独立模拟器继续渲染它；爬塔宿主渲染 `BattleResultOverlay` 替代）

### 3.4 决心扣减时机：立即扣 + UI 明示（Q3c 的选项 C）

失败流程：
1. `combat:ended` with `result: 'wipe'` 抛出
2. 宿主监听后：`run.determination -= 1` **立即扣**（boss 本 phase 不接入，扣减档位只有 -1）
3. 挂 `BattleResultOverlay`，UI 呈现已扣减后的 ❤️ 数值 + 按钮文案"已消耗决心"
4. [重试]：`scene.restart()`（走 `battle-runner` 已有的 restart 回调），overlay 卸载；不再额外扣决心
5. [放弃]：`run.crystals += floor(encounterRewards.crystals * 0.5)`（按当前 encounter manifest 定义的奖励 × 50%）+ `completedNodes` 追加当前节点 + phase 回 `'in-path'`；overlay 卸载
6. 若扣决心后 `run.determination <= 0`：不渲染 [重试] 或设 disabled + 文案"决心已耗尽"；玩家点 [放弃] 后走正常放弃低保，然后 store 检查决心 ≤ 0 → phase 切 `'ended'`

**为什么选择"立即扣 + UI 明示"而非"按钮点击时扣"**：
- 符合 GDD §2.14 "重试按钮 UI 明示 **重试（-1 ❤️）**" 的文案直白感
- 玩家按下前就知道已扣，避免"放弃反而不扣"的 degenerate 策略（在重试/放弃之间刷决心）
- 决心 ≤ 0 时的 UI 退化自然（看到 ❤️ = 0 + 重试按钮灰，一眼明白）

**关于 Hit Frame 与 UI 呈现的顺序**：`combat:ended` 抛出后到 overlay 渲染有若干帧延迟（Vue 组件挂载 + store 更新），玩家看到的顺序是：HP 归零动画 → 死屏定格 → 扣决心 + overlay 出现。视觉上连贯。

### 3.5 Schema bump 精细化边界（工程契约）

| 变更 | SCHEMA_VERSION | blueprintVersion | MIN_SUPPORTED | Pool manifest |
|------|:-:|:-:|:-:|:-:|
| `TowerNode.encounterId?` 字段新增（phase 4） | — | bump = 2 | — | 初版 |
| `TowerRun.blueprintVersion` 字段新增（phase 4） | **bump = 2** | (同时初始化 = 2) | — | — |
| 新节点 kind（如 `trial`）加入 `TowerNodeKind` union | — | **bump** | — | — |
| 改图生成算法 / K_SCHEDULE | — | **bump** | — | — |
| 删除 / 重命名 `TowerNodeKind` 某成员 | **bump** | **bump** | **bump** | — |
| 加 encounter YAML + manifest 条目 | — | — | — | 改 |
| 改已发布 encounter YAML 的数值 / AOE | — | — | — | — |
| 标记 encounter 为 `deprecated` | — | — | — | 改 |
| 策划误删 encounter YAML 或 manifest 条目 | ⚠️ 违规，touch 不到老存档 id 就触发 defensive fallback | | | |
| 新加 pool 类型（如 event-pool.json） | — | 若新增节点 kind 则 bump | — | 新建 |

**规则说明**：
- **SCHEMA_VERSION bump 是最硬的**：存档不匹配 → 直接 reset，玩家丢档。仅当字段 shape 不兼容（老存档反序列化崩溃）才 bump
- **blueprintVersion bump 是软的**：老存档仍能加载（通过 Registry 拿 def），但标"使用的是旧版塔设计"。未来可选做 migration
- **MIN_SUPPORTED bump 是运维级大锤**：把一批低版本存档强制作废。慎用，与项目 changelog / 公告联动

**phase 4 首次同时 bump 两个版本**：
- `TOWER_RUN_SCHEMA_VERSION`: 1 → **2**（因 `TowerRun.blueprintVersion` + `TowerNode.encounterId` 字段加入）
- `TOWER_BLUEPRINT_CURRENT`: (无) → **1**
- `TOWER_BLUEPRINT_MIN_SUPPORTED`: (无) → **1**

老存档（phase 2 / 3）` schemaVersion: 1` 会被强制 reset —— 这是已知接受的代价（phase 3 spec §9 已预告 "可 bump 也可不 bump"，phase 4 选 bump 是因为字段扩展比推断路径更干净）。

---

## 4. 状态机流转

```
             ┌────────────────────────────────────────────────────────┐
             │                       in-path                          │
             │                                                        │
             │   ┌──点击节点───► NodeConfirmPanel ─[取消]──────┐      │
             │   │                  │                          │      │
             │   │                  │ [侦察] (扣 1 💎, 缓存) ──┘      │
             │   │                  │                                 │
             │   │                  │ [进入]                          │
             │   │                  ▼                                 │
             │   │              in-combat ◄──── [重试 -1 ❤️]          │
             │   │                  │                                 │
             │   │             combat:ended                           │
             │   │                  │                                 │
             │   │          ┌───────┴────────┐                        │
             │   │        victory           wipe                      │
             │   │          │                │                        │
             │   │    mark completed     BattleResultOverlay          │
             │   │    + crystals += N    (det -= 1, 立即扣)            │
             │   │          │                │                        │
             │   │          │            ┌───┴───┐                    │
             │   │          │          [重试]  [放弃]                  │
             │   │          │            │        │                   │
             │   │          │            │    crystals += N/2         │
             │   │          │            │    mark completed          │
             │   │          │            │        │                   │
             │   │          │         scene.restart                   │
             │   │          │            │        │                   │
             │   └──────────┴────────────┘────────┘                   │
             │                                                        │
             │                                                        │
             │   若 det <= 0  ──────────────────────► ended            │
             └────────────────────────────────────────────────────────┘
                                                         │
                                                         ▼
                                                  TowerEndedScreen
                                                [返回主菜单] → resetRun
```

**phase 切换规则**：
- `in-path` → `in-combat`：玩家在 NodeConfirmPanel 点 [进入]，且节点 `kind === 'mob'`（phase 4 精英 / boss 禁用）
- `in-combat` → `in-path`：胜利（走完结算）或放弃（走完低保）
- `in-path` → `ended`：任意时刻 `run.determination <= 0` 且玩家在 `in-path`（放弃后立即判一次）
- `in-combat` 态下**不持久化** phase `in-combat` —— 由 phase 3 现有机制：`hydrate()` 永远 reset phase 到 `'no-run'`，`continueLastRun()` 根据 graph.nodes 非空推断回 `'in-path'`；战斗中关 tab 重开 → 回到地图，当前节点仍然可再点进去重打。玩家决心已扣（战斗失败后扣）的情况能被正确回复；战斗中途（未扣）关 tab 等于放弃当次战斗，回到战前状态（可接受，符合断点续玩语义）

---

## 5. 数据结构扩展

### 5.1 `TowerRun` / `TowerNode` 扩展（`src/tower/types.ts`）

```ts
export interface TowerNode {
  id: number
  step: number
  slot: number
  kind: TowerNodeKind
  next: number[]
  /** 战斗节点开局固化的 encounter id；非战斗节点 undefined；phase 5 起精英 / boss 也填 */
  encounterId?: string
}

export interface TowerRun {
  schemaVersion: number         // 现有
  /** 塔蓝图版本；开局 = TOWER_BLUEPRINT_CURRENT */
  blueprintVersion: number      // 新增
  runId: string                 // 现有
  seed: string                  // 现有
  graphSource: TowerGraphSource // 现有
  startedAt: number             // 现有
  baseJobId: BaseJobId          // 现有
  towerGraph: TowerGraph        // 现有
  currentNodeId: number         // 现有
  determination: number         // 现有
  maxDetermination: number      // 现有
  level: number                 // 现有
  crystals: number              // 现有
  currentWeapon: Weapon | null  // 现有
  advancedJobId: AdvancedJobId | null  // 现有
  materia: Materia[]            // 现有
  activatedMateria: MateriaInstanceId[]  // 现有
  relics: RelicCard[]           // 现有
  scoutedNodes: Record<number, ScoutInfo>  // 现有
  completedNodes: number[]      // 现有
}

/** phase 4 bump 到 2 */
export const TOWER_RUN_SCHEMA_VERSION = 2 as const
```

### 5.2 Blueprint 版本常量（新模块 `src/tower/blueprint/version.ts`）

```ts
/** 当前塔蓝图版本。加节点 kind / 改图生成算法 / 改 K_SCHEDULE 时 bump。 */
export const TOWER_BLUEPRINT_CURRENT = 1 as const

/**
 * 最低支持的塔蓝图版本。老存档 blueprintVersion < 此值 → 强制作废。
 * 只在 "必须掀桌" 时 bump，与 changelog / 公告联动。
 */
export const TOWER_BLUEPRINT_MIN_SUPPORTED = 1 as const
```

### 5.3 Encounter Pool Manifest（新文件 `public/tower/pools/encounter-pool.json`）

```jsonc
{
  "manifestVersion": 1,
  "entries": [
    {
      "id": "mob-frost-sprite",
      "yamlPath": "encounters/tower/mob-frost-sprite.yaml",
      "kind": "mob",
      "scoutSummary": "冰属性小精灵，会发动范围冰冻减速",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-fire-elemental",
      "yamlPath": "encounters/tower/mob-fire-elemental.yaml",
      "kind": "mob",
      "scoutSummary": "火属性元素，扇形 AOE 交替",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-chain-marker",
      "yamlPath": "encounters/tower/mob-chain-marker.yaml",
      "kind": "mob",
      "scoutSummary": "点名圈缠身，持续跑圈",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-arena-shrinker",
      "yamlPath": "encounters/tower/mob-arena-shrinker.yaml",
      "kind": "mob",
      "scoutSummary": "逐步收缩的死亡外圈",
      "rewards": { "crystals": 10 }
    },
    {
      "id": "mob-fallback",
      "yamlPath": "encounters/tower/mob-fallback.yaml",
      "kind": "mob",
      "scoutSummary": "通用敌人",
      "rewards": { "crystals": 10 },
      "deprecated": "never-in-pool"
    }
  ]
}
```

**`mob-fallback` 的特殊语义**：`deprecated` 非空 → 不进 Active Pool，新开局抽不到；但 Registry 里永远在。`resolveEncounter` 找不到目标 id 时 fallback 到此。`deprecated` 字段值语义由 UI 层自由解释（此处"`never-in-pool`" 是一个哨兵值，约定：不暴露给玩家作为历史痕迹，专门为 fallback 准备）。

### 5.3b Pool 版本化：不用 runtime 版本目录，可选人类可读历史快照

一个自然的追问：**要不要把 pool 配置按发布版本 folder 化（`pools/v2026-04-18/` / `pools/v2026-05-01/`），让 runtime 明确知道"这个存档创建时 pool 长什么样"？**

**结论：不需要 runtime 版本目录。当前单 manifest + `deprecated` 字段已足够。**

论证：
1. 存档里固化的是 id 字符串，解析走 **Registry**（manifest 里所有 entries，含 deprecated）；只要 id 仍在 manifest 里，def 就能拿到
2. **不依赖"pool 在什么时间点的快照"** —— pool 的时间维度已经被"id 永不删 + 效果替换新开 id"契约吸收了
3. 版本目录会把"数值微调"强制变成"新版本发布"，与 roguelike "敌人长期迭代" 的体验精神冲突（数值微调下一轮新局自然吃到，无需发版本）
4. 真正要严格冻结的是 **id → 核心效果** 的 contract，我们已用"效果替换必须新开 id"规则兜住

**可选 post-MVP：人类可读历史快照归档**
- Release 时跑脚本把当前 manifest copy 到 `public/tower/pools/snapshots/2026-04-18.json`
- **Runtime 不读取**，纯文档用途（方便开发者回溯"那次 release pool 长啥样"）
- 若未来有审计 / 回归需求再做；phase 4 不实装


### 5.4 Encounter Resolver API（新模块 `src/tower/pools/encounter-pool.ts`）

```ts
export interface EncounterPoolEntry {
  id: string
  yamlPath: string
  kind: 'mob' | 'elite' | 'boss'
  scoutSummary: string
  rewards: { crystals: number }
  deprecated?: string
}

interface EncounterPoolManifest {
  manifestVersion: number
  entries: EncounterPoolEntry[]
}

const FALLBACK_ENCOUNTER_ID = 'mob-fallback'

let poolCache: EncounterPoolManifest | null = null

/** 首次调用加载 manifest；之后走缓存。dev mode 可加 cache bust hook 后补。 */
export async function loadEncounterPool(): Promise<EncounterPoolManifest> { /* ... */ }

/** 按 id 走 Registry 查；找不到 → fallback + console.error（正常运营永不触发） */
export async function resolveEncounter(id: string): Promise<EncounterPoolEntry> { /* ... */ }

/** 从 Active Pool 按 seed 抽一个 id（对应 kind 过滤 + !deprecated） */
export async function pickEncounterIdFromActivePool(
  seed: string,
  nodeId: number,
  kind: 'mob' | 'elite' | 'boss',
): Promise<string> { /* ... */ }
```

### 5.5 Tower Store 扩展（`src/stores/tower.ts`）

新增 actions（其余保留 phase 3）：

```ts
/** 开始一场战斗（node.kind === 'mob'），phase 切到 in-combat */
async function enterCombat(nodeId: number): Promise<void> { /* ... */ }

/** 侦察：扣 1 水晶 + 写 scoutedNodes；水晶不足返回 false */
async function scoutNode(nodeId: number): Promise<boolean> { /* ... */ }

/** 胜利结算：mark completed + 加水晶 + phase 回 in-path */
function resolveVictory(nodeId: number, crystalsReward: number): void { /* ... */ }

/** 失败扣决心（立即），不改 phase；caller 决定挂 overlay */
function deductDeterminationOnWipe(amount: number): void { /* ... */ }

/** 放弃战斗：50% 低保 + mark completed + phase 回 in-path；触发 ended 判定 */
function abandonCurrentCombat(crystalsRewardFull: number): void { /* ... */ }

/** 检查 det <= 0 → phase 切 ended */
function checkEndedCondition(): void { /* ... */ }
```

**`startDescent()` 改造**：graph 生成后遍历节点，战斗节点（`kind === 'mob' | 'elite' | 'boss'`）调 `pickEncounterIdFromActivePool(seed, nodeId, kind)` 填 `node.encounterId`。phase 4 `elite` / `boss` 即便也填了 id，UI 层也不允许点入（NodeConfirmPanel 禁用 [进入]）；id 会在 phase 5 激活。

---

## 6. UI 组件设计

### 6.1 `NodeConfirmPanel.vue`（新）

**props**：`node: TowerNode`
**emits**：`scout` / `enter` / `cancel`

**展示逻辑**（伪 pug）：

```pug
.panel(role="dialog")
  .panel-title {{ kindLabel }}
  .panel-body
    //- 已侦察 / 非战斗节点：显示 scoutSummary
    .scout-info(v-if="hasScoutInfo")
      .enemy-summary {{ scoutSummary }}
      ul.conditions(v-if="conditions.length")
        li(v-for="c in conditions") {{ conditionLabel(c) }}
    //- 未侦察战斗节点
    .unscouted(v-else-if="isBattleNode")
      | 情报未知，进入前可侦察
  .panel-actions
    //- 侦察（仅未侦察战斗节点）
    button.btn.scout(
      v-if="canScout"
      :disabled="tower.run.crystals < 1"
      @click="$emit('scout')"
    ) 侦察（1 💎）
    //- 进入（phase 4：仅 mob 可点；其余 disabled）
    button.btn.enter(
      :disabled="!canEnter"
      @click="$emit('enter')"
    ) {{ enterLabel }}
    button.btn.cancel(@click="$emit('cancel')") 取消
```

**`kindLabel`**：按 `node.kind` 映射 `小怪` / `精英` / `Boss` / `奖励` / `篝火` / `事件` / `起点`。

**`enterLabel`**：
- `mob`：`进入战斗`
- `elite` / `boss`：`进入（phase 5 实装）` 且按钮 disabled
- `reward` / `campfire` / `event` / `start`：`通过`（点击后 store `advanceTo(nodeId)` 直接标通过，phase 4 stub）

**`canScout`**：`isBattleNode && !hasScoutInfo`（phase 4 精英 / boss 节点也允许侦察，让玩家知道 phase 5 实装前至少能看情报）

**键盘 / 关闭**：Esc 触发 cancel（沿用 `ConfirmDialog.vue` 的覆盖层模式）

### 6.2 `EncounterRunner.vue`（新，承载战斗）

**props**：
```ts
interface Props {
  encounterUrl: string
  jobId: string
  onInit?: BattleInitCallback  // 练习模式等注入 hook
}
```

**emits**：
```ts
defineEmits<{
  'combat-ended': [payload: { result: 'victory' | 'wipe'; elapsed: number }]
}>()
```

**模板**：原 `/encounter/[id].vue` 模板搬入（`#ui-root` + 全套 `Hud*` 组件）。

**lifecycle**：
- `onMounted`：`useEngine()` → `startTimelineDemo(canvas, uiRoot, encounterUrl, jobId, onInit)` → `useStateAdapter(scene)` → bridge `bus.on('combat:ended', payload => emit('combat-ended', payload))`
- `onBeforeUnmount`：`adapter.dispose()` + `disposeActiveScene()`
- `gameKey` 递增重挂模式：不由组件自己管；宿主通过 `<EncounterRunner :key="gameKey" ...>` 重挂即触发 restart

**重试流程**：宿主监听 `combat-ended(wipe)` → 挂 BattleResultOverlay → [重试] → 宿主 `gameKey++` → runner 重挂 → 战斗重开

**独立模拟器（`/encounter/[id].vue`）改造**：模板替换为 `<EncounterRunner :encounter-url="url" :job-id="jobId" :on-init="onInit" :key="gameKey" @combat-ended="..." />` + 练习模式 onInit + tutorial 跳过按钮 + HudBattleEndOverlay（保留独立模拟器的行为）。若独立模拟器的 BattleEndOverlay 当前是 scene 内部挂的（`setAnnounce` 式），需要迁移到 runner 外部挂载 —— implementer 勘查后决定。

### 6.3 `BattleResultOverlay.vue`（新，爬塔专用）

**props**：
```ts
interface Props {
  result: 'victory' | 'wipe'
  encounterRewardCrystals: number
  currentDetermination: number
}
```

**emits**：`retry` / `abandon` / `continue`（victory）

**展示逻辑**：
- `result === 'victory'`：显示 `"击败！+${encounterRewardCrystals} 💎"` + [继续] 按钮（点击 emit continue，宿主 `resolveVictory` 并回 in-path）
- `result === 'wipe'`：
  - 显示 `"你失败了"`
  - 显示 `"当前决心：${currentDetermination} ❤️"`（此时已是扣减后的值）
  - [重试]（`disabled` if det <= 0；label `"重试"`）
  - [放弃（-50% 奖励）]（label `"放弃（+${floor(encounterRewardCrystals / 2)} 💎）"`）

样式沿用 `MenuShell` / 现有 pause menu 深色半透明风格。

### 6.4 `TowerEndedScreen.vue`（新，最简尾屏）

**内容**：
- 标题：`你的攀登结束了`
- 副文案：`决心耗尽 —— 本局记录将在 phase 6 结算系统上线后转化为金币`
- 数据展示：职业 / 等级 / 水晶 / 通过节点数 / 累计游玩时长（`Date.now() - run.startedAt`）
- 按钮：[返回主菜单]（`resetRun()` → `router.push('/')` 或停在 `no-run`）

### 6.5 `/tower/index.vue` 路由分支扩展

新增分支：
```pug
//- in-combat
EncounterRunner(
  v-else-if="tower.phase === 'in-combat' && currentEncounterUrl"
  :encounter-url="currentEncounterUrl"
  :job-id="runJobId"
  :key="combatInstanceKey"
  @combat-ended="onCombatEnded"
)
BattleResultOverlay(
  v-if="showResultOverlay"
  :result="lastCombatResult"
  :encounter-reward-crystals="lastEncounterRewardCrystals"
  :current-determination="tower.run.determination"
  @retry="onRetryCombat"
  @abandon="onAbandonCombat"
  @continue="onContinueAfterVictory"
)

//- ended
TowerEndedScreen(
  v-else-if="tower.phase === 'ended'"
  :run="tower.run"
  @exit="onExitToMenu"
)
```

NodeConfirmPanel 的挂载点：`in-path` 分支内增加（作为覆盖层），受 `selectedNodeForConfirm` 控制。

**`in-path` 分支改造**：`TowerMap` 的 `onNodeClick` 不再直接调 `advanceTo`，而是触发打开 `NodeConfirmPanel` for `selectedNodeForConfirm`。

---

## 7. 战斗接入与 battle-runner 扩展

### 7.1 `combat:ended` 事件暴露

现状：`battle-runner.ts` 里 `bus.emit('combat:ended', { result: 'victory' | 'wipe' })` 已发出，但无 elapsed 时间。

**改动**：为事件 payload 添加 `elapsed: number`：
```ts
s.bus.emit('combat:ended', { result: 'victory', elapsed: scheduler.combatElapsed })
```
两处 emit 均补全（`battle-runner.ts:261` / `269` 附近）。

**事件总线类型扩展**（`src/core/event-bus.ts` 或类型声明）：
```ts
'combat:ended': { result: 'victory' | 'wipe'; elapsed: number }
```

### 7.2 Encounter URL 构造

Tower 战斗 URL：`${import.meta.env.BASE_URL}${entry.yamlPath}`（manifest 里 yamlPath 是相对路径）

独立模拟器 URL（不变）：`${base}encounters/${id}.yaml`

### 7.3 软超时的配置化实现（纯 YAML，不改 runtime）

每个小怪 YAML 共享模板：

```yaml
# encounters/tower/mob-frost-sprite.yaml
arena:
  name: Frost Cavern
  shape: circle
  radius: 15
  boundary: wall

entities:
  boss:
    type: mob                          # tower mob 节点的敌人仍用 'boss' id 接引擎死亡判定
    group: boss
    hp: 45000
    attack: 180
    speed: 3
    size: 1.2
    facing: 180
    position: { x: 0, y: 0, z: 0 }
    autoAttackRange: 4
    aggroRange: 8

player:
  position: { x: 0, y: -12, z: 0 }

boss_ai:
  chaseRange: 4
  autoAttackRange: 4
  autoAttackInterval: 3000
  aggroRange: 8

local_buffs:
  mob_enrage:
    name: 愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }

local_skills:
  boss_auto:
    name: 冰霜拳
    type: ability
    targetType: single
    requiresTarget: true
    range: 4
    effects: [{ type: damage, potency: 1 }]
  mob_enrage_stack:
    name: 愤怒（叠层）
    type: ability
    targetType: self
    requiresTarget: false
    range: 0
    effects:
      - { type: apply_buff, buffId: mob_enrage }
  mob_frost_ring:
    name: 冰环
    type: ability
    targetType: circle
    # ... AOE 定义

skills: {}

phases:
  - id: phase_default
    trigger: { type: on_combat_start }
    actions:
      - { at: 0,     action: enable_ai }
      - { at: 5000,  action: use, use: mob_frost_ring }
      - { at: 25000, action: use, use: mob_frost_ring }
      - { at: 50000, action: use, use: mob_frost_ring }
      - { at: 80000, action: use, use: mob_frost_ring }
      # 90s 软超时：自用技能叠一层愤怒 + 循环回 5s 重演机制
      - { at: 90000, action: use, use: mob_enrage_stack }
      - { at: 90001, action: loop, loop: 5000 }
```

**已核对的前置事实**：
- ✅ `local_skills` 已支持（`encounter-loader.ts:103`）
- ❌ **`local_buffs` 当前不支持**（encounter-loader 无解析路径）—— phase 4 作为 Scope IN 的一部分扩展 encounter YAML schema，加 `local_buffs` 段落解析 + 注册到 `combatResolver.buffMap`
- ✅ `apply_buff` skill effect 链路已存在（`combat-resolver.ts:84` case `apply_buff`）
- ✅ `loop` timeline action 已实装（`phase-scheduler.ts:89-93`）
- ✅ `stackable` buff 叠层语义已实装（`buff.ts:55-67`）

**需要在 implementer 阶段跑 sanity 测试确认边界**：
- `loop` 回跳后，同一 phase 内重复触发 `action: use` 对同一 self-target 是否仍然触发 skill effect（不被"cooldown 缓存" / "已施法过一次"等逻辑挡住）
- `local_buffs` 段解析后 buff 定义是否进入正确的 buffMap（不与 job-level buffMap 冲突）

---

## 8. 测试策略

### 8.1 单元测试

**`src/tower/pools/encounter-pool.test.ts`**（新）：
- `loadEncounterPool` 首次加载 + 缓存命中
- `resolveEncounter('mob-frost-sprite')` 返回对应 entry
- `resolveEncounter('non-existent')` fallback 到 `mob-fallback` + `console.error` 被调（spy）
- `pickEncounterIdFromActivePool(seed, nodeId, 'mob')` 不抽到 `deprecated` entries
- `pickEncounterIdFromActivePool` 同 seed + nodeId 多次调用结果一致（seed 稳定性）
- Active Pool 空（全部 deprecated）时抛明确错误（策划误配 guard）

**`src/stores/tower.test.ts` 扩展**（phase 3 已有则加 cases）：
- `startDescent()` 后每个战斗节点有 `encounterId` 字段；非战斗节点 `encounterId === undefined`
- `continueLastRun()` 加载 `blueprintVersion < TOWER_BLUEPRINT_MIN_SUPPORTED` 的 mock 存档 → reset + `schemaResetNotice` 设 true
- `enterCombat(nodeId)` 非 `mob` kind 报错/不切 phase
- `resolveVictory` / `abandonCurrentCombat` / `deductDeterminationOnWipe` / `checkEndedCondition` 各自数值与 phase 流转
- 决心扣到 0 后 `checkEndedCondition` phase 切 `ended`

### 8.2 Integration（encounter YAML + loop 行为）

**`src/config/encounter-loader.test.ts` 或新建 `src/config/tower-mob-yaml.test.ts`**：
- 加载 `mob-frost-sprite.yaml` 后 phases / local_skills / local_buffs 正确解析
- 模拟跑 100s → `mob_enrage` 至少叠到 2 层（90s 加一次；若 loop 工作 95s 再加一次）

### 8.3 手动 QA 清单（dev server）

合并前必做：
- [ ] `/tower` 从 no-run → 新游戏 → 选职业 → 下潜 → in-path → 点第 1 步 mob 节点 → confirm panel 显示 → 侦察 → 水晶 -1 → 二次点开直接显示已侦察态
- [ ] 点 [进入] → EncounterRunner 挂载 → 击杀小怪 → BattleResultOverlay 胜利态 → 点 [继续] → 回 in-path → 第 1 步标已通过 + 水晶 +10
- [ ] 故意送死 → BattleResultOverlay 失败态 → 决心 -1 UI 立即呈现 → [重试] → 战斗重开
- [ ] 重试胜利 → 回 in-path + 水晶正常加 + 决心保持失败后的值
- [ ] 连续送死扣到 determination=0 → [重试] disabled → [放弃] → 回 in-path → phase 切 ended → TowerEndedScreen 显示 → [返回主菜单] → resetRun
- [ ] 精英节点点击 → confirm panel 显示但 [进入] disabled 文案 "phase 5 实装"
- [ ] 非战斗节点（reward / campfire / event）点击 → confirm panel 简化版（无侦察）→ [进入] → 直接 advanceTo 标通过
- [ ] 刷新浏览器（战斗中）→ 重新打开 /tower → no-run 存档摘要显示正确 → 继续 → 恢复到 in-path + 当前节点可再点进战斗（决心为战斗前状态）
- [ ] 刷新浏览器（确认弹窗打开时）→ 重新进 /tower → confirm panel 不自动重开（短期状态不持久化）
- [ ] `/encounter/[id]` 独立模拟器仍然工作（EncounterRunner 抽离后独立模拟器回归测试）
- [ ] 练习模式（`?practice`）仍然正常注入 onInit

---

## 9. 迁移与兼容

### 9.1 Schema version bump 影响

- `TOWER_RUN_SCHEMA_VERSION`: 1 → 2
- 老存档（phase 2 / 3 产生的 `schemaVersion: 1`）加载时走 `continueLastRun` 的 reset 分支 + `schemaResetNotice`
- 已接受的代价：phase 2 / 3 的测试存档（用户自己测试 QA 累积的）会被清掉
- 无外部用户影响（phase 3 刚 squash 合并，未公开发布）

### 9.2 Blueprint version 首次引入

- `TOWER_BLUEPRINT_CURRENT = 1`、`TOWER_BLUEPRINT_MIN_SUPPORTED = 1`
- `startNewRun()` 开局自动填 `blueprintVersion: 1`
- 老存档（phase 2 / 3 的 `schemaVersion: 1`）因 schemaVersion 不匹配，进入 reset 分支前不会走到 blueprintVersion 检查。所以"老存档 blueprintVersion undefined"在正常运维路径下不会发生
- 但 `continueLastRun()` 的 blueprintVersion 检查写成 `run.blueprintVersion >= MIN_SUPPORTED`（而非 `!== undefined`）—— 确保 undefined 也走作废分支，防御未来若 schemaVersion 保持不变但 blueprintVersion 字段从未写入的奇怪场景

### 9.3 Encounter YAML 文件搬家

新建 `public/encounters/tower/` 子目录存 tower 小怪 YAML。独立模拟器的 encounter（`ifrit.yaml` / `leviathan.yaml` 等）保持在 `public/encounters/` 根目录不动。`index.json`（独立模拟器菜单）与 `pools/encounter-pool.json`（tower 抽取池）**互相独立**，各走各的。

### 9.4 Battle-runner 改造对独立模拟器的影响

`combat:ended` 事件增加 `elapsed` 字段 —— 独立模拟器（`/encounter/[id].vue`）若有监听此事件的 code path 需要同步更新；phase 3 audit 看下来独立模拟器未直接消费此事件（`HudBattleEndOverlay` 通过 `scene.battleOver` 状态判定而非事件），无冲击。

---

## 10. Phase 4 不回答的 Open Questions（留给后续 phase）

- **精英战机制马拉松实装**（DPS check / AOE 马拉松 / 小游戏各 1 个）—— phase 5
- **Boss 战 2-3 阶段 + 硬狂暴 + 决心 -2 + 超越之力 +25% 场地机制**—— phase 5
- **场地机制通用框架**（battlefield condition runtime，可配置化）—— phase 5
- **战败延迟结算（DoT 致死胜利）窗口**—— phase 5（periodic framework phase 3 已铺底）
- **死亡 buff 清除策略**（`preserveOnDeath` 标记语义）—— phase 5
- **事件节点 / 奖励节点 / 篝火节点 runtime**—— phase 5 / phase 6
- **第 0 节点 + 武器 / 策略卡 runtime**—— phase 6
- **结算系统**（放弃低保的 crystals 数字、金币换算）—— phase 6
- **Pool append-only 原则推广到其他 pool 类型**（event / relic / battlefield-condition / weapon / materia-affix）—— 各自 phase 接入时复刻 phase 4 encounter pool 模式
- **`mob-fallback` 的 UX 形态**（玩家真碰到 fallback 时的引擎 log → 开发者工具展示？用户侧透明？）—— 视实际 bug 出现频次再决定
- **Encounter manifest 的 hot reload**（dev server 改 manifest / YAML 后立即生效）—— dev QX，Vite HMR 自然带，不需额外设计
- **塔蓝图多版本共存时的目录结构**（`src/tower/blueprints/v1/` vs `v2/`）—— 第一次真正 bump 时再拆，phase 4 单版本不做预留
- **扩展"最低支持版本"的 UI / CTA**（告诉玩家"你的存档已过时，请点这里重开"）—— 暂用现有 `schemaResetNotice` 文案兼顾；phase 6 引入局外经济后做专属补偿提示
- **种子复刻强档契约**（deep snapshot 打包存档 + manifest）—— 作为 opt-in 工具（玩家导出存档分享 / QA bug 复现 / 历史种子回看）。phase 4 不做；走 `docs/tower-engineering-principles.md` §7b "强档 opt-in" 路径。每日挑战 / 种子赛**不需要**走这档，按"最新版本跑"即是公平的（行业标杆：Slay the Spire / Balatro / Dead Cells 都如此）
- **Meta progression 独立存档**（phase 6 引入金币 / 甲胄 / 抽卡 / 成就时的 `TowerMeta` 与 `TOWER_META_SCHEMA_VERSION`）—— 走 `docs/tower-engineering-principles.md` §7c 契约，phase 4 不涉及但提前在宪法文档定契约

---

## 11. 文件改动清单

### 新建

- `src/tower/blueprint/version.ts`
- `src/tower/pools/encounter-pool.ts`
- `src/tower/pools/encounter-pool.test.ts`
- `src/components/tower/NodeConfirmPanel.vue`
- `src/components/tower/EncounterRunner.vue`
- `src/components/tower/BattleResultOverlay.vue`
- `src/components/tower/TowerEndedScreen.vue`
- `src/components/tower/RunStatusBar.vue`
- `public/tower/pools/encounter-pool.json`
- `public/encounters/tower/mob-frost-sprite.yaml`
- `public/encounters/tower/mob-fire-elemental.yaml`
- `public/encounters/tower/mob-chain-marker.yaml`
- `public/encounters/tower/mob-arena-shrinker.yaml`
- `public/encounters/tower/mob-fallback.yaml`

### 修改

- `src/game/encounter-loader.ts`
  - 支持 `raw.local_buffs` 段解析；返回的 `EncounterData` 新增 `localBuffs: Record<string, BuffDef>` 字段
- `src/game/battle-runner.ts`
  - load encounter 后，`s.combatResolver.registerBuffs(encounter.localBuffs)` 注册 encounter 级 buff
  - `combat:ended` payload 添加 `elapsed: number`
- `src/tower/types.ts`
  - `TowerNode.encounterId?: string` 字段新增
  - `TowerRun.blueprintVersion: number` 字段新增
  - `TOWER_RUN_SCHEMA_VERSION` 1 → 2
- `src/stores/tower.ts`
  - `createInitialRun` 注入 `blueprintVersion: TOWER_BLUEPRINT_CURRENT`
  - `startDescent` 生成 graph 后填 `encounterId`
  - `continueLastRun` 校验 `blueprintVersion` 范围
  - 新增 action：`enterCombat` / `scoutNode` / `resolveVictory` / `deductDeterminationOnWipe` / `abandonCurrentCombat` / `checkEndedCondition`
- `src/pages/tower/index.vue`
  - 新增 `in-combat` / `ended` 分支
  - `in-path` 分支挂 NodeConfirmPanel 覆盖层
  - 计算属性 currentEncounterUrl / runJobId / lastEncounterRewardCrystals / lastCombatResult
  - 顶部挂 `RunStatusBar`（仅 run 运行中 phase 显示）
  - 去除 `ready-to-descend` / `in-path` 分支内已有的"准备下潜"副标题等与 status bar 重复的元信息
- `src/components/tower/TowerMap.vue`
  - `onNodeClick` 改为触发 confirm panel 而非直接 `advanceTo`
- `src/pages/encounter/[id].vue`
  - 模板简化为 `<EncounterRunner>` + 独立模拟器专属 overlay
- `src/core/event-bus.ts`（或事件类型声明处）
  - 更新 `'combat:ended'` 事件类型添加 `elapsed` 字段

### 可能影响（implementer 勘查）

- `src/components/hud/BattleEndOverlay.vue`：独立模拟器依赖。若目前集成在 scene 内而非页面层，需要分离渲染到 EncounterRunner 宿主页
- `src/config/schema.ts` / `src/game/encounter-loader.ts`：verify `local_buffs` / `local_skills` 是否已支持（phase 4 小怪 YAML 依赖此模式）；若不支持要么扩展 schema 要么改写 YAML 把 buff/skill 并入全局 `skills:` 段落

---

## 12. 工程契约速查（钉在项目脑门上的规则）

> 这些规则是 phase 4 的重点产出，后续 phase 必须遵守。

1. **Pool 永不删**：encounter / event / relic / condition / weapon / materia 配置一旦在正式版本发布（即曾经出现在 Active Pool 过），对应 YAML / manifest entry 永不删除。弃用改 `deprecated: <ISO-date>` 字段切换。
2. **效果替换 = 新 id**：已发布 id 的数值微调允许（玩家感知"敌人学新招"）；核心效果替换（例：`relic_venom_mastery` 从 "+20% 毒伤" 改成 "-20% 毒伤"）**必须新开 id**。
3. **存档 pool 引用走 Registry，不走 Active Pool**：`resolve<Foo>(id)` 无论 id 是否 deprecated 都返回 def；新开局走 Active Pool 抽。
4. **开局一次性 rng 固化**：`startNewRun` / `startDescent` 时把所有 pool 选择（encounter / event / reward / 第 0 节点起手包）按 seed 写进 run；此后 runtime 不再二次 rng 消费 seed。
5. **`TOWER_RUN_SCHEMA_VERSION` bump = 玩家丢档**：只在 `TowerRun` / `TowerGraph` / `TowerNode` 字段 shape 不兼容时 bump；加可选字段不 bump（老存档读到 undefined 时 runtime 降级）。
6. **`blueprintVersion` bump = 软信号**：加节点 kind / 改算法时 bump；老存档照常 load 只标版本。真正作废靠 `MIN_SUPPORTED`。
7. **`TOWER_BLUEPRINT_MIN_SUPPORTED` bump = 运维大锤**：与公告 / changelog 联动，配合专属补偿逻辑。
8. **决心扣减时机 = 失败瞬间立即扣**：不在"玩家点按钮"时扣；UI 文案明示已扣减。
9. **战斗嵌入 = 组件复用**：`/tower` 和 `/encounter/[id]` 共用 `<EncounterRunner>`，各自挂载不同 overlay；tower **永不 navigate** 到 `/encounter/[id]`。
