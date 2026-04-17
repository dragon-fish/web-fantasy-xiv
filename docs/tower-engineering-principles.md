# 爬塔模式工程宪法

> 这份文档记录爬塔模式（tower mode）的长期工程原则。内容是**契约**，不是实现细节。
> 任何新 phase / 新 pool / 新字段的设计都必须先过这份文档，与契约冲突的方案需要先修契约再改设计。
>
> 起源：phase 4（2026-04-18 前后）为应对"页游强制热更新 vs 存档长期有效"这对矛盾而敲定的一套抗变机制。后续 phase 按此扩展。

---

## 1. 三层版本体系

爬塔存档的兼容性由三个**正交**的版本号维度联合管控：

| 维度 | 变更触发 | 对老存档的影响 |
|------|---------|-------------|
| **`TOWER_RUN_SCHEMA_VERSION`** | `TowerRun` / `TowerGraph` / `TowerNode` 的**字段 shape** 不兼容变更 | 不匹配 → 强制 reset + 提示条 |
| **`TOWER_BLUEPRINT_CURRENT`**（蓝图版本） | 节点类型 union 增删改 / 图生成算法 / K_SCHEDULE | 老存档照常加载；仅标记"使用旧蓝图" |
| **`TOWER_BLUEPRINT_MIN_SUPPORTED`** | 必须让一批低版本存档作废时（运维大锤） | 老存档 < MIN_SUPPORTED → 强制 reset |

**规则**：

1. **SCHEMA_VERSION bump = 玩家丢档**。只在字段 shape 不兼容（老存档反序列化会崩）时 bump。**加可选字段不 bump**（`field?: T` 老存档读到 `undefined` 由 runtime 降级）。
2. **blueprintVersion bump = 软信号**。加节点 kind、改图生成算法时 bump；老存档照常加载，只是标"这局用的是旧蓝图"。将来可做 migration。
3. **MIN_SUPPORTED bump = 运维掀桌**。与 changelog / 公告联动；配合专属补偿逻辑（如金币返还）使用。
4. **Pool 内容变更（encounter / event / relic / 场地机制 / 武器 / 魔晶石）永远不 bump 任何版本**。由 §2 的 Registry / Active Pool 机制吸收。

**check 顺序**（`continueLastRun` 加载时的优先级）：
```
1. schemaVersion 不匹配  → reset + schemaResetNotice
2. blueprintVersion < MIN_SUPPORTED  → reset + blueprintObsoleteNotice
3. blueprintVersion > CURRENT（降级运行？）  → defensive reset + error log
4. 通过 → 正常 load
```

---

## 2. Pool Registry / Active Pool 分离

所有"可抽取的池子型内容"（encounter / event / relic / battlefield-condition / weapon / materia-affix）共享同一套存储模式。

### 概念

| 概念 | 语义 | 变更规则 |
|------|------|---------|
| **Registry**（全量定义表） | 所有**曾经发布过**的 id → def 映射。存档**解析**走这里 | **append-only**。已发布 id 永不删、永不改 id、永不改核心效果 |
| **Active Pool**（当前版本抽取候选） | 新开局 rng 从这里抽 | 可增可减，通过 `deprecated` 字段切换 |

### 物理实现

每个 pool 类型一个 manifest JSON：
```
public/tower/pools/
  encounter-pool.json         # phase 4
  event-pool.json             # phase 5
  relic-pool.json             # phase 6
  battlefield-condition-pool.json   # phase 5
  weapon-pool.json            # phase 6
  materia-affix-pool.json     # phase 6
```

Manifest 格式（以 encounter 为例）：
```jsonc
{
  "manifestVersion": 1,
  "entries": [
    {
      "id": "mob-frost-sprite",
      "yamlPath": "encounters/tower/mob-frost-sprite.yaml",
      // ... 其他 metadata
    },
    {
      "id": "mob-old-retired",
      "yamlPath": "encounters/tower/archive/mob-old-retired.yaml",
      "deprecated": "2026-05-01"
    }
  ]
}
```

- **Registry** = 所有 entries（含 deprecated）
- **Active Pool** = `!deprecated` 的 entries 子集
- **`deprecated` 字段**：ISO 日期字符串，UI 层可选择展示"此内容已于 YYYY-MM-DD 归档"；runtime 不特殊处理

### 契约

