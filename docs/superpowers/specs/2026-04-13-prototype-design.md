# XIV Stage Play — 原型设计规格

## 概述

单人 FF14 风格 BOSS 战模拟器，核心玩法为**躲避 AOE 机制**。基于 **Babylon.js** 构建的 Web 应用，采用固定俯视角和 ARPG 风格操控。

原型阶段优先实现可游玩的战斗体验，不做时间轴编辑器或地图编辑器。BOSS 战通过手写 YAML 配置文件定义。

**时间单位约定：** 系统内所有时间值统一使用**毫秒（ms）整数**，包括配置文件和运行时。不使用后缀，数值即 ms。

## 决策记录

| 决策项       | 选择                                 | 理由                                                                                       |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| 引擎         | Babylon.js (npm SDK)                 | 内置游戏循环、Observable 事件系统、MeshBuilder 用于 AOE 几何体渲染、文档和 Playground 优秀 |
| 相机         | 固定俯视角（约 45°）                 | AOE 可见性优先于沉浸感；简化相机实现                                                       |
| 操控         | WASD + 鼠标指向 + 点击攻击           | ARPG 风格；俯视角下比 FF14 原版操控更直觉                                                  |
| 多人         | 原型不做                             | 纯单人，无 AI 队友                                                                         |
| 职业         | 原型只做一个近战职业                 | 避免弹道/投射物的额外复杂度                                                                |
| 场地         | 可配置形状（圆形 / 矩形）            | 每个战斗实例在场地配置中定义                                                               |
| 时间轴编辑器 | 原型不做                             | 手写 YAML 文件                                                                             |
| UI           | HTML/CSS overlay（不用 Babylon GUI） | 充分利用前端经验；未来可复用于编辑器                                                       |
| 时间单位     | 毫秒（ms）整数                       | 避免浮点精度问题（如 2.38s），所有配置和运行时统一                                         |

## 架构

```
┌─────────────────────────────────────────────┐
│                  UI 层                       │  HTML/CSS overlay
│  (血条、技能栏、咏唱条、飘字、               │
│   Buff/Debuff 图标、锁定指示器)              │
├─────────────────────────────────────────────┤
│                渲染层                        │  Babylon.js
│  (场景、相机、实体模型、                      │
│   AOE 预兆/生效特效)                         │
├─────────────────────────────────────────────┤
│              游戏逻辑层                       │  纯 TypeScript，引擎无关
│  ┌──────────┬──────────┬──────────────────┐ │
│  │ 战斗系统  │ 技能系统  │ 时间轴调度器      │ │
│  ├──────────┼──────────┼──────────────────┤ │
│  │ 实体管理  │ Buff系统  │ 伤害计算器       │ │
│  └──────────┴──────────┴──────────────────┘ │
├─────────────────────────────────────────────┤
│              事件总线                         │  全局事件通信
├─────────────────────────────────────────────┤
│              主循环                           │  固定时间步长游戏 tick
└─────────────────────────────────────────────┘
```

核心原则：

1. **游戏逻辑层是纯 TypeScript**——不依赖 Babylon.js。所有实体状态、技能判定、伤害计算都在此层完成，可独立进行单元测试。
2. **事件总线连接各层。** 逻辑层产生事件（`skill:cast_start`、`aoe:zone_created`、`damage:dealt`），渲染层和 UI 层订阅事件来更新视觉。各系统之间通过事件通信，不直接互相引用。
3. **逻辑帧与渲染帧严格分离**——见下方"主循环"章节。
4. **渲染层只读**——永远不修改游戏状态，只做可视化。
5. **UI 使用 HTML/CSS overlay**——基于 DOM 的 UI 充分利用前端经验，未来可复用于编辑器。

### 主循环（Fixed Timestep）

游戏逻辑使用固定时间步长推进，与渲染帧率完全解耦。无论玩家浏览器是 60fps、120fps 还是卡到 30fps，逻辑时间线始终一致。

