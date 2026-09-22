# 幸存者状态图标

永久强化使用原版 Status 图标，不使用 Action 图标。源图为 48×64，HUD 统一高度 32px、宽度 auto（显示为 24×32），保留长宽比。

数据源：[XIVAPI Status 查询](https://v2.xivapi.com/docs/guides/search/)。通过 `https://xivapi.com/Status/{StatusID}?columns=ID,Name,IconID` 核对与现有 CDN 一致的旧版 IconID；新版 API 返回的图标编号已不同，不能直接拼入旧资源目录。

| 强化 | 原版状态 | Status ID | CDN IconID | CDN 文件夹 |
|---|---|---:|---:|---|
| 猛者强击 | Raging Strikes | 125 | 10354 | player_skill_effects |
| 神速咏唱 | Presence of Mind | 157 | 12627 | player_skill_effects |
| 以太扩张（借用） | Ley Lines | 737 | 12653 | player_skill_effects |
| 纷乱箭 | Barrage | 128 | 10356 | player_skill_effects |
| 战斗连祷 | Battle Litany | 786 | 12578 | player_skill_effects |
| 浴血 | Bloodbath | 84 | 13913 | player_skill_effects |
| 疾跑 | Sprint | 50 | 10101 | player_skill_effects |
| 星极火 | Astral Fire | 173 | 10463 | player_skill_effects |
| 灵极冰 | Umbral Ice | 176 | 10466 | player_skill_effects |
| 以太传导（借用） | Thunderhead | 3870 | 12660 | player_skill_effects |
| 前冲步·轻盈（借用） | Peloton | 1199 | 13908 | player_skill_effects |
| 前冲步·蓄势（借用） | Further Ruin | 2701 | 12690 | player_skill_effects |
| 超越之力 | The Echo | 42 | 16207 | effects |

全部沿用 `icon(folder, id)` 与现有 CDN。自定义强化仅借用图标，战斗效果以卡片文案为准。