1. **Pool 永不删**：配置一旦在正式版本发布过（曾经出现在 Active Pool 过），对应 YAML 文件 + manifest entry 永不删除。弃用改 `deprecated: <ISO-date>` 切换。
2. **效果替换 = 新 id**：数值微调 / AOE 半径微调 / 对白改文案 允许直接改原 YAML（玩家感知"敌人长期迭代"）；**核心效果替换**（例：`relic_venom_mastery` 从 "+20% 毒伤" 改成 "-20% 毒伤"）**必须新开 id**（`relic_venom_mastery_v2`）。display name 可以相同；id 层严格独立。
3. **解析走 Registry，抽取走 Active Pool**：存档里的 id 通过 `resolve<Foo>(id)` 解析到 Registry 里的 def，**不管是否 deprecated**；新开局的随机抽取走 `pickFromActivePool(seed, ...)`，**自然不会碰到 deprecated 的 id**。
4. **Defensive fallback**：如果 `resolve<Foo>(id)` 真的找不到（策划误删 YAML / manifest entry），返回一个 guaranteed-exists 的 fallback（如 `mob-fallback.yaml`）+ `console.error`。这是"策划 bug"的兜底，正常运营路径永不触发。

### 存档与路径解耦

**存档里只存 `id` 字符串，不存任何 YAML 路径**。Manifest 的 `yamlPath` 字段只活在 manifest 里 —— 这意味着：

- 挪 YAML 文件 = 改 manifest 对应 entry 的一个字段；存档完全透明
- 批量重组（加 prefix、按 theme 分子目录）= IDE 一次 find-replace 搞定
- **不需要**把 id 和 path 拆到两个文件里维护（拆开反而增加"两处同步"的负担，实际节省操作为 0）

### 为什么不用 runtime 版本目录

一个看似更"严谨"的方案是把 pool 按发布版本 folder 化（`pools/v2026-04-18/` / `pools/v2026-05-01/`），存档里记录 `poolVersion`，runtime 按 version load。但我们**不采用**，理由：

1. 存档里固化的是 id 字符串，解析走 Registry 就够，**不需要"pool 在某时间点的快照"这个维度**
2. 版本目录会把"数值微调"强制变成"新版本发布"（因为 manifest 要重新 copy），与 roguelike "敌人长期迭代" 的体验精神冲突
3. 真正要严格冻结的是 **id → 核心效果** 的 contract，我们已用"效果替换 = 新 id"规则兜住了
4. 运维负担大（每次 hotfix 都要拷文件夹）

**可选 post-MVP**：release 时跑脚本把当时 manifest copy 到 `public/tower/pools/snapshots/<date>.json`，纯人类可读，runtime 不读。方便开发者回溯。phase 4 不做。

---

## 3. 开局一次性 rng 固化

`startNewRun` / `startDescent` 时把所有受 rng 影响的 pool 选择**一次性物化进存档字段**：

| 时机 | 固化内容 | 字段 |
|------|---------|------|
| `startDescent` | 每个战斗节点的 encounter 选择 | `TowerNode.encounterId` |
| `startDescent`（phase 5） | 每个事件节点的 event 选择 | `TowerNode.eventId` |
| `startDescent`（phase 5） | 每个奖励节点的 reward 选择 | `TowerNode.rewardId` |
| `startNewRun`（phase 6） | 第 0 节点的武器 3 选 1 候选 + 策略卡 3 选 1 候选 | `TowerRun.startingPack` |
| `startDescent`（phase 5） | 每个战斗节点挂的场地机制列表 | `TowerNode.conditionIds[]` |

**好处**：

- 开局后 `seed` 在 pool 维度**失去作用**——所有 pool 选择已物化
- Scout 缓存 / 战斗实际内容永远对得上（都走同一个固化 id 解析）
- 跨版本"pool 扩容"不会改变老存档的战斗序列
- seed 唯一用途退化为"图结构生成"（但 graph 本身也物化了，所以 seed 其实只在初始生成一次后不再参与 runtime）

**Rng 决定序列**：使用 `seededRandom(seed, nodeId, namespace)` 这样 namespaced 的 hash —— namespace 字符串区分不同用途（`'encounter'` / `'event'` / `'reward'`），保证同一 seed 的多个抽取维度互不干扰。namespace 本身进 seed 后不能改（会改变老存档重新生成时的抽取结果；但这是运行期不会发生的事）。

---

## 4. 侦察缓存 = 历史快照语义

`TowerRun.scoutedNodes[nodeId]` 记录玩家当时侦察到的信息（敌人简述 / 场地机制列表）。**写入后永不回填**：

- 即使该 encounter 后续数值改版 / 新版 deprecated / 弃用了，scoutedNodes 里的文本**保持原样**
- 玩家看到的侦察信息是"当时视角下的信息"
- 若战斗实际内容与侦察对不上（例如 encounter 数值调整），玩家视角下这是"敌人学了新招"的自然事件，比"侦察信息被凭空篡改"更符合 roguelike 精神

---