```
常量 LOGIC_TICK = 16  // 逻辑步长 16ms（≈60 逻辑帧/秒）

每一渲染帧（requestAnimationFrame）:
  accumulator += deltaTime（距上一渲染帧的实际经过时间）

  while accumulator >= LOGIC_TICK:
    更新游戏逻辑（所有系统以 LOGIC_TICK 为步长推进）
    logicTime += LOGIC_TICK
    accumulator -= LOGIC_TICK

  渲染当前状态（可用 accumulator / LOGIC_TICK 做位置插值以平滑显示）
```

关键保证：

- **时间轴精确性：** "第 60000ms 释放技能"在任何设备上都精确触发，不受渲染帧率影响
- **技能判定一致性：** GCD（2500ms）、咏唱时间、Buff 持续时间等均按逻辑帧倒计时，不会因帧率不同产生偏差
- **渲染平滑性：** 高帧率设备可通过插值获得更平滑的移动表现，低帧率设备逻辑仍然正确，只是视觉上少画几帧

## 实体系统

游戏中一切"存在"的东西都是实体：玩家、BOSS、小怪、临时对象（AOE 锚点）。

```typescript
Entity {
  id: string
  type: 'player' | 'boss' | 'mob' | 'object'

  // 空间属性
  position: { x, y, z }       // z 仅用于跳跃；命中判定忽略 z 轴
  facing: number               // 朝向角度 (0-360)
  speed: number                // 移动速度 m/s
  size: number                 // 实体半径（视觉/碰撞参考）

  // 战斗属性
  hp: number
  maxHp: number
  attack: number               // 基础攻击力

  // 状态
  alive: boolean
  inCombat: boolean
  casting: CastState | null    // 当前咏唱状态
  gcdTimer: number             // GCD 剩余时间 (ms)
  autoAttackTimer: number      // 基础攻击间隔计时器 (ms)

  // 关联
  target: string | null        // 锁定目标的 entity id
  buffs: Buff[]                // 当前 buff/debuff 列表
  skills: Skill[]              // 技能列表（引用技能定义）
}
```

设计说明：

- **临时对象也是实体**，`type: 'object'`。无 AI、不可选中、不可攻击——纯粹作为 AOE 锚点。但由于 AoeZone 的 anchor 系统（见技能系统），大多数场景已不再需要临时实体。
- **实体管理器**统一管理生命周期：创建、销毁、按条件查询（如"查找最近的敌方实体"用于自动锁定）。
- **玩家和 BOSS 都是 Entity**——只是驱动方式不同：玩家由输入系统驱动，BOSS 由时间轴调度器驱动。
- **朝向**沿用草案的方向模型：正前方 ±45° 为正面、正后方 ±45° 为背面、左右各 ±45°。俯视角下朝向来源从"相机方向"变为"鼠标指针方向"。

## 操控

ARPG 风格俯视角操控：

| 输入            | 行为                                                                 |
| --------------- | -------------------------------------------------------------------- |
| WASD            | 屏幕方向位移（W=上, S=下, A=左, D=右）                               |
| 鼠标位置        | 角色默认朝向鼠标指针方向                                             |
| 左键 / 按住左键 | 基础攻击（使用 `autoAttackInterval` 计时）。锁定目标时：自动持续攻击 |
| 右键点击敌人    | 锁定目标                                                             |
| 1-4 键          | 释放技能栏技能，朝锁定目标释放。未锁定时自动锁定最近敌人             |
| 空格            | 跳跃（起跳瞬间确定轨迹，空中只能调整朝向）                           |
| ESC             | 打断咏唱 / 取消锁定                                                  |

基础攻击行为：

- 有固定间隔（与草案中的自动攻击间隔概念一致）
- 锁定目标时：系统自动按间隔触发攻击（对肩周炎友好，无需按住左键）
- 未锁定目标时：左键按下朝鼠标方向触发攻击，受间隔限制

## 技能系统

### 技能定义

技能不分敌我。海盗小兵可以使用和玩家战士一样的"劈砍"。谁能用什么技能由实体的 `skills` 列表控制。

