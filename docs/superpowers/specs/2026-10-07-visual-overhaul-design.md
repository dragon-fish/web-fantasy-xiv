# 普通模式视觉重制

普通副本与爬塔模式共用 `GameScene` 默认渲染链路：带动画的 glTF 角色/怪物、主题场地、SDF AOE 预兆、事件驱动技能特效、场景光影。幸存者模式通过 `standardVisuals: false` 保留自己的 `SurvivorVisuals` 与配色，仅共享场景光影与后处理。

## 原则

- 渲染只读逻辑状态与 EventBus 事件，不改变任何判定。命中判定点、朝向箭头、自动攻击范围圈、仇恨扇形保留。
- 视觉提示是数据：`arena.theme`、实体 `model:`、`SkillDef.vfx` 只影响渲染；玩家模型为 `job:<jobId>`。
- 素材：角色/怪物/场景道具为 CC0 glTF（KayKit / Quaternius / poly.pizza），在 `public/models/`，见 `CREDITS.md`；特效贴图为 FF14 原版贴图（© SQUARE ENIX，非商用同人），在 `public/vfx/xiv/`，只经由 `vfx-assets.ts` 引用以便整体替换。`*.glb` 与 `*.png` 走 Git LFS。
- 模型异步加载；加载前与失败时显示程序化低多边形占位（`characters/procedural-models.ts`，幸存者模式共用）。
- 特效对象池化并设上限；粒子按（预设 × 元素色）懒建系统，同帧多次爆发共用一个 draw call。

## 场景（`renderer/scene-manager.ts`）

- 相机极角 36°、半径 38。KHR PBR Neutral 色调映射、FXAA、低强度 bloom、暗角；太阳光 PCF 阴影；辉光层 include-only。
- 材质在后处理接管时自行转线性空间；清屏色不经材质，`setAtmosphere` 内转线性。
- `shake(amplitude, ms)` 相机震动。

## 场地（`arena-theme.ts` / `arena-floor.ts` / `arena-props.ts` / `arena-renderer.ts`）

- 主题：`default` / `fire` / `water` / `wind` / `stone` / `void`，定义石砖、符文、强调色、悬崖色、光照与环境粒子色。
- 地面为 canvas 程序化贴图：环形/网格石砖、刻纹符文阵、北向菱形标记，同时生成漫反射、自发光、法线三张图。
- `wall` 边界为发光边环 + 渐隐屏障；`lethal` 为悬空平台 + 下方岩体 + 危险边光。平台顶面低于地面 2cm 防 z-fighting。
- 场外摆放 CC0 道具：石柱/拱门/断墙按主题石色重着色，水晶按强调色重着色并自发光，火炬/火盆带粒子火焰。

## AOE 预兆（`aoe-shader.ts` / `aoe-renderer.ts`）

- 圆、扇、环、矩形共用一个 SDF 着色器：边缘亮带 + 内部渐变填充 + 读条进度扫光；判定时闪白后淡出，闪白强度随面积衰减。
- 玩家技能蓝色系，敌方橙色系；击退/吸引保留方向波纹。

## 角色（`renderer/characters/`）

- `model-catalog.ts`：模型、身高、保留的武器节点、外挂武器、染色（multiply / replace）、动画角色→片段名映射；`resolveModel` 按 `entity.model` → type/size 选择；非玩家按命中半径缩放；全体视觉放大 1.3 倍（判定不变）。
- `animation-state.ts`：死亡 > 攻击/释放 > 读条 > 受击 > 移动 > 待机；受击不打断读条与攻击，移动可取消受击。
- `model-library.ts`：每场景单例，AssetContainer 缓存；角色实例克隆骨骼/动画/材质，PBR 转 StandardMaterial 并加 Fresnel 轮廓光；道具实例支持重着色。
- `character-renderer.ts`：平滑转向、动画交叉淡入、受击闪白与挤压、死亡动画后淡出（玩家保留灰色尸体，复活恢复）。

## 技能特效（`renderer/vfx/`）

- `SkillDef.vfx = { element?, delivery? }`；缺省由 `vfx-style.ts` 推断：有 zones → burst，伤害按射程分 melee / projectile，纯治疗 → heal buff，其余 → buff。职业技能对有辨识度的元素显式标注。
- `vfx-renderer.ts`：读条魔法阵、施法闪光、近战弧形斩击、弹道 + 拖尾、雷击光柱、命中闪光 + 火花、增益光环、AOE 判定冲击波 + 区域内散布爆发（`zone-sampling.ts`）、大型敌人元素光尘、死亡爆发与相机震动。
- `vfx-material.ts`：无光照加法着色器（贴图 × 色调 × 网格 visibility），支持 FF14 四分之一魔法阵贴图镜像。

## 验证

- 单测：动画状态选择与片段回退、特效风格推断、区域采样落在判定内、矩形预兆朝向与覆盖、环形预兆贴地。
- 类型检查、生产构建；浏览器实测全部副本与爬塔遭遇、九个职业的模型与技能特效、幸存者模式回归。