## 5. 数据与引擎分离（GDD §7.4 复述）

项目总原则（爬塔模式特别强调）：

- **所有可调参**（节点权重 / encounter 数值 / 事件效果 / 策略卡池 / 魔晶石词条概率 / 敌人参数）**以外部配置存在**（YAML / JSON）
- 代码只负责消费数据，**不 hard-code 数值**（`const BOSS_HP = 999999` 这种写在配置里而不是代码里）
- 设计师调参不需要 implementer 介入

**与 Pool Registry 的关系**：Registry / Active Pool 是"数据与引擎分离"的一个具体落地形态。

---

## 6. 不 navigate，单路由状态机

Tower 模式整局只停留在 `/tower` 路由。战斗入口也在 `/tower` 内嵌渲染（通过 `<EncounterRunner>` 组件），**不 navigate 到 `/encounter/[id]`**。

**原因**：

- URL 不承载游戏状态 → 浏览器 back / URL 改 id 不会导致状态错乱
- 作弊门槛提高（虽然 DevTools 改 store 仍可作弊，但客户端防御线至少提高一层）
- `/encounter/[id]` 保留为独立模拟器入口；**不接受 `?tower=*` 参数**（若有，丢弃并 warn）

**组件复用**：`<EncounterRunner>` 同时服务 `/tower` 和 `/encounter/[id]`；两者挂载不同的 overlay（爬塔用 `BattleResultOverlay` 扣决心，模拟器用 `HudBattleEndOverlay` 纯重试）。

---

## 7. 战斗结束的归属

战斗结束事件（`combat:ended`）由战斗引擎抛出，**语义上属于战斗引擎层**。Tower 模式通过 `<EncounterRunner>` 桥接成 Vue emit `@combat-ended` 上抛给宿主。

**宿主责任**（tower store + `/tower/index.vue`）：
- 决定胜利 / 失败的后果（标记 completed / 扣决心 / 发奖励 / phase 切换）
- 决定 UI 呈现（挂哪种 overlay）
- 决定重试逻辑（gameKey 递增重挂 EncounterRunner）

**战斗引擎不知道"爬塔"这个概念**——`battle-runner.ts` / `GameScene` 永远只讲战斗语义（胜利 / 失败 / 重试 / 暂停）。爬塔语义（决心 / 水晶 / 节点）全部在宿主层处理。

---

## 7b. 种子复刻契约 —— 只保证"同版本断点续玩"

**行业参考**：Slay the Spire / Balatro / Dead Cells 的做法 —— seed 只在同版本内保证复刻；跨版本靠社交契约（公告或客户端自动同步最新 pool）。

**本项目契约**（两档）：

| 档 | 覆盖场景 | 成本 | phase 4 状态 |
|---|---------|------|-------------|
| **弱**（默认） | 同机器同版本断点续玩；每日种子 / 种子赛（**让所有玩家跑最新 pool**，不打包 snapshot，公平自动达成） | 0 | ✅ 默认 |
| **强**（opt-in） | 玩家手动导出存档分享 / QA bug 复现 / 历史回看（deep snapshot 打包 manifest + 存档）| 几 MB / 存档 | ⛔ post-MVP 工具，不默认 |

**为什么种子赛不需要"中档"打包 pool snapshot**：
- 每日挑战通常**服务端下发 seed**，所有玩家都运行在最新客户端 / 最新 pool
- 同 seed + 同 pool = 自动产生相同序列，公平性自动成立
- 若未来要"历史赛事回看"（我想重跑 v1.2.3 发布时的 seed），才需要 strong 档 + snapshot 归档

**强档只作为 opt-in 导出功能存在**：在调试面板 / 玩家分享入口挂一个 "导出存档"按钮，打包时把当时的 manifest snapshot 一起序列化。默认路径永不做 deep snapshot。

---

## 7c. Meta vs In-Run 存档分离

**行业参考**：Balatro / Hades / Enter the Gungeon —— 永久解锁 / 金币 / 成就（**meta progression**）与**当前这一局**（in-run state）存在**不同文件**，各自独立 version 化。

**理由**：
- Meta progression 是玩家积累的**长期资产**（几个月的投入），绝不允许因 in-run 字段调整而丢
- In-run state 是临时的（单局 30 min），偶尔因重大更新失效可以接受（参考 Dead Cells 的"current run will reset"公告模式）
- 分开后 schema 变更影响面可控：改 `TowerRun` 字段不会波及玩家的金币 / 甲胄 / 抽卡历史

**本项目落地**（phase 6 实装 meta progression 时必须遵守）：