```typescript
Skill {
  id: string
  name: string
  type: 'weaponskill' | 'spell' | 'ability'

  // 时间参数 (ms)
  castTime: number              // 咏唱时间（战技=0，能力技=0，魔法>=0）
  cooldown: number              // 独立 CD（GCD 技能此值为 0，由全局 GCD 管理）
  gcd: boolean                  // 是否触发 GCD

  // 目标
  targetType: 'single' | 'aoe'
  range: number                 // 最大释放距离

  // AOE 区域（targetType: 'aoe' 时使用）
  zones?: AoeZone[]

  // 直接效果（targetType: 'single' 时使用）
  effects?: SkillEffect[]
}
```

### 技能类型

**战技（Weaponskill）：** 无咏唱时间。触发 GCD。即时判定并生效。

**魔法（Spell）：** 有咏唱时间。咏唱开始时立即触发 GCD。效果在咏唱完成后才生效。两阶段判定（开始咏唱时 + 咏唱完成时）。咏唱期间禁止使用所有其他技能；移动或 ESC 可打断咏唱。打断咏唱时重置 GCD。

**能力技（Ability）：** 有独立 CD。不触发也不受 GCD 限制。可在 GCD 冷却期间使用。不受沉默影响（沉默只禁止战技和魔法）。

咏唱时间与 GCD 的边界情况（来自草案）：

- `咏唱时间 > GCD`：GCD 已冷却完成但咏唱未结束，玩家仍然无法行动，直到咏唱完成
- `咏唱时间 < GCD`：咏唱完成但 GCD 尚未冷却，玩家需等待 GCD 才能使用下一个 GCD 技能

### AOE 区域（与技能解耦）

核心设计思路：**技能只是触发器，AOE 区域是独立对象。**

```
技能 → 生成 → AoeZone(s) → 结算时产生 → 效果(s)
```

```typescript
AoeZone {
  // 锚定：区域出现在哪里？
  anchor:
    | { type: 'caster' }                          // 施法者脚下
    | { type: 'target' }                           // 目标位置快照（咏唱开始时锁定）
    | { type: 'target_live' }                      // 跟踪目标（直到结算前持续跟随）
    | { type: 'position', x: number, y: number }   // 固定世界坐标

  // 朝向：区域面朝哪个方向？（圆形/环形可忽略）
  direction:
    | { type: 'caster_facing' }                    // 施法者当前朝向
    | { type: 'toward_target' }                    // 朝向目标
    | { type: 'fixed', angle: number }             // 固定角度（如 BOSS 瞬移回场中后固定朝南）
    | { type: 'none' }                             // 无方向（圆形/环形）

  // 形状
  shape:
    | { type: 'circle', radius: number }
    | { type: 'fan', radius: number, angle: number }
    | { type: 'ring', innerRadius: number, outerRadius: number }
    | { type: 'rect', length: number, width: number }

  // 时间参数 (ms)
  telegraphDuration: number      // 预兆持续时间（0 = 不显示预兆）
  resolveDelay: number           // 从区域创建到结算的延迟
  hitEffectDuration: number      // 红色生效提示持续时间（默认 500）

  // 结算时施加给区域内实体的效果
  effects: SkillEffect[]
}
```

一个技能可以生成多个 AoeZone，以此实现复合机制：

- **左右刀：** 两个扇形 zone，通过不同的 `resolveDelay` 实现时间差
- **钢铁月环：** 圆形 zone + 环形 zone，错开结算时间
- **九字切：** 多个矩形 zone 分两批结算

### 技能释放流程

```
玩家按下 1-4 / 左键
  → 检查：是否在 GCD 中？技能是否在 CD 中？是否正在咏唱？
  → 检查：目标是否存在？（未锁定则自动锁定最近敌人）
  → 检查：目标是否在技能 range 内？

  战技 / 能力技：
    → 条件满足 → 面向目标 → 立即生效 → 发出 skill:hit 事件
    → 战技额外触发 GCD

  魔法：
    → 条件满足 → 面向目标 → 开始咏唱 → 触发 GCD
    → 咏唱期间：移动/ESC → 打断咏唱 → 重置 GCD
    → 咏唱完成 → 二次判定（目标是否仍在范围内）→ 生效 / 失败
```

### 系统杀（特殊攻击）

