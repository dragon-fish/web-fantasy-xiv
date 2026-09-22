# XIV Stage Play

一个受《最终幻想14》启发的 BOSS 战模拟器，基于 Web 技术构建。

核心玩法为**躲避 AOE 机制**——在俯视角场地中观察 BOSS 的技能预兆，通过走位规避伤害。

## 特性

- **俯视角 ARPG 操控**：WASD 移动 + 鼠标瞄准 + 点击攻击
- **完整的技能系统**：战技 / 魔法 / 能力技，GCD / 独立 CD / 咏唱
- **多样的 AOE 形状**：圆形 / 扇形 / 环形 / 矩形，支持任意组合
- **BOSS 时间轴**：YAML 文件驱动的 BOSS 行为脚本
- **位移效果**：突进 / 后跳 / 击退 / 吸引
- **实体战斗反馈**：受伤小怪显示头顶血条，按玩家距离最多显示最近 24 个；伤害数字在世界空间跟随实体，橙色输出、红色受伤、绿色治疗，暴击附带 `!`
- **充能技能显示**：仍有次数时保持图标明亮，用边框显示下一次充能；耗尽后显示常规冷却遮罩
- **Buff / Debuff 系统**：增伤 / 减伤 / 易伤 / 沉默 / 眩晕，可叠加
- **技能队列 + 滑步**：500ms 预输入 + 300ms 咏唱末尾移动窗口
- **柔性相机跟随**：非线性平滑追踪
- **开发者终端**：~ 键打开，事件日志 + 指令系统

## 快速开始

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173`。

## 以太幸存者（原型）

首页「以太幸存者」或直接访问 `/survivors`。分阶段怪潮与 4 / 8 分钟 Boss 讨伐，六种自动战技、升级三选一、永久 Buff 与五级觉醒；技能名称与视觉概念借用 FF14，行为为本模式改编。

- WASD 移动并拾取经验；自动武器无需按键。
- Space 前冲步：初始 12 秒充能，起始 250ms 无敌。强化卡可减少冷却、增加充能次数。
- 前两分钟稳定发育，之后怪潮逐渐增强；4 分钟中场 Boss，8 分钟最终 Boss，击败最终 Boss 通关。Boss 战封闭圆形场地，观察咏唱与橙色预兆躲避钢铁、月环、落雷和顺劈。
- 经验结晶 20 秒后消失，邻近结晶自动合并。
- Esc 暂停；选卡时自动暂停。结算支持重新挑战。
- 怪物模型与攻击特效使用 Babylon.js 几何和共享实例；逻辑位于 `src/survivors/`，界面复用现有技能栏、Buff 栏与血条。

定向测试：`pnpm exec vitest run src/survivors`。

## Demo 关卡

| 关卡           | 说明                                                       |
| -------------- | ---------------------------------------------------------- |
| Training Dummy | 静止木人，测试玩家技能                                     |
| Boss AI Test   | 引战 / 索敌 / 追击 / 自动攻击                              |
| Timeline Test  | 扇形连斩 → 左右刀 → 吸引 → 钢铁月环 → 十字斩 → 追击 → 狂暴 |

## 操控

| 按键 | 功能                           |
| ---- | ------------------------------ |
| WASD | 移动                           |
| 鼠标 | 角色朝向                       |
| 左键 | 基础攻击（锁定目标时自动攻击） |
| 右键 | 锁定目标                       |
| 1-6  | 技能栏                         |
| Q    | 突进                           |
| E    | 后跳                           |
| ESC  | 打断咏唱 → 取消锁定 → 暂停     |
| ~    | 开发者终端                     |

## 技术栈

| 层级     | 技术       |
| -------- | ---------- |
| 语言     | TypeScript |
| 构建     | Vite       |
| 3D 引擎  | Babylon.js |
| 测试     | Vitest     |
| 配置格式 | YAML       |
| 包管理   | pnpm       |

## 架构

```
游戏逻辑层（纯 TypeScript，引擎无关）
  ├── 事件总线 · 实体管理 · 技能系统 · Buff 系统
  ├── AOE Zone 生命周期 · 伤害计算 · 位移计算
  └── 时间轴调度 · BOSS AI · 资源加载

渲染层（Babylon.js）
  └── 场景 · 实体模型 · AOE 预兆 · 命中特效

UI 层（HTML/CSS overlay）
  └── 血条 · 技能栏 · 咏唱条 · 伤害飘字 · Buff 栏 · 时间轴显示器
```

## 自定义 BOSS

在 `public/encounters/` 中编写 YAML 文件即可定义新的 BOSS 战。参考 `timeline-test.yaml`。

## Asset Copyright Notice

Most assets (icons, images, etc.) under `public/assets/` are sourced from FINAL FANTASY XIV and are copyrighted by SQUARE ENIX CO., LTD.

This project is a personal, non-commercial fan work created solely for the purpose of learning game development. It is not intended for profit.

> FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.

## License

[GPL-3.0](./LICENSE)
