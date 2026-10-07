# 普通模式视觉重制

普通副本与爬塔模式共用 `GameScene` 默认渲染链路，本次把胶囊 + 球体替换为带动画的角色/怪物模型，补齐技能特效、AOE 预兆、场地与光影。幸存者模式保留自己的 `SurvivorVisuals`，但同样受益于场景级光影升级。

## 原则

- 渲染只读逻辑状态与 EventBus 事件，不改变任何判定。命中判定点、朝向、自动攻击范围圈、仇恨扇形保留，重新美化但不可删除。
- 素材：角色/怪物用 CC0 glTF（Quaternius / Kenney），放在 `public/models/`；特效贴图用 CC0 粒子包与 FF14 原版特效贴图（非商用同人，FFXIV Materials Usage License），放在 `public/vfx/`。二进制素材走 Git LFS。
- 模型异步加载，加载完成前及加载失败时用程序化低多边形模型兜底，战斗不等待素材。
- 每类特效有数量上限并复用对象；粒子系统按元素预建、按需 emit。

## 场景（`renderer/scene-manager.ts`）

- ACES 色调映射、FXAA、低强度 bloom、暗角；GlowLayer 让发光材质自然泛光。
- 太阳光投射阴影，角色模型注册为投影者，地面接收阴影。
- 场景对外暴露 `addShadowCaster(mesh)` 与 `glow` 供其它渲染器使用。

## 场地（`renderer/arena-renderer.ts` + `renderer/arena-theme.ts`）

- YAML `arena.theme` 选择主题：`default` / `fire` / `water` / `wind` / `stone` / `void`。主题定义地面石砖色、刻纹符文色、边缘光、背景色与环境光色调。
- 地面为程序化着色器：石砖、同心符文环、径向暗角；`lethal` 边界是悬空平台侧壁 + 边缘危险光带，`wall` 边界是发光矮墙。
- 场外装饰（石柱、碎石、火盆/水晶）按主题环绕摆放，不进入可走区域。
- 地面网格名保持 `arena-ground`。

## AOE 预兆（`renderer/aoe-renderer.ts`）

- 圆、扇、环、矩形统一使用 SDF 着色器：中心淡、边缘亮的渐变填充 + 明亮描边，读条进度从中心向外推进的扫光。
- 击退/吸引保留方向波纹。命中瞬间亮闪后淡出，并通知特效系统按形状播放冲击。
- 玩家技能用蓝色系，敌方橙色系。

## 角色（`renderer/characters/`）

- `model-catalog.ts`：纯函数，按 `entity.model`（YAML `model:` 或职业 id）解析模型、缩放、染色；未指定时按 `type` 与 `size` 选通用模型。
- `animation-state.ts`：纯函数，按存活、受击、攻击、读条、移动决定动画片段与优先级。
- `model-library.ts`：加载并缓存 glTF（AssetContainer），实例化时克隆骨骼与动画组；程序化兜底模型取自幸存者模式的造型方法。
- `character-renderer.ts`：实现 `EntityVisuals`，替代 `EntityRenderer` 成为默认实体渲染器。职责：模型实例、平滑转向、动画混合、受击闪白与压缩、死亡动画后淡出（玩家保留灰色尸体）、脚下判定点 + 朝向箭头 + 目标环 + 仇恨扇形。
- `Entity` 新增可选 `model` 字段，仅供渲染层读取。玩家由职业 id 赋值。

## 技能特效（`renderer/vfx/`）

- `SkillDef` 新增可选 `vfx` 字段：`{ element, delivery }`。`element`：physical / fire / ice / lightning / holy / dark / wind / water / heal；`delivery`：melee / projectile / burst / buff。缺省时按技能类型、目标类型推断。
- `vfx-style.ts`：纯函数解析最终风格。
- `vfx-renderer.ts`：替代 `HitEffectRenderer`。读条时脚下魔法阵；完成时按 delivery 播放挥砍弧 / 弹道 + 拖尾 / 目标处爆发；`damage:dealt` 播放命中火花；AOE 判定时按形状播放冲击；治疗与增益播放上升光粒。

## 验证

- 单测：模型解析、动画状态选择、特效风格推断、AOE 着色器参数（形状 → uniform）。
- 类型检查、生产构建。
- 浏览器实测：伊弗利特、利维亚桑、朱雀、木人、教程、爬塔遭遇；各职业释放技能；死亡与重开；幸存者模式回归。