不走技能系统。直接 `entity.hp -= amount`，跳过所有减伤计算，发出 `damage:lethal` 事件。触发条件：

- 场地边界系统（实体出界）
- 狂暴计时器（来自时间轴配置）

## 伤害计算

沿用草案的简化系统：

### 基础伤害

```
伤害 = 施法者.attack × 技能.potency
```

Potency 是直接乘数，不是百分比。约定：BOSS 的 `attack: 1`，这样 potency 直接等于伤害值（如 potency 8000 = 8000 伤害）。玩家 `attack: 1000`，potency 2 = 2000 伤害。

### 增伤（加算）

```
实际伤害 = 基础伤害 × (1 + 增伤A + 增伤B + ...)
```

多个增伤效果叠加为加算。

### 减伤（乘算）

```
实际伤害 = 基础伤害 × (1 - 减伤A) × (1 - 减伤B) × ...
```

多个减伤效果叠加为乘算。80% + 20% 减伤 = 剩余 16% 伤害，而非 0%。

### 计算顺序

```
原始伤害 = 施法者.attack × 技能.potency
增伤后 = 原始伤害 × (1 + Σ 增伤值)
最终伤害 = 增伤后 × Π (1 - 减伤值_i)
```

## Buff / Debuff 系统

```typescript
Buff {
  id: string
  name: string
  type: 'buff' | 'debuff'
  duration: number              // ms，0 = 永久直到被移除
  stackable: boolean
  maxStacks: number

  // 效果（可以有多个）
  effects:
    | { type: 'damage_increase', value: number }     // 如 0.3 = +30%
    | { type: 'mitigation', value: number }           // 如 0.2 = 20% 减伤
    | { type: 'speed_modify', value: number }         // 如 0.5 = +50% 速度, -0.3 = -30%
    | { type: 'dot', potency: number, interval: number }  // 持续伤害，interval 为 ms
    | { type: 'hot', potency: number, interval: number }  // 持续治疗，interval 为 ms
    | { type: 'silence' }                             // 沉默（禁止战技和魔法）
    | { type: 'stun' }                                // 眩晕（禁止所有行动和移动）
}
```

移速修正规则（来自草案）：加速效果不叠加，只取最高值。加速和减速之间为加算。

## BOSS AI / 时间轴

### 关注点分离

四种独立的配置类型，在战斗实例层面组合：

```
encounters/
  ├── arenas/                    # 场地定义
  │   └── round_arena_20m.yaml
  ├── entities/                  # 实体模板（BOSS、小怪、玩家职业）
  │   ├── warrior_boss.yaml
  │   ├── pirate_grunt.yaml
  │   └── player_warrior.yaml
  ├── skills/                    # 技能定义（不分敌我）
  │   ├── melee/
  │   │   ├── heavy_swing.yaml
  │   │   └── overpower.yaml
  │   ├── magic/
  │   │   ├── fire1.yaml
  │   │   └── raidwide.yaml
  │   └── aoe/
  │       ├── left_right_cleave.yaml
  │       └── iron_chariot.yaml
  └── timelines/                 # BOSS 战斗 AI 脚本
      └── warrior_boss_p1.yaml
```

技能按**类型/风格**归类，而非按使用者归类。文件夹结构纯粹是人类的整理习惯，系统只认 id 引用。

### 场地配置

```yaml
name: 圆形竞技场
shape: circle # circle | rect
radius: 20 # 圆形场地半径
# width: 40            # 矩形场地宽度
# height: 30           # 矩形场地高度
boundary: lethal # lethal = 出界系统杀 | wall = 有墙阻挡
```

### 实体配置

```yaml
name: 试炼BOSS
type: boss
model: models/boss_warrior.glb # 模型路径（原型阶段可用几何体占位）
size: 2 # 实体半径
hp: 100000
attack: 1 # 基础攻击力=1，potency 直接等于伤害
autoAttackInterval: 3000 # ms
autoAttackRange: 5
skills:
  - melee/heavy_swing
  - aoe/left_right_cleave
  - aoe/iron_chariot
  - magic/raidwide
```

### 时间轴配置

