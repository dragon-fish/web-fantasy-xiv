# 爬塔模式延后项总账（Deferred Backlog）

> 跨 phase 累积的延后项总账。任何 phase 收尾时若主动砍掉某项内容 / 系统 / 优化，都应在此入账，标注**砍掉的项 / 砍掉的理由 / 重启触发条件 / 推荐落地 phase**。
>
> 后续 phase 启动前应过一眼此文档，自然知道"前面欠了什么债"。
>
> 与 `docs/tower-engineering-principles.md`（工程宪法）平级 —— 宪法是契约，本文档是债务台账。
>
> 入账格式：`[来源 phase]-D-[流水号]`，按来源 phase 分组排序。

---

## Phase 4

> Phase 4 收尾时未单独建 backlog 文档。回查 phase 4 spec / plan 后补录如下（如有遗漏请追加）：

| ID | 砍掉的项 | 砍掉理由 | 重启触发条件 | 推荐落地 phase |
|---|---|---|---|---|
| P4-D-01 | 强档种子复刻（manifest snapshot 打包导出） | 行业默认走弱档 + 同版本断点续玩；强档无 MVP 需求 | QA bug 复现工具 / 玩家分享存档需求出现时 | post-MVP 工具 |
| P4-D-02 | Pool 版本目录化（`pools/v2026-04-18/`） | Append-only id + Active Pool 切换已覆盖核心需求；版本目录会强制把数值微调变成"新版本发布"，与 roguelike 体验冲突 | 真有"完整冻结某 release pool 用于历史回看"需求时 | 不推荐落地 |

---

## Phase 5

| ID | 砍掉的项 | 砍掉理由 | 重启触发条件 | 推荐落地 phase |
|---|---|---|---|---|
| P5-D-01 | 精英"小游戏向"机制（跳舞机 / 质数机器人 / 限时方向键序列等） | 引擎缺非战斗判定 runtime（输入序列收集 / 强制 HP 改写 / 答题阶段判定 / 踩圈赋值等），phase 5 强行做会推爆 scope | 引擎新增非战斗判定 runtime；或确定 minigame 翻译为"高密度方向 AOE"的简化版 | 7+ 专项 minigame phase |
| P5-D-02 | 事件 outcome 扩容（魔晶石 / 武器 / 局外持续 buff / 战前 next-battle buff 等） | Phase 5 之前没有魔晶石 / 武器系统；持续 N 节点 buff 是新框架且与 phase 6 策略卡重叠 | Phase 6 materia / weapon 系统就位 | 6 |
| P5-D-03 | 事件池扩容（→ GDD 暗示的 20+ 完整池） | MVP 5 个事件够跑闭环 | Outcome 类型扩容后（P5-D-02 已落地） | 6+ |
| P5-D-04 | Echo 视觉补血（`instant_heal_pct` 第二条款，FF14 战栗模式） | Idle regen 已兜住"血条 80% 起步"视觉 corner case；`instant_heal` effect type 新增需独立设计 | 调优期发现 echo 强度不够 / 决定不依赖 idle regen | 任意调优窗口 |
| P5-D-05 | 其他词条 modifier effect type（`crit_rate_modifier` / `crit_damage_modifier` / `skill_speed_modifier`） | Phase 5 echo 只用攻击 / 减伤 / maxHp 三项；其他词条 modifier 无消费者 | Phase 6 魔晶石词条系统启动 | 6 |
| P5-D-06 | `preserveOnDeath` 真消费场景（raise / 战斗内 respawn） | Phase 5 玩家死亡走"重挂战斗 = 全新 entity"路径，preserveOnDeath 跑不出与不写它有差别的 outcome；hook 已建好 | 设计 raise 机制 / 战斗内 respawn 系统 | 7+ |
| P5-D-07 | Determination interceptor 真实使用者（策略卡 / 系统 buff / 成就被动） | Phase 5 interceptors 数组永远空；入口 API 已建好 | 策略卡系统启动 | 7 |
| P5-D-08 | Determination interceptor UI 浮字反馈（`cancelReason` 显示） | 无真 interceptor 时无内容可显示；UI 框架成本小 | 首个真 interceptor 接入时 | 7 |
| P5-D-09 | Battlefield condition 扩容（电场 / 二阶段狂暴 / 深层迷宫专属机制等） | Phase 5 框架已建好；纯加 pool entry，宪法 §2 不 bump 任何版本 | 任意时间，需新机制时 | 6+ |
| P5-D-10 | Event requirement 扩容操作符（`$not / $or / $and / $in`） | MVP 5 个事件用基础比较器够 | 真有事件需要复杂条件时 | 任意 |
| P5-D-11 | Phase 3 polish backlog（boss 血条 debuff / DoT 跳字 / buff apply-remove 浮字 / 雷达图 / portrait 接入） | 与 phase 5 主线无关，独立施工 | 单独窗口 | 任意 polish 窗口 |
| P5-D-12 | F5 刷新后玩家所在 phase 4 战斗节点的语义补全 | Phase 4 收尾标 backlog；phase 5 未动 | UX polish 窗口 | 6+ |

---

## 入账操作 SOP

新 phase 收尾时，把本 phase 砍掉的项追加到表格，遵守 **ID 规范**：`P{phase}-D-{流水}`。

每条至少包含：
- **砍掉的项**：具体到组件 / 字段 / 系统名
- **砍掉理由**：通常是"成本不匹配 phase 边界" / "依赖未来系统" / "MVP 不需要"等
- **重启触发条件**：什么条件成立时应该重新 review 是否落地
- **推荐落地 phase**：合理估计；估不出可写"任意"

每条**永不删除**（即使已落地）—— 落地后改 ID 状态：在表格末尾加 "状态" 列标 `done @ phase X` 或 `superseded by ...`。这样未来开发者 / agent 能看见演化历史。

---

## 与工程宪法的关系

工程宪法（`docs/tower-engineering-principles.md`）是**契约** —— 定义"该怎么做"。
本文档是**台账** —— 记录"暂时没做的"。

两者协作：契约保证已建系统不互相背叛；台账保证砍掉的需求不会被遗忘 / 被悄悄变成"永远不做"。