| 实体 | 存储位置 | Schema 维度 | 变更影响 |
|------|---------|------------|---------|
| **In-run state** (`TowerRun`) | IndexedDB key `tower:run` | `TOWER_RUN_SCHEMA_VERSION` + `blueprintVersion` + `MIN_SUPPORTED` | 可失效 |
| **Meta progression** (`TowerMeta`，phase 6 新引入) | IndexedDB key `tower:meta` | **独立** `TOWER_META_SCHEMA_VERSION` + `TOWER_META_MIN_SUPPORTED` | 极力避免失效；改字段用 **migration** 而非 reset |

Meta 字段示例（phase 6）：
```ts
interface TowerMeta {
  schemaVersion: number
  gold: number
  ownedArmor: ArmorInstance[]
  cardPulls: PullRecord[]
  achievements: string[]
  // ...
}
```

**Meta schema 变更优先走 migration**：加字段默认值、删字段忽略；尽量不 reset meta（玩家长期资产损失不可接受）。

---

## 8. Seeded PRNG

所有随机操作必须用 seeded PRNG（`src/tower/graph/random.ts` 或类似），**禁用 `Math.random()`**。

**好处**：
- 断点续玩可重现
- 每日种子 / 种子赛（post-MVP）天然支持
- QA 可以用 seed 复现 bug

**使用姿势**：`seededRandom(seed, ...keys)` —— keys 区分不同用途（nodeId + namespace 等），避免同 seed 下多次抽取撞车。

---

## 9. 死亡 buff 清除策略

（phase 5 实装；phase 4 铺底）

- 死亡默认清除所有 buffs（FF14 raise 语义）
- `BuffDef.preserveOnDeath?: boolean` 开关 —— 带此标记的 buff 死亡时保留
- 适用场景：超越之力 / 决心相关 buff / 场地持久机制等

---

## 10. 战败延迟结算（DoT 致死胜利）

（phase 5 实装；phase 3 periodic framework 已铺底）

玩家 HP 到 0 后不立即判负，进入"倒地判定窗口"（例如 10s 或持续到 boss 身上所有 DoT 过期），期间 boss 身上的 DoT tick 继续跑。若 boss 在窗口内被 DoT 打死 → 玩家胜。致敬 FF14 绝境战召唤师 DoT 首杀经典。

---

## 11. 更新这份文档

这份文档**是契约**。当你发现：

- 某个新设计和契约冲突 → 先改契约 + 跟团队对齐 + 再改设计
- 某个契约在实际工程中不 work → 改契约、记录 rationale
- 新 phase 引入了新的抗变需求 → 补契约条目

修改契约的 commit message 前缀用 `docs(tower-principles):`。

---

## 附录 A：版本号 bump 速查

| 变更类型 | SCHEMA | blueprint | MIN_SUP | Pool |
|----------|:------:|:---------:|:-------:|:----:|
| 加可选字段（例：`TowerNode.encounterId?`） | — | — | — | — |
| `TowerRun` 加必填字段 | ✅ | — | — | — |
| 改字段类型 | ✅ | — | — | — |
| 改 union 成员名（rename） | ✅ | ✅ | — | — |
| 加 `TowerNodeKind` 成员 | — | ✅ | — | — |
| 删 `TowerNodeKind` 成员 | ✅ | ✅ | ✅ | — |
| 改图生成算法 / K_SCHEDULE | — | ✅ | — | — |
| 加 encounter / event / relic 到 pool | — | — | — | 改 manifest |
| 标 encounter deprecated | — | — | — | 改 manifest |
| 改 encounter YAML 数值 | — | — | — | — |
| 改 encounter YAML 核心效果（语义）| — | — | — | **新 id + 旧 id deprecated** |
| 删 encounter YAML 文件（**禁止！**）| — | — | — | — |
| 必须作废一批低版本存档 | — | — | ✅ | — |

---

## 附录 B：历史 Phase 与本文档的关联

- **Phase 2**（塔图生成）：引入 `TOWER_RUN_SCHEMA_VERSION = 1`；尚无 blueprint 概念，整局用单一 schemaVersion 管
- **Phase 3**（基础职业）：不 bump schemaVersion（`TowerRun` shape 不变，只加 phase union 成员 + 新 action）
- **Phase 4**（战斗节点接入）：引入三层版本体系 + Pool Registry / Active Pool 分离 + 开局固化 + 种子复刻弱档契约；bump `SCHEMA_VERSION` 1 → 2；初始化 `blueprintVersion = 1` / `MIN_SUPPORTED = 1`
- **Phase 6**（局外 meta progression）：引入 `TowerMeta` 独立存档 + 独立 `TOWER_META_SCHEMA_VERSION` + migration 优先原则
- **Phase 5+**：按本文档扩展