时间轴是 **BOSS 专属的战斗 AI 脚本**。它可以引用多个场地和多个实体，在战斗过程中动态切换。

```yaml
# 场地和实体均可定义多个，通过别名引用
arenas:
  default: arenas/round_arena_20m
  broken: arenas/round_arena_broken # 碎裂后的场地，安全区不同

entities:
  boss: entities/warrior_boss
  add1: entities/pirate_grunt # P2 召唤的小怪

# 临时技能：只在这个时间轴里使用的一次性技能
local_skills:
  enrage_blast:
    name: 狂暴爆发
    type: ability
    zones:
      - shape: { type: circle, radius: 99 }
        anchor: { type: caster }
        direction: { type: none }
        effects: [{ type: damage, potency: 999999 }]

timeline:
  - at: 0
    use: melee/heavy_swing

  - at: 8000
    use: magic/raidwide

  - at: 18000
    use: aoe/left_right_cleave

  - at: 30000
    use: magic/raidwide

  - at: 40000
    loop: 0 # 从头开始循环

  # 场地切换：BOSS 踩碎地板
  - at: 60000
    action: switch_arena
    arena: broken

  # 召唤小怪
  - at: 62000
    action: spawn_entity
    entity: add1
    position: { x: 10, y: 0 }

enrage:
  time: 600000 # 10 分钟
  castTime: 10000
  skill: enrage_blast # 引用 local_skills
```

### 相对时间（语法糖）

时间轴条目支持 `then` 子事件列表，使用 `after` 描述相对于父事件的延迟时间，支持嵌套：

```yaml
timeline:
  - at: 18000
    use: aoe/left_right_cleave
    then:
      - after: 3000 # 绝对时间 = 18000 + 3000 = 21000
        use: magic/raidwide
      - after: 5000 # 绝对时间 = 18000 + 5000 = 23000
        use: aoe/iron_chariot
        then:
          - after: 2000 # 绝对时间 = 23000 + 2000 = 25000
            use: melee/heavy_swing
```

调度器在加载时将所有 `then` + `after` 展开为绝对时间的扁平列表，运行时无额外开销。

### 时间轴 action 类型

| action         | 说明                                     |
| -------------- | ---------------------------------------- |
| `use`          | 释放技能（走正常技能释放流程）           |
| `loop`         | 跳转到指定时间点，开始循环               |
| `switch_arena` | 切换场地（如地板碎裂、场景变化）         |
| `spawn_entity` | 在指定位置召唤实体（小怪、临时对象等）   |
| `lock_facing`  | 锁定/解锁 BOSS 朝向                     |

后续可按需扩展更多 action 类型。

### 时间轴调度器

职责：

- 战斗开始时加载并解析 YAML 时间轴，递归加载所有引用的场地、实体、技能资源
- 维护当前时间指针，每 tick 检查是否有到点的 action
- 根据 action 类型分发执行：调用技能系统、切换场地、召唤实体等
- 处理 `loop` 跳转
- 管理狂暴计时器

### BOSS 战斗行为（来自草案）

- **索敌：** BOSS 在常规攻击阶段始终面向攻击目标。如果玩家走出自动攻击范围，BOSS 会尝试靠近玩家。
- **咏唱期间：** BOSS 不移动也不调整朝向（和玩家一样）。BOSS 永远不会自行打断咏唱。
- **攻击失效：** 如果结算瞬间玩家已经走出技能范围，攻击未命中。BOSS 不受影响，继续按时间轴执行。
- **朝向锁定：** 某些机制需要冻结 BOSS 朝向（如瞬移回场中、固定面朝南方、释放左右刀）。时间轴应支持 `lock_facing` 操作。

## 命中判定

沿用草案的简化判定：

- 所有实体仅使用**中心点**进行命中判定（不考虑体积）
- 所有 AOE 判定只考虑**二维投影**（无 Z 轴——跳跃不能躲避 AOE）
- 实体之间无碰撞（可互相穿过）
- 场地边界碰撞使用简单的点在形状内检测

## 预兆 / 生效提示

**预兆（命中前警告）：**

- 只有敌方的范围技能显示预兆
- 视觉表现：半透明橙色区域 + 低透明度边框线，缓慢闪烁动画
- 持续时间由每个 AoeZone 的 `telegraphDuration` 配置（0 = 不显示）
- 默认：咏唱开始时即显示预兆

**生效提示（命中确认）：**

- 区域闪烁红色，持续 `hitEffectDuration`（默认 500ms），然后消失
- 默认开启。可配置为不显示（用于动画/特效替代纯色提示的场景）

## 事件总线

完整事件清单：

```
// 实体生命周期
entity:created          { entity }
entity:died             { entity, killer?, skill? }
entity:moved            { entity, from, to }
entity:facing_changed   { entity, angle }

// 战斗状态
combat:started          { entities[] }
combat:ended            { result: 'victory' | 'wipe' | 'reset' }

// 技能
skill:cast_start        { caster, skill, target? }
skill:cast_complete     { caster, skill }
skill:cast_interrupted  { caster, skill, reason }

// AOE 区域
aoe:zone_created        { zone, skill }
aoe:zone_resolved       { zone, hitEntities[] }
aoe:zone_removed        { zone }

// 伤害
damage:dealt            { source, target, skill, amount, mitigated }
damage:lethal           { target, source, reason }

// Buff
buff:applied            { target, buff, source }
buff:removed            { target, buff, reason }
buff:tick               { target, buff, tickAmount }

// 玩家输入
target:locked           { entity, target }
target:released         { entity }
```

渲染层订阅事件并更新视觉：

| 事件                    | 渲染行为                                             |
| ----------------------- | ---------------------------------------------------- |
| `entity:created`        | 在场景中创建对应 mesh（原型阶段用胶囊体/圆柱体占位） |
| `entity:moved`          | 更新 mesh 位置                                       |
| `entity:facing_changed` | 更新 mesh 旋转                                       |
| `aoe:zone_created`      | 在地面绘制半透明橙色闪烁预兆                         |
| `aoe:zone_resolved`     | 区域闪烁红色，持续 hitEffectDuration                 |
| `aoe:zone_removed`      | 移除区域 mesh                                        |
| `damage:dealt`          | 弹出伤害飘字                                         |
| `skill:cast_start`      | 显示咏唱条                                           |
| `buff:applied`          | 在 Buff 栏添加图标                                   |

## UI 元素（HTML/CSS Overlay）

| 元素           | 描述                               |
| -------------- | ---------------------------------- |
| 玩家血条       | 当前 HP / 最大 HP                  |
| BOSS 血条      | 当前 HP / 最大 HP + BOSS 名称      |
| 技能栏         | 1-4 技能槽，冷却遮罩，GCD 扫描动画 |
| BOSS 咏唱条    | 技能名称 + 咏唱进度                |
| 锁定指示器     | 锁定目标上的视觉标记               |
| 伤害飘字       | 伤害数值弹出后渐隐                 |
| Buff/Debuff 栏 | 图标 + 剩余时间倒计时              |

## 资源加载

所有配置文件和模型资源均为异步懒加载。时间轴文件作为入口，按引用链递归解析依赖：

```
加载时间轴 YAML
  → 解析 arena 引用 + entity 引用
  → 并行加载 arena YAML + entity YAML
    → entity 解析出 skills 列表 + model 路径
    → 并行加载所有 skill YAML + 模型文件
  → 全部就绪 → 初始化战斗
```

资源管理器职责：

- **按需加载：** 只加载当前战斗实际引用的资源
- **缓存去重：** 同一资源（如 `melee/heavy_swing`）被多个实体引用时只加载一次
- **加载状态追踪：** 提供加载进度，用于显示 loading 画面

## 技术栈

| 层级     | 技术                                         |
| -------- | -------------------------------------------- |
| 语言     | TypeScript                                   |
| 构建工具 | Vite                                         |
| 3D 引擎  | Babylon.js (npm: `@babylonjs/core`)          |
| 包管理器 | pnpm                                         |
| 配置格式 | YAML（战斗实例定义）                         |
| 测试     | Vitest（游戏逻辑层引擎无关，可完全单元测试） |
