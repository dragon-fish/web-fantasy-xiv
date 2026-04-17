# Plan C — 可视化与交互 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Babylon.js 渲染、输入系统、UI Overlay，最终产出可在浏览器中游玩的原型——圆形场地中央站着一个无 AI 木人，玩家可以移动、攻击、释放技能。

**Architecture:** 渲染层订阅 EventBus 事件更新视觉，输入系统捕获键鼠操作驱动游戏逻辑，UI 层用 HTML/CSS overlay 显示血条/技能栏等。Demo 场景将所有模块串联。

**Tech Stack:** TypeScript, Babylon.js (`@babylonjs/core`), Vite, HTML/CSS

**Spec:** `docs/specs/2026-04-13-prototype-design.md`

---

## 文件结构

```
src/
  renderer/
    scene-manager.ts          # Babylon.js 场景初始化（引擎、相机、灯光、地面）
    entity-renderer.ts        # 实体 mesh 创建/更新/销毁（订阅事件）+ 被击闪白
    aoe-renderer.ts           # AOE 预兆/生效渲染（订阅事件）
    arena-renderer.ts         # 场地渲染（地面 + 边界线）
    hit-effect-renderer.ts    # 单体攻击命中特效（箭头飞行 + 目标闪白）
  input/
    input-manager.ts          # 键鼠输入捕获 → 游戏操作
    input-manager.test.ts
  ui/
    ui-manager.ts             # UI 总管（创建/更新所有 UI 组件）
    hp-bar.ts                 # 血条组件
    skill-bar.ts              # 技能栏组件（1-4 + GCD 扫描）
    cast-bar.ts               # 咏唱条组件
    damage-floater.ts         # 伤害飘字
    buff-bar.ts               # Buff/Debuff 图标栏
    lock-indicator.ts         # 锁定指示器
    main-menu.ts              # 主菜单（加载关卡入口）
    pause-menu.ts             # 暂停菜单（ESC 触发）
  devtools/
    dev-terminal.ts           # 开发者终端（~键展开，事件日志 + 指令输入）
    dev-terminal.test.ts
    commands.ts               # 终端指令注册表
    commands.test.ts
  demo/
    demo-scene.ts             # Demo 入口：串联所有模块，创建木人场景
    player-controller.ts      # 玩家控制器：连接输入 → 实体 → 技能系统
    player-controller.test.ts
  index.ts                    # 更新导出
index.html                    # Vite 入口 HTML
src/main.ts                   # 浏览器入口，主菜单 → demo
```

---

### Task 1: 安装 Babylon.js + HTML 入口

**Files:**
- Modify: `package.json`
- Create: `index.html`
- Create: `src/main.ts`

- [ ] **Step 1: 安装依赖**

```bash
pnpm add @babylonjs/core minimist
pnpm add -D @types/minimist
```

- [ ] **Step 2: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>XIV Stage Play</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #game-canvas { width: 100%; height: 100%; display: block; outline: none; }
    #ui-overlay {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; font-family: 'Segoe UI', sans-serif; color: #fff;
    }
    #ui-overlay > * { pointer-events: auto; }
  </style>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <div id="ui-overlay"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 src/main.ts（占位）**

```typescript
// src/main.ts
import { startDemo } from './demo/demo-scene'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const uiRoot = document.getElementById('ui-overlay') as HTMLDivElement

startDemo(canvas, uiRoot)
```

- [ ] **Step 4: 创建占位的 demo-scene.ts**

```typescript
// src/demo/demo-scene.ts
export function startDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  console.log('XIV Stage Play — Demo starting...', canvas, uiRoot)
}
```

- [ ] **Step 5: 验证 dev server 启动**

```bash
pnpm dev
```

在浏览器打开，确认控制台输出 "Demo starting..."。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml index.html src/main.ts src/demo/demo-scene.ts
git commit -m "chore: add Babylon.js, HTML entry, and demo scaffold"
```

---

### Task 2: 场景管理器（Babylon.js 初始化）

**Files:**
- Create: `src/renderer/scene-manager.ts`

- [ ] **Step 1: 实现 SceneManager**

```typescript
// src/renderer/scene-manager.ts
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } from '@babylonjs/core'

export class SceneManager {
  readonly engine: Engine
  readonly scene: Scene
  readonly camera: ArcRotateCamera

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true })

    this.scene = new Scene(this.engine)
    this.scene.clearColor.set(0.12, 0.12, 0.14, 1)  // dark gray

    // Fixed top-down camera (~45° angle)
    // alpha=0 faces south, beta=0 is straight down; beta~0.8 ≈ 45°
    this.camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,  // alpha: rotation around Y
      Math.PI / 3,    // beta: ~60° from top (good for ARPG)
      40,             // radius: distance from target
      Vector3.Zero(),
      this.scene,
    )
    // Disable user camera control (fixed view)
    this.camera.attachControl(canvas, false)
    this.camera.inputs.clear()

    // Lighting
    const light = new HemisphericLight('light', new Vector3(0, 1, -0.3), this.scene)
    light.intensity = 0.9
  }

  /** Follow a world position (e.g. player) */
  followTarget(x: number, y: number): void {
    this.camera.target.set(x, 0, y)
  }

  startRenderLoop(onBeforeRender: () => void): void {
    this.engine.runRenderLoop(() => {
      onBeforeRender()
      this.scene.render()
    })
  }

  dispose(): void {
    this.engine.dispose()
  }
}
```

- [ ] **Step 2: 验证——更新 demo-scene 使用 SceneManager**

```typescript
// src/demo/demo-scene.ts
import { SceneManager } from '@/renderer/scene-manager'

export function startDemo(canvas: HTMLCanvasElement, _uiRoot: HTMLDivElement): void {
  const sceneManager = new SceneManager(canvas)

  sceneManager.startRenderLoop(() => {
    // Game loop will go here
  })

  window.addEventListener('resize', () => sceneManager.engine.resize())
}
```

`pnpm dev` → 浏览器应显示暗灰色背景的 3D 场景。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/scene-manager.ts src/demo/demo-scene.ts
git commit -m "feat: implement SceneManager with fixed top-down camera and lighting"
```

---

### Task 3: 场地渲染

**Files:**
- Create: `src/renderer/arena-renderer.ts`

- [ ] **Step 1: 实现 ArenaRenderer**

```typescript
// src/renderer/arena-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Color4,
  type Scene,
} from '@babylonjs/core'
import type { ArenaDef } from '@/core/types'

export class ArenaRenderer {
  constructor(scene: Scene, arenaDef: ArenaDef) {
    if (arenaDef.shape.type === 'circle') {
      this.createCircleArena(scene, arenaDef.shape.radius)
    } else {
      this.createRectArena(scene, arenaDef.shape.width, arenaDef.shape.height)
    }
  }

  private createCircleArena(scene: Scene, radius: number): void {
    // Ground disc
    const ground = MeshBuilder.CreateDisc('arena-ground', {
      radius,
      tessellation: 64,
    }, scene)
    ground.rotation.x = Math.PI / 2 // flat on ground

    const mat = new StandardMaterial('arena-mat', scene)
    mat.diffuseColor = new Color3(0.35, 0.35, 0.38)  // gray
    mat.specularColor = Color3.Black()
    ground.material = mat

    // Boundary ring (thin white torus)
    const boundary = MeshBuilder.CreateTorus('arena-boundary', {
      diameter: radius * 2,
      thickness: 0.1,
      tessellation: 64,
    }, scene)
    boundary.position.y = 0.05

    const boundaryMat = new StandardMaterial('boundary-mat', scene)
    boundaryMat.diffuseColor = new Color3(0.9, 0.9, 0.9)
    boundaryMat.emissiveColor = new Color3(0.3, 0.3, 0.3)
    boundary.material = boundaryMat
  }

  private createRectArena(scene: Scene, width: number, height: number): void {
    const ground = MeshBuilder.CreateGround('arena-ground', {
      width,
      height,
    }, scene)

    const mat = new StandardMaterial('arena-mat', scene)
    mat.diffuseColor = new Color3(0.35, 0.35, 0.38)  // gray
    mat.specularColor = Color3.Black()
    ground.material = mat

    // Boundary lines (thin white boxes)
    const thickness = 0.1
    const lineHeight = 0.2
    const sides = [
      { name: 'top', w: width, h: thickness, x: 0, z: height / 2 },
      { name: 'bottom', w: width, h: thickness, x: 0, z: -height / 2 },
      { name: 'left', w: thickness, h: height, x: -width / 2, z: 0 },
      { name: 'right', w: thickness, h: height, x: width / 2, z: 0 },
    ]

    const boundaryMat = new StandardMaterial('boundary-mat', scene)
    boundaryMat.diffuseColor = new Color3(0.9, 0.9, 0.9)
    boundaryMat.emissiveColor = new Color3(0.3, 0.3, 0.3)

    for (const side of sides) {
      const box = MeshBuilder.CreateBox(`boundary-${side.name}`, {
        width: side.w, height: lineHeight, depth: side.h,
      }, scene)
      box.position.set(side.x, lineHeight / 2, side.z)
      box.material = boundaryMat
    }
  }
}
```

- [ ] **Step 2: 在 demo-scene 中使用**

更新 `src/demo/demo-scene.ts`：

```typescript
import { SceneManager } from '@/renderer/scene-manager'
import { ArenaRenderer } from '@/renderer/arena-renderer'
import type { ArenaDef } from '@/core/types'

const DEMO_ARENA: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'lethal',
}

export function startDemo(canvas: HTMLCanvasElement, _uiRoot: HTMLDivElement): void {
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, DEMO_ARENA)

  sceneManager.startRenderLoop(() => {})
  window.addEventListener('resize', () => sceneManager.engine.resize())
}
```

`pnpm dev` → 应看到灰色圆形地面 + 白色边界环。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/arena-renderer.ts src/demo/demo-scene.ts
git commit -m "feat: implement ArenaRenderer for circle and rect arenas"
```

---

### Task 4: 实体渲染

**Files:**
- Create: `src/renderer/entity-renderer.ts`

- [ ] **Step 1: 实现 EntityRenderer**

```typescript
// src/renderer/entity-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  TransformNode, Vector3,
  type Scene,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'

interface EntityMeshGroup {
  root: TransformNode
  body: any          // capsule body
  hitPoint: any      // small dot at feet center (hit detection point)
  facingArrow: any   // arrow showing facing direction
  rangeRing?: any    // auto-attack range ring at feet
  aggroFan?: any     // aggro detection fan (boss only, semi-transparent)
}

export class EntityRenderer {
  private meshes = new Map<string, EntityMeshGroup>()

  constructor(private scene: Scene, private bus: EventBus) {
    bus.on('entity:created', (payload: { entity: Entity }) => {
      this.createMesh(payload.entity)
    })

    bus.on('entity:died', (payload: { entity: Entity }) => {
      this.removeMesh(payload.entity.id)
    })
  }

  private createMesh(entity: Entity): void {
    const root = new TransformNode(`entity-${entity.id}`, this.scene)
    root.position.set(entity.position.x, 0, entity.position.y)

    const color = this.getColor(entity.type)
    const height = entity.type === 'boss' ? 3 : 1.8
    const radius = entity.size || 0.5

    // Body: capsule = cylinder + two hemisphere caps
    const body = MeshBuilder.CreateCapsule(`body-${entity.id}`, {
      height: height,
      radius: radius,
      tessellation: 16,
      subdivisions: 6,
    }, this.scene)
    body.position.y = height / 2
    body.parent = root

    const bodyMat = new StandardMaterial(`mat-${entity.id}`, this.scene)
    bodyMat.diffuseColor = color
    bodyMat.alpha = 0.85
    body.material = bodyMat

    // Hit detection point: small dark sphere at feet center
    const hitPoint = MeshBuilder.CreateSphere(`hit-${entity.id}`, {
      diameter: 0.2,
      segments: 8,
    }, this.scene)
    hitPoint.position.y = 0.05
    hitPoint.parent = root

    const hitMat = new StandardMaterial(`hit-mat-${entity.id}`, this.scene)
    hitMat.diffuseColor = new Color3(0.1, 0.1, 0.1)
    hitMat.emissiveColor = new Color3(0.2, 0.2, 0.2)
    hitPoint.material = hitMat

    // Facing arrow: cone pointing forward, flat on ground
    const facingArrow = MeshBuilder.CreateCylinder(`facing-${entity.id}`, {
      height: 0.6,
      diameterTop: 0,
      diameterBottom: 0.25,
      tessellation: 8,
    }, this.scene)
    // Lay cone flat, pointing along +Z (forward in local space)
    facingArrow.rotation.x = Math.PI / 2
    facingArrow.position.set(0, 0.08, radius + 0.4)
    facingArrow.parent = root

    const arrowMat = new StandardMaterial(`arrow-mat-${entity.id}`, this.scene)
    arrowMat.diffuseColor = color.scale(1.3) // slightly brighter than body
    arrowMat.emissiveColor = color.scale(0.3)
    facingArrow.material = arrowMat

    // Auto-attack range ring: thin torus at feet
    let rangeRing: any = null
    const autoAtkRange = (entity as any).autoAttackRange
    if (autoAtkRange && autoAtkRange > 0) {
      rangeRing = MeshBuilder.CreateTorus(`range-${entity.id}`, {
        diameter: autoAtkRange * 2,
        thickness: 0.04,
        tessellation: 48,
      }, this.scene)
      rangeRing.position.y = 0.02
      rangeRing.parent = root

      const rangeMat = new StandardMaterial(`range-mat-${entity.id}`, this.scene)
      rangeMat.diffuseColor = color.scale(0.6)
      rangeMat.emissiveColor = color.scale(0.15)
      rangeMat.alpha = 0.3
      rangeRing.material = rangeMat
    }

    // Aggro detection fan (boss/mob only): very faint 120° fan
    let aggroFan: any = null
    if (entity.type === 'boss' || entity.type === 'mob') {
      const fanRange = autoAtkRange || 5
      aggroFan = MeshBuilder.CreateDisc(`aggro-${entity.id}`, {
        radius: fanRange,
        tessellation: 48,
        arc: 120 / 360,  // 120° aggro cone
      }, this.scene)
      aggroFan.rotation.x = Math.PI / 2  // lay flat
      aggroFan.position.y = 0.01
      aggroFan.parent = root

      const aggroMat = new StandardMaterial(`aggro-mat-${entity.id}`, this.scene)
      aggroMat.diffuseColor = new Color3(1, 1, 0.6)
      aggroMat.emissiveColor = new Color3(0.2, 0.2, 0.1)
      aggroMat.alpha = 0.08  // very faint
      aggroFan.material = aggroMat
    }

    this.meshes.set(entity.id, { root, body, hitPoint, facingArrow, rangeRing, aggroFan })
  }

  /** Call each render frame to sync positions */
  updateAll(entities: Entity[]): void {
    for (const entity of entities) {
      const group = this.meshes.get(entity.id)
      if (!group) continue

      // Position: game x,y → Babylon x,z
      group.root.position.set(entity.position.x, 0, entity.position.y)

      // Facing: game degrees (0=north/+y, clockwise) → Babylon rotation.y
      // Babylon Y rotation: 0=+z, clockwise when viewed from above
      // Game: 0=+y(north)=+z(babylon), so direct mapping in radians
      group.root.rotation.y = (entity.facing * Math.PI) / 180
    }
  }

  private removeMesh(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return
    group.root.dispose()
    this.meshes.delete(entityId)
  }

  /** Flash entity bright for 100ms on hit */
  flashHit(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return

    const mat = group.body.material as StandardMaterial
    const original = mat.emissiveColor.clone()
    mat.emissiveColor = Color3.White().scale(0.6)

    setTimeout(() => {
      mat.emissiveColor = original
    }, 100)
  }

  private getColor(type: string): Color3 {
    switch (type) {
      case 'player': return new Color3(0.4, 0.85, 0.4)    // light green
      case 'boss': return new Color3(0.4, 0.7, 0.95)      // light blue
      case 'mob': return new Color3(0.4, 0.7, 0.95)       // light blue (same as boss)
      default: return new Color3(0.5, 0.5, 0.5)           // gray
    }
  }
}
```

- [ ] **Step 2: 在 demo-scene 中创建玩家和木人实体**

更新 `src/demo/demo-scene.ts`：

```typescript
import { SceneManager } from '@/renderer/scene-manager'
import { ArenaRenderer } from '@/renderer/arena-renderer'
import { EntityRenderer } from '@/renderer/entity-renderer'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { GameLoop } from '@/core/game-loop'
import type { ArenaDef } from '@/core/types'

const DEMO_ARENA: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'lethal',
}

export function startDemo(canvas: HTMLCanvasElement, _uiRoot: HTMLDivElement): void {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const gameLoop = new GameLoop()

  // Renderer
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, DEMO_ARENA)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)

  // Create entities
  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -5, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5,
  })
  player.inCombat = true

  const dummy = entityMgr.create({
    id: 'dummy', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 999999, maxHp: 999999, attack: 0,
    speed: 0, size: 1.5,
  })

  // Game loop
  let lastTime = performance.now()

  gameLoop.onUpdate((_dt) => {
    // Logic updates will go here (input, skills, etc.)
  })

  sceneManager.startRenderLoop(() => {
    const now = performance.now()
    const delta = now - lastTime
    lastTime = now

    gameLoop.tick(delta)
    entityRenderer.updateAll(entityMgr.getAlive())
    sceneManager.followTarget(player.position.x, player.position.y)
  })

  window.addEventListener('resize', () => sceneManager.engine.resize())
}
```

`pnpm dev` → 应看到灰色圆形场地中央一个淡蓝色胶囊体（木人），南侧一个淡绿色胶囊体（玩家）。每个实体脚下有：黑色小圆点（判定点）、前方小箭头（朝向）、淡色范围环（自动攻击距离）。木人脚下还有极淡的 120° 扇形（索敌范围）。

- [ ] **Step 3: Commit**

```bash
git add src/renderer/entity-renderer.ts src/demo/demo-scene.ts
git commit -m "feat: implement EntityRenderer with placeholder meshes and facing indicators"
```

---

### Task 5: 输入系统

**Files:**
- Create: `src/input/input-manager.ts`
- Create: `src/input/input-manager.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/input/input-manager.test.ts
import { describe, it, expect } from 'vitest'
import { InputState, computeMoveDirection, computeFacingAngle } from '@/input/input-manager'

describe('computeMoveDirection', () => {
  it('should return (0,1) for W only', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: false, d: false })
    expect(dir.x).toBeCloseTo(0)
    expect(dir.y).toBeCloseTo(1)
  })

  it('should return normalized diagonal for W+D', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: false, d: true })
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
    expect(len).toBeCloseTo(1)
    expect(dir.x).toBeGreaterThan(0)
    expect(dir.y).toBeGreaterThan(0)
  })

  it('should return (0,0) when no keys', () => {
    const dir = computeMoveDirection({ w: false, a: false, s: false, d: false })
    expect(dir.x).toBe(0)
    expect(dir.y).toBe(0)
  })

  it('should cancel out opposing keys', () => {
    const dir = computeMoveDirection({ w: true, a: false, s: true, d: false })
    expect(dir.x).toBe(0)
    expect(dir.y).toBe(0)
  })
})

describe('computeFacingAngle', () => {
  it('should compute angle from entity to mouse in game coords', () => {
    // Entity at origin, mouse directly north (+y in screen = +y in game)
    // But screen Y is inverted: mouse above entity means smaller screenY
    // We pass world-space mouse position, so mouse at (0, 5) = north
    const angle = computeFacingAngle({ x: 0, y: 0 }, { x: 0, y: 5 })
    expect(angle).toBeCloseTo(0, 0) // 0° = north
  })

  it('should compute 90° for mouse to the east', () => {
    const angle = computeFacingAngle({ x: 0, y: 0 }, { x: 5, y: 0 })
    expect(angle).toBeCloseTo(90, 0)
  })
})
```

- [ ] **Step 2: 实现 InputManager**

```typescript
// src/input/input-manager.ts
import type { Vec2 } from '@/core/types'

export interface InputState {
  w: boolean
  a: boolean
  s: boolean
  d: boolean
}

export interface MouseState {
  /** Mouse position in world XY coordinates */
  worldPos: Vec2
  leftDown: boolean
  rightDown: boolean
}

export function computeMoveDirection(keys: InputState): Vec2 {
  let x = 0
  let y = 0
  if (keys.w) y += 1
  if (keys.s) y -= 1
  if (keys.d) x += 1
  if (keys.a) x -= 1

  if (x === 0 && y === 0) return { x: 0, y: 0 }

  const len = Math.sqrt(x * x + y * y)
  return { x: x / len, y: y / len }
}

export function computeFacingAngle(entityPos: Vec2, mouseWorldPos: Vec2): number {
  const dx = mouseWorldPos.x - entityPos.x
  const dy = mouseWorldPos.y - entityPos.y
  if (dx === 0 && dy === 0) return 0
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
}

export class InputManager {
  readonly keys: InputState = { w: false, a: false, s: false, d: false }
  readonly mouse: MouseState = { worldPos: { x: 0, y: 0 }, leftDown: false, rightDown: false }
  readonly skillPressed: (number | null)[] = [null, null, null, null]

  private pendingSkill: number | null = null
  private escPressed = false

  constructor(private canvas: HTMLCanvasElement) {
    this.bindEvents()
  }

  /** Returns and clears pending skill press (1-4 → index 0-3) */
  consumeSkillPress(): number | null {
    const skill = this.pendingSkill
    this.pendingSkill = null
    return skill
  }

  /** Returns and clears ESC press */
  consumeEsc(): boolean {
    const esc = this.escPressed
    this.escPressed = false
    return esc
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.w = true; break
        case 'KeyA': this.keys.a = true; break
        case 'KeyS': this.keys.s = true; break
        case 'KeyD': this.keys.d = true; break
        case 'Digit1': this.pendingSkill = 0; break
        case 'Digit2': this.pendingSkill = 1; break
        case 'Digit3': this.pendingSkill = 2; break
        case 'Digit4': this.pendingSkill = 3; break
        case 'Escape': this.escPressed = true; break
      }
    })

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.w = false; break
        case 'KeyA': this.keys.a = false; break
        case 'KeyS': this.keys.s = false; break
        case 'KeyD': this.keys.d = false; break
      }
    })

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.leftDown = true
      if (e.button === 2) this.mouse.rightDown = true
    })

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.leftDown = false
      if (e.button === 2) this.mouse.rightDown = false
    })

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  /** Call each frame with projected mouse world position */
  updateMouseWorldPos(worldPos: Vec2): void {
    this.mouse.worldPos = worldPos
  }

  dispose(): void {
    // In production, would remove event listeners. For prototype, no-op.
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/input/input-manager.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/input/
git commit -m "feat: implement InputManager with WASD, mouse, skill keys, and ESC"
```

---

### Task 6: 玩家控制器

**Files:**
- Create: `src/demo/player-controller.ts`
- Create: `src/demo/player-controller.test.ts`

- [ ] **Step 1: 编写测试**

```typescript
// src/demo/player-controller.test.ts
import { describe, it, expect } from 'vitest'
import { applyMovement } from '@/demo/player-controller'
import { createEntity } from '@/entity/entity'

describe('applyMovement', () => {
  it('should move entity by direction * speed * dt', () => {
    const entity = createEntity({
      id: 'p1', type: 'player',
      position: { x: 0, y: 0, z: 0 },
      speed: 6,
    })
    applyMovement(entity, { x: 1, y: 0 }, 16) // 6 m/s * 0.016s = 0.096m
    expect(entity.position.x).toBeCloseTo(0.096)
    expect(entity.position.y).toBeCloseTo(0)
  })

  it('should not move when direction is zero', () => {
    const entity = createEntity({
      id: 'p1', type: 'player',
      position: { x: 5, y: 3, z: 0 },
      speed: 6,
    })
    applyMovement(entity, { x: 0, y: 0 }, 16)
    expect(entity.position.x).toBe(5)
    expect(entity.position.y).toBe(3)
  })
})
```

- [ ] **Step 2: 实现 PlayerController**

```typescript
// src/demo/player-controller.ts
import type { Entity } from '@/entity/entity'
import type { Vec2 } from '@/core/types'
import type { InputManager } from '@/input/input-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { EntityManager } from '@/entity/entity-manager'
import type { EventBus } from '@/core/event-bus'
import type { SkillDef } from '@/core/types'
import type { Arena } from '@/arena/arena'
import { computeMoveDirection, computeFacingAngle } from '@/input/input-manager'

export function applyMovement(entity: Entity, direction: Vec2, dt: number): void {
  if (direction.x === 0 && direction.y === 0) return
  const distance = entity.speed * (dt / 1000)
  entity.position.x += direction.x * distance
  entity.position.y += direction.y * distance
}

export class PlayerController {
  constructor(
    private player: Entity,
    private input: InputManager,
    private skillResolver: SkillResolver,
    private buffSystem: BuffSystem,
    private entityMgr: EntityManager,
    private bus: EventBus,
    private skills: SkillDef[],
    private arena: Arena,
    private autoAttackInterval: number,
  ) {}

  /** Returns 'pause' if ESC should trigger pause menu (no higher-priority action consumed it) */
  update(dt: number): 'pause' | null {
    // ESC priority chain: interrupt cast → release target → pause
    if (this.input.consumeEsc()) {
      if (this.player.casting) {
        this.skillResolver.interruptCast(this.player)
      } else if (this.player.target) {
        this.player.target = null
        this.bus.emit('target:released', { entity: this.player })
      } else {
        return 'pause'
      }
    }

    // Movement (blocked while casting or stunned)
    if (!this.player.casting && !this.buffSystem.isStunned(this.player)) {
      const dir = computeMoveDirection(this.input.keys)
      if (dir.x !== 0 || dir.y !== 0) {
        // Moving interrupts casting
        if (this.player.casting) {
          this.skillResolver.interruptCast(this.player)
        }

        const speedMod = this.buffSystem.getSpeedModifier(this.player)
        const modifiedSpeed = this.player.speed * (1 + speedMod)
        const distance = modifiedSpeed * (dt / 1000)
        this.player.position.x += dir.x * distance
        this.player.position.y += dir.y * distance

        // Clamp to arena
        const clamped = this.arena.clampPosition({
          x: this.player.position.x,
          y: this.player.position.y,
        })
        this.player.position.x = clamped.x
        this.player.position.y = clamped.y
      }
    }

    // Facing follows mouse
    this.player.facing = computeFacingAngle(
      { x: this.player.position.x, y: this.player.position.y },
      this.input.mouse.worldPos,
    )

    // Right click: lock target (pick nearest enemy near mouse)
    if (this.input.mouse.rightDown) {
      const nearest = this.entityMgr.findNearest(
        this.player.id,
        (e) => e.type !== 'player' && e.type !== 'object' && e.alive,
      )
      if (nearest && this.player.target !== nearest.id) {
        this.player.target = nearest.id
        this.bus.emit('target:locked', { entity: this.player, target: nearest })
      }
    }

    // Skill keys 1-4
    const skillIdx = this.input.consumeSkillPress()
    if (skillIdx !== null && skillIdx < this.skills.length) {
      // Auto-lock nearest enemy if no target
      if (!this.player.target) {
        const nearest = this.entityMgr.findNearest(
          this.player.id,
          (e) => e.type !== 'player' && e.type !== 'object' && e.alive,
        )
        if (nearest) {
          this.player.target = nearest.id
          this.bus.emit('target:locked', { entity: this.player, target: nearest })
        }
      }
      this.skillResolver.tryUse(this.player, this.skills[skillIdx])
    }

    // Auto-attack when target locked (left click or auto)
    if (this.player.target && this.player.inCombat) {
      this.player.autoAttackTimer += dt
      if (this.player.autoAttackTimer >= this.autoAttackInterval) {
        this.player.autoAttackTimer -= this.autoAttackInterval
        // Use first skill (basic attack) as auto-attack
        if (this.skills.length > 0) {
          this.skillResolver.tryUse(this.player, this.skills[0])
        }
      }
    }

    // Tick GCD / casting
    this.skillResolver.update(this.player, dt)
    this.skillResolver.updateCooldowns(this.player, dt)
    this.buffSystem.update(this.player, dt)

    return null
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
pnpm test:run src/demo/player-controller.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/demo/player-controller.ts src/demo/player-controller.test.ts
git commit -m "feat: implement PlayerController with movement, facing, targeting, skills, auto-attack"
```

---

### Task 7: AOE 预兆渲染

**Files:**
- Create: `src/renderer/aoe-renderer.ts`

- [ ] **Step 1: 实现 AoeRenderer**

```typescript
// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'

interface AoeMesh {
  mesh: Mesh
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
}

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()
  private telegraphMat: StandardMaterial
  private resolveMat: StandardMaterial

  constructor(private scene: Scene, bus: EventBus) {
    // Telegraph: semi-transparent orange, pulsing
    this.telegraphMat = new StandardMaterial('aoe-telegraph', scene)
    this.telegraphMat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    this.telegraphMat.emissiveColor = new Color3(0.5, 0.3, 0.0)
    this.telegraphMat.alpha = 0.3

    // Resolve: red flash
    this.resolveMat = new StandardMaterial('aoe-resolve', scene)
    this.resolveMat.diffuseColor = new Color3(1.0, 0.0, 0.0)
    this.resolveMat.emissiveColor = new Color3(0.8, 0.0, 0.0)
    this.resolveMat.alpha = 0.5

    bus.on('aoe:zone_created', (payload: { zone: ActiveAoeZone }) => {
      this.createMesh(payload.zone)
    })

    bus.on('aoe:zone_resolved', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      if (entry) {
        entry.phase = 'resolve'
        entry.mesh.material = this.resolveMat
      }
    })

    bus.on('aoe:zone_removed', (payload: { zone: ActiveAoeZone }) => {
      this.removeMesh(payload.zone.id)
    })
  }

  /** Call each frame to animate telegraph pulse */
  update(time: number): void {
    const pulse = 0.2 + Math.sin(time * 0.005) * 0.1
    this.telegraphMat.alpha = pulse
  }

  private createMesh(zone: ActiveAoeZone): void {
    const { shape } = zone.def
    let mesh: Mesh

    switch (shape.type) {
      case 'circle':
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
        }, this.scene)
        break

      case 'fan': {
        // Approximate fan with a disc sector using custom mesh or full disc
        // For prototype, use a disc and note it's approximate
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
          arc: shape.angle / 360,
        }, this.scene)
        break
      }

      case 'ring':
        // Use a torus as approximation
        mesh = MeshBuilder.CreateTorus(`aoe-${zone.id}`, {
          diameter: shape.innerRadius + shape.outerRadius,
          thickness: shape.outerRadius - shape.innerRadius,
          tessellation: 48,
        }, this.scene)
        mesh.position.y = 0.02
        this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph' })
        mesh.material = this.telegraphMat
        return // torus doesn't need the rotation below

      case 'rect':
        mesh = MeshBuilder.CreatePlane(`aoe-${zone.id}`, {
          width: shape.width,
          height: shape.length,
        }, this.scene)
        break

      default:
        return
    }

    // Lay flat on ground
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(zone.center.x, 0.02, zone.center.y)

    // Apply facing rotation (around Y axis)
    mesh.rotation.y = -(zone.facing * Math.PI) / 180

    mesh.material = this.telegraphMat

    this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph' })
  }

  private removeMesh(zoneId: string): void {
    const entry = this.meshes.get(zoneId)
    if (!entry) return
    entry.mesh.dispose()
    this.meshes.delete(zoneId)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/aoe-renderer.ts
git commit -m "feat: implement AoeRenderer with telegraph and resolve visuals"
```

---

### Task 8: 单体攻击命中特效

**Files:**
- Create: `src/renderer/hit-effect-renderer.ts`

- [ ] **Step 1: 实现 HitEffectRenderer**

```typescript
// src/renderer/hit-effect-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Vector3,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityRenderer } from './entity-renderer'

interface FlyingArrow {
  mesh: Mesh
  from: Vector3
  to: Vector3
  elapsed: number
  duration: number  // ms
  targetId: string
}

const ARROW_FLY_DURATION = 200  // ms

export class HitEffectRenderer {
  private arrows: FlyingArrow[] = []

  constructor(
    private scene: Scene,
    private bus: EventBus,
    private entityRenderer: EntityRenderer,
  ) {
    // Listen for single-target skill hits
    bus.on('skill:cast_complete', (payload: { caster: Entity; skill: any }) => {
      const caster = payload.caster
      const skill = payload.skill
      if (!skill || skill.targetType !== 'single' || !caster.target) return

      // We need target position — look up from scene
      // The demo will pass entity positions via the event or we read from entity
      this.spawnArrow(caster, caster.target)
    })
  }

  private spawnArrow(caster: Entity, targetId: string): void {
    const arrow = MeshBuilder.CreateCylinder('hit-arrow', {
      height: 0.5,
      diameterTop: 0,
      diameterBottom: 0.15,
      tessellation: 6,
    }, this.scene)

    // Point arrow sideways (along Z)
    arrow.rotation.x = Math.PI / 2

    const mat = new StandardMaterial('hit-arrow-mat', this.scene)
    mat.diffuseColor = new Color3(1, 1, 0.7)
    mat.emissiveColor = new Color3(0.6, 0.6, 0.3)
    arrow.material = mat

    const from = new Vector3(caster.position.x, 1, caster.position.y)
    arrow.position.copyFrom(from)

    this.arrows.push({
      mesh: arrow,
      from,
      to: Vector3.Zero(), // will be updated in update()
      elapsed: 0,
      duration: ARROW_FLY_DURATION,
      targetId,
    })
  }

  /** Call each render frame. Pass entity lookup for live target position. */
  update(dt: number, getEntity: (id: string) => Entity | undefined): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]
      arrow.elapsed += dt

      // Update target position (target may have moved)
      const target = getEntity(arrow.targetId)
      if (target) {
        arrow.to.set(target.position.x, 1, target.position.y)
      }

      const t = Math.min(arrow.elapsed / arrow.duration, 1)
      Vector3.LerpToRef(arrow.from, arrow.to, t, arrow.mesh.position)

      // Orient arrow toward target
      const dir = arrow.to.subtract(arrow.from)
      if (dir.lengthSquared() > 0.001) {
        const angle = Math.atan2(dir.x, dir.z)
        arrow.mesh.rotation.y = angle
      }

      if (t >= 1) {
        // Hit: flash target + remove arrow
        arrow.mesh.dispose()
        this.arrows.splice(i, 1)
        this.entityRenderer.flashHit(arrow.targetId)
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hit-effect-renderer.ts
git commit -m "feat: implement HitEffectRenderer with flying arrow and target flash"
```

---

### Task 9: UI Overlay

**Files:**
- Create: `src/ui/ui-manager.ts`
- Create: `src/ui/hp-bar.ts`
- Create: `src/ui/skill-bar.ts`
- Create: `src/ui/cast-bar.ts`
- Create: `src/ui/damage-floater.ts`
- Create: `src/ui/buff-bar.ts`
- Create: `src/ui/lock-indicator.ts`

由于 UI 代码以 DOM 操作为主，不适合单元测试，通过视觉验证。

- [ ] **Step 1: 实现 HP Bar**

```typescript
// src/ui/hp-bar.ts
export class HpBar {
  private container: HTMLDivElement
  private fill: HTMLDivElement
  private text: HTMLSpanElement

  constructor(parent: HTMLDivElement, label: string, color: string, position: 'top' | 'bottom') {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; ${position === 'top' ? 'top: 20px' : 'bottom: 80px'};
      left: 50%; transform: translateX(-50%);
      width: 300px; height: 24px;
      background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.3);
      border-radius: 3px; overflow: hidden;
    `

    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.cssText = `
      position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
      font-size: 11px; z-index: 1; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(labelEl)

    this.fill = document.createElement('div')
    this.fill.style.cssText = `
      height: 100%; background: ${color}; transition: width 0.1s;
    `
    this.container.appendChild(this.fill)

    this.text = document.createElement('span')
    this.text.style.cssText = `
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      font-size: 11px; z-index: 1; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(this.text)

    parent.appendChild(this.container)
  }

  update(current: number, max: number): void {
    const pct = max > 0 ? (current / max) * 100 : 0
    this.fill.style.width = `${pct}%`
    this.text.textContent = `${Math.floor(current)} / ${max}`
  }
}
```

- [ ] **Step 2: 实现 Skill Bar**

```typescript
// src/ui/skill-bar.ts
import type { SkillDef } from '@/core/types'

export class SkillBar {
  private slots: HTMLDivElement[] = []
  private cooldownOverlays: HTMLDivElement[] = []

  constructor(parent: HTMLDivElement, skills: SkillDef[]) {
    const bar = document.createElement('div')
    bar.style.cssText = `
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px;
    `

    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div')
      slot.style.cssText = `
        width: 48px; height: 48px; background: rgba(0,0,0,0.8);
        border: 2px solid rgba(255,255,255,0.4); border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
        position: relative; font-size: 12px;
      `

      const keyLabel = document.createElement('span')
      keyLabel.textContent = `${i + 1}`
      keyLabel.style.cssText = `
        position: absolute; top: 2px; left: 4px; font-size: 10px;
        color: rgba(255,255,255,0.5);
      `
      slot.appendChild(keyLabel)

      const nameLabel = document.createElement('span')
      nameLabel.textContent = skills[i]?.name?.slice(0, 4) ?? ''
      nameLabel.style.cssText = 'font-size: 10px; text-align: center;'
      slot.appendChild(nameLabel)

      const cdOverlay = document.createElement('div')
      cdOverlay.style.cssText = `
        position: absolute; bottom: 0; left: 0; width: 100%;
        background: rgba(0,0,0,0.7); transition: height 0.05s;
        height: 0%;
      `
      slot.appendChild(cdOverlay)

      this.slots.push(slot)
      this.cooldownOverlays.push(cdOverlay)
      bar.appendChild(slot)
    }

    parent.appendChild(bar)
  }

  updateGcd(gcdRemaining: number, gcdTotal: number): void {
    const pct = gcdTotal > 0 ? (gcdRemaining / gcdTotal) * 100 : 0
    for (const overlay of this.cooldownOverlays) {
      overlay.style.height = `${pct}%`
    }
  }
}
```

- [ ] **Step 3: 实现 Cast Bar**

```typescript
// src/ui/cast-bar.ts
export class CastBar {
  private container: HTMLDivElement
  private fill: HTMLDivElement
  private text: HTMLSpanElement

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
      width: 250px; height: 18px;
      background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.3);
      border-radius: 3px; overflow: hidden; display: none;
    `

    this.fill = document.createElement('div')
    this.fill.style.cssText = `
      height: 100%; background: linear-gradient(90deg, #4a9eff, #82c0ff);
      transition: width 0.05s;
    `
    this.container.appendChild(this.fill)

    this.text = document.createElement('span')
    this.text.style.cssText = `
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      font-size: 11px; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(this.text)

    parent.appendChild(this.container)
  }

  show(skillName: string): void {
    this.container.style.display = 'block'
    this.text.textContent = skillName
  }

  updateProgress(elapsed: number, total: number): void {
    const pct = total > 0 ? (elapsed / total) * 100 : 0
    this.fill.style.width = `${Math.min(100, pct)}%`
  }

  hide(): void {
    this.container.style.display = 'none'
  }
}
```

- [ ] **Step 4: 实现 Damage Floater**

```typescript
// src/ui/damage-floater.ts
export class DamageFloater {
  private container: HTMLDivElement

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: hidden;
    `
    parent.appendChild(this.container)
  }

  spawn(screenX: number, screenY: number, amount: number, isHeal: boolean): void {
    const el = document.createElement('div')
    el.textContent = isHeal ? `+${amount}` : `${amount}`
    el.style.cssText = `
      position: absolute;
      left: ${screenX}px; top: ${screenY}px;
      font-size: 18px; font-weight: bold;
      color: ${isHeal ? '#4eff4e' : '#ff4444'};
      text-shadow: 1px 1px 3px #000;
      pointer-events: none;
      animation: floatUp 1s ease-out forwards;
    `
    this.container.appendChild(el)
    setTimeout(() => el.remove(), 1000)
  }

  /** Inject CSS animation (call once) */
  static injectStyles(): void {
    if (document.getElementById('damage-floater-styles')) return
    const style = document.createElement('style')
    style.id = 'damage-floater-styles'
    style.textContent = `
      @keyframes floatUp {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-60px) scale(0.8); }
      }
    `
    document.head.appendChild(style)
  }
}
```

- [ ] **Step 5: 实现 UI Manager**

```typescript
// src/ui/ui-manager.ts
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import { HpBar } from './hp-bar'
import { SkillBar } from './skill-bar'
import { CastBar } from './cast-bar'
import { DamageFloater } from './damage-floater'
import { GCD_DURATION } from '@/skill/skill-resolver'

export class UIManager {
  private playerHp: HpBar
  private bossHp: HpBar
  private skillBar: SkillBar
  private castBar: CastBar
  private damageFloater: DamageFloater

  constructor(
    root: HTMLDivElement,
    bus: EventBus,
    skills: SkillDef[],
  ) {
    DamageFloater.injectStyles()

    this.bossHp = new HpBar(root, '', '#cc3333', 'top')
    this.playerHp = new HpBar(root, '', '#3388cc', 'bottom')
    this.skillBar = new SkillBar(root, skills)
    this.castBar = new CastBar(root)
    this.damageFloater = new DamageFloater(root)

    bus.on('damage:dealt', (payload: { target: Entity; amount: number }) => {
      // Simple: spawn at center of screen (proper world-to-screen in future)
      const x = window.innerWidth / 2 + (Math.random() - 0.5) * 100
      const y = window.innerHeight / 2 + (Math.random() - 0.5) * 50
      this.damageFloater.spawn(x, y, payload.amount, false)
    })

    bus.on('skill:cast_start', (payload: { skill: { name: string } }) => {
      this.castBar.show(payload.skill?.name ?? 'Casting...')
    })

    bus.on('skill:cast_complete', () => {
      this.castBar.hide()
    })

    bus.on('skill:cast_interrupted', () => {
      this.castBar.hide()
    })
  }

  update(player: Entity, boss: Entity): void {
    this.playerHp.update(player.hp, player.maxHp)
    this.bossHp.update(boss.hp, boss.maxHp)
    this.skillBar.updateGcd(player.gcdTimer, GCD_DURATION)

    if (player.casting) {
      this.castBar.updateProgress(player.casting.elapsed, player.casting.castTime)
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/
git commit -m "feat: implement UI overlay (HP bars, skill bar, cast bar, damage floaters)"
```

---

### Task 10: Demo 场景集成

**Files:**
- Modify: `src/demo/demo-scene.ts`

- [ ] **Step 1: 定义演示用玩家技能**

```typescript
// src/demo/demo-skills.ts
import type { SkillDef } from '@/core/types'

export const DEMO_SKILLS: SkillDef[] = [
  {
    id: 'basic_attack',
    name: '斩击',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    range: 5,
    effects: [{ type: 'damage', potency: 2 }],
  },
  {
    id: 'heavy_swing',
    name: '重劈',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'single',
    range: 5,
    effects: [{ type: 'damage', potency: 3.5 }],
  },
  {
    id: 'overpower',
    name: '超压斧',
    type: 'weaponskill',
    castTime: 0,
    cooldown: 0,
    gcd: true,
    targetType: 'aoe',
    range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'caster_facing' },
      shape: { type: 'fan', radius: 8, angle: 120 },
      telegraphDuration: 0,
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 1.5 }],
    }],
  },
  {
    id: 'rage_burst',
    name: '战嚎',
    type: 'ability',
    castTime: 0,
    cooldown: 30000,
    gcd: false,
    targetType: 'aoe',
    range: 0,
    zones: [{
      anchor: { type: 'caster' },
      direction: { type: 'none' },
      shape: { type: 'circle', radius: 6 },
      telegraphDuration: 0,
      resolveDelay: 0,
      hitEffectDuration: 300,
      effects: [{ type: 'damage', potency: 5 }],
    }],
  },
]
```

- [ ] **Step 2: 完整集成 demo-scene.ts**

```typescript
// src/demo/demo-scene.ts
import { SceneManager } from '@/renderer/scene-manager'
import { ArenaRenderer } from '@/renderer/arena-renderer'
import { EntityRenderer } from '@/renderer/entity-renderer'
import { AoeRenderer } from '@/renderer/aoe-renderer'
import { HitEffectRenderer } from '@/renderer/hit-effect-renderer'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { GameLoop } from '@/core/game-loop'
import { SkillResolver } from '@/skill/skill-resolver'
import { BuffSystem } from '@/combat/buff'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { Arena } from '@/arena/arena'
import { calculateDamage } from '@/combat/damage'
import { InputManager } from '@/input/input-manager'
import { PlayerController } from './player-controller'
import { UIManager } from '@/ui/ui-manager'
import { DEMO_SKILLS } from './demo-skills'
import type { ArenaDef, SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'

const DEMO_ARENA_DEF: ArenaDef = {
  name: 'Training Ground',
  shape: { type: 'circle', radius: 15 },
  boundary: 'wall',
}

export function startDemo(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement): void {
  // --- Core systems ---
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const skillResolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)
  const arena = new Arena(DEMO_ARENA_DEF)
  const gameLoop = new GameLoop()

  // --- Rendering ---
  const sceneManager = new SceneManager(canvas)
  new ArenaRenderer(sceneManager.scene, DEMO_ARENA_DEF)
  const entityRenderer = new EntityRenderer(sceneManager.scene, bus)
  const aoeRenderer = new AoeRenderer(sceneManager.scene, bus)
  const hitEffectRenderer = new HitEffectRenderer(sceneManager.scene, bus, entityRenderer)

  // --- Entities ---
  const player = entityMgr.create({
    id: 'player', type: 'player',
    position: { x: 0, y: -5, z: 0 },
    hp: 30000, maxHp: 30000, attack: 1000,
    speed: 6, size: 0.5,
    skillIds: DEMO_SKILLS.map((s) => s.id),
  })
  player.inCombat = true

  const dummy = entityMgr.create({
    id: 'dummy', type: 'boss',
    position: { x: 0, y: 0, z: 0 },
    hp: 999999, maxHp: 999999, attack: 0,
    speed: 0, size: 1.5,
  })

  // --- Input ---
  const input = new InputManager(canvas)

  // --- Player controller ---
  const playerCtrl = new PlayerController(
    player, input, skillResolver, buffSystem,
    entityMgr, bus, DEMO_SKILLS, arena, 3000,
  )

  // --- UI ---
  const uiManager = new UIManager(uiRoot, bus, DEMO_SKILLS)

  // --- Damage handling ---
  bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
    for (const zone of [payload.zone]) {
      for (const hit of payload.hitEntities) {
        for (const effect of zone.def.effects) {
          if (effect.type === 'damage') {
            const dmg = calculateDamage({
              attack: player.attack,
              potency: effect.potency,
              increases: buffSystem.getDamageIncreases(player),
              mitigations: buffSystem.getMitigations(hit),
            })
            hit.hp = Math.max(0, hit.hp - dmg)
            bus.emit('damage:dealt', { source: player, target: hit, amount: dmg, skill: null })
          }
        }
      }
    }
  })

  bus.on('skill:cast_complete', (payload: { caster: Entity; skill: SkillDef | any }) => {
    if (payload.caster.id !== player.id) return
    const skill = payload.skill as SkillDef | undefined
    if (!skill?.effects) return

    const target = player.target ? entityMgr.get(player.target) : null
    if (!target) return

    for (const effect of skill.effects) {
      if (effect.type === 'damage') {
        const dmg = calculateDamage({
          attack: player.attack,
          potency: effect.potency,
          increases: buffSystem.getDamageIncreases(player),
          mitigations: buffSystem.getMitigations(target),
        })
        target.hp = Math.max(0, target.hp - dmg)
        bus.emit('damage:dealt', { source: player, target, amount: dmg, skill })
      }
    }
  })

  // --- Mouse world position (raycast ground plane) ---
  function updateMouseWorld(): void {
    const pickResult = sceneManager.scene.pick(
      sceneManager.scene.pointerX,
      sceneManager.scene.pointerY,
    )
    if (pickResult?.pickedPoint) {
      input.updateMouseWorldPos({
        x: pickResult.pickedPoint.x,
        y: pickResult.pickedPoint.z, // Babylon Z → game Y
      })
    }
  }

  // --- Game loop ---
  let lastTime = performance.now()

  gameLoop.onUpdate((dt) => {
    playerCtrl.update(dt)
    zoneMgr.update(dt)
  })

  sceneManager.startRenderLoop(() => {
    const now = performance.now()
    const delta = now - lastTime
    lastTime = now

    updateMouseWorld()
    gameLoop.tick(delta)

    entityRenderer.updateAll(entityMgr.getAlive())
    aoeRenderer.update(now)
    hitEffectRenderer.update(delta, (id) => entityMgr.get(id))
    sceneManager.followTarget(player.position.x, player.position.y)
    uiManager.update(player, dummy)
  })

  window.addEventListener('resize', () => sceneManager.engine.resize())

  console.log('XIV Stage Play — Training Dummy Demo Ready')
  console.log('Controls: WASD move, mouse aim, right-click lock target, 1-4 skills')
}
```

- [ ] **Step 3: 启动验证**

```bash
pnpm dev
```

在浏览器中验证：
- 灰色圆形场地 + 白色边界环可见
- 淡绿色玩家在南侧，淡蓝色木人在中央
- 每个实体脚下有判定点（黑色小圆）和朝向箭头
- WASD 移动正常，被场地边界阻挡
- 鼠标控制朝向
- 右键锁定木人
- 按 1-4 释放技能，GCD 显示
- 伤害飘字弹出
- 木人血条变化

- [ ] **Step 4: Commit**

```bash
git add src/demo/ src/renderer/ src/ui/ src/input/
git commit -m "feat: integrate demo scene with training dummy, input, rendering, and UI"
```

---

### Task 11: 主菜单

**Files:**
- Create: `src/ui/main-menu.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 实现 MainMenu**

```typescript
// src/ui/main-menu.ts
export class MainMenu {
  private container: HTMLDivElement
  private onStart: (() => void) | null = null

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.85); z-index: 100;
    `

    const title = document.createElement('h1')
    title.textContent = 'XIV Stage Play'
    title.style.cssText = `
      font-size: 36px; color: #e0e0e0; margin-bottom: 8px;
      font-weight: 300; letter-spacing: 4px;
    `
    this.container.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.textContent = 'Boss Battle Simulator'
    subtitle.style.cssText = `
      font-size: 14px; color: #888; margin-bottom: 40px;
      letter-spacing: 2px;
    `
    this.container.appendChild(subtitle)

    const startBtn = document.createElement('button')
    startBtn.textContent = '▶  Training Dummy'
    startBtn.style.cssText = `
      padding: 12px 32px; font-size: 16px;
      background: rgba(255, 255, 255, 0.1); color: #ccc;
      border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px;
      cursor: pointer; transition: all 0.15s;
      letter-spacing: 1px;
    `
    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.2)'
      startBtn.style.color = '#fff'
    })
    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.1)'
      startBtn.style.color = '#ccc'
    })
    startBtn.addEventListener('click', () => this.onStart?.())
    this.container.appendChild(startBtn)

    parent.appendChild(this.container)
  }

  onStartGame(cb: () => void): void {
    this.onStart = cb
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  show(): void {
    this.container.style.display = 'flex'
  }
}
```

- [ ] **Step 2: 更新 main.ts 使用主菜单**

```typescript
// src/main.ts
import { MainMenu } from './ui/main-menu'
import { startDemo } from './demo/demo-scene'

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const uiRoot = document.getElementById('ui-overlay') as HTMLDivElement

const menu = new MainMenu(uiRoot)

menu.onStartGame(() => {
  menu.hide()
  startDemo(canvas, uiRoot)
})
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/main-menu.ts src/main.ts
git commit -m "feat: implement MainMenu with start game entry"
```

---

### Task 12: 暂停菜单

**Files:**
- Create: `src/ui/pause-menu.ts`

- [ ] **Step 1: 实现 PauseMenu**

```typescript
// src/ui/pause-menu.ts
export class PauseMenu {
  private container: HTMLDivElement
  private onResume: (() => void) | null = null
  private onQuit: (() => void) | null = null
  private _visible = false

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: none; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.6); z-index: 90;
    `

    const title = document.createElement('h2')
    title.textContent = 'PAUSED'
    title.style.cssText = `
      font-size: 28px; color: #ddd; margin-bottom: 30px;
      font-weight: 300; letter-spacing: 6px;
    `
    this.container.appendChild(title)

    const btnStyle = `
      padding: 10px 28px; font-size: 14px; margin: 6px;
      background: rgba(255,255,255,0.08); color: #bbb;
      border: 1px solid rgba(255,255,255,0.15); border-radius: 3px;
      cursor: pointer; letter-spacing: 1px; min-width: 160px;
    `

    const resumeBtn = document.createElement('button')
    resumeBtn.textContent = 'Resume'
    resumeBtn.style.cssText = btnStyle
    resumeBtn.addEventListener('click', () => this.onResume?.())
    this.container.appendChild(resumeBtn)

    const quitBtn = document.createElement('button')
    quitBtn.textContent = 'Quit to Menu'
    quitBtn.style.cssText = btnStyle
    quitBtn.addEventListener('click', () => this.onQuit?.())
    this.container.appendChild(quitBtn)

    parent.appendChild(this.container)
  }

  get visible(): boolean { return this._visible }

  show(): void {
    this._visible = true
    this.container.style.display = 'flex'
  }

  hide(): void {
    this._visible = false
    this.container.style.display = 'none'
  }

  onResumeGame(cb: () => void): void { this.onResume = cb }
  onQuitGame(cb: () => void): void { this.onQuit = cb }
}
```

- [ ] **Step 2: 在 demo-scene 中集成暂停逻辑**

在 `startDemo` 中创建 PauseMenu 并连接 PlayerController 的 ESC 返回值：

```typescript
// In demo-scene.ts, add:
import { PauseMenu } from '@/ui/pause-menu'

// After UIManager creation:
const pauseMenu = new PauseMenu(uiRoot)
let paused = false

pauseMenu.onResumeGame(() => {
  paused = false
  pauseMenu.hide()
})

pauseMenu.onQuitGame(() => {
  // For now, reload page to return to main menu
  window.location.reload()
})

// In gameLoop.onUpdate, wrap logic:
gameLoop.onUpdate((dt) => {
  if (paused) return
  const result = playerCtrl.update(dt)
  if (result === 'pause') {
    paused = true
    pauseMenu.show()
    return
  }
  zoneMgr.update(dt)
})
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/pause-menu.ts src/demo/demo-scene.ts
git commit -m "feat: implement PauseMenu with ESC priority chain (cast→target→pause)"
```

---

### Task 13: 开发者终端

**Files:**
- Create: `src/devtools/dev-terminal.ts`
- Create: `src/devtools/dev-terminal.test.ts`
- Create: `src/devtools/commands.ts`
- Create: `src/devtools/commands.test.ts`

- [ ] **Step 1: 编写指令注册表测试**

```typescript
// src/devtools/commands.test.ts
import { describe, it, expect, vi } from 'vitest'
import { CommandRegistry } from '@/devtools/commands'

describe('CommandRegistry', () => {
  it('should register and execute a command', () => {
    const registry = new CommandRegistry()
    const fn = vi.fn()
    registry.register('test', 'A test command', fn)

    registry.execute('test --flag value')
    expect(fn).toHaveBeenCalledWith(
      expect.objectContaining({ flag: 'value' }),
    )
  })

  it('should return error for unknown command', () => {
    const registry = new CommandRegistry()
    const result = registry.execute('unknown')
    expect(result).toContain('Unknown command')
  })

  it('should list all commands with help', () => {
    const registry = new CommandRegistry()
    registry.register('foo', 'Does foo', vi.fn())
    registry.register('bar', 'Does bar', vi.fn())
    const result = registry.execute('help')
    expect(result).toContain('foo')
    expect(result).toContain('bar')
    expect(result).toContain('Does foo')
  })
})
```

- [ ] **Step 2: 实现 CommandRegistry**

```typescript
// src/devtools/commands.ts
import minimist from 'minimist'

type CommandFn = (args: minimist.ParsedArgs) => string | void

interface CommandDef {
  name: string
  description: string
  fn: CommandFn
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>()

  constructor() {
    // Built-in help command
    this.register('help', 'List all available commands', () => {
      const lines = ['Available commands:']
      for (const cmd of this.commands.values()) {
        lines.push(`  ${cmd.name.padEnd(16)} ${cmd.description}`)
      }
      return lines.join('\n')
    })
  }

  register(name: string, description: string, fn: CommandFn): void {
    this.commands.set(name, { name, description, fn })
  }

  execute(input: string): string {
    const parts = input.trim().split(/\s+/)
    const name = parts[0]
    const args = minimist(parts.slice(1))

    const cmd = this.commands.get(name)
    if (!cmd) return `Unknown command: "${name}". Type "help" for available commands.`

    const result = cmd.fn(args)
    return result ?? ''
  }
}
```

- [ ] **Step 3: 运行指令测试**

```bash
pnpm test:run src/devtools/commands.test.ts
```

- [ ] **Step 4: 编写 DevTerminal 测试**

```typescript
// src/devtools/dev-terminal.test.ts
import { describe, it, expect } from 'vitest'
import { DevTerminal } from '@/devtools/dev-terminal'
import { EventBus } from '@/core/event-bus'
import { CommandRegistry } from '@/devtools/commands'

describe('DevTerminal', () => {
  it('should log events from EventBus', () => {
    const bus = new EventBus()
    const registry = new CommandRegistry()
    const terminal = new DevTerminal(bus, registry)

    bus.emit('damage:dealt', { source: { id: 'p1' }, target: { id: 'b1' }, amount: 2000, skill: { name: 'Slash' } })

    const logs = terminal.getLogs()
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0]).toContain('p1')
    expect(logs[0]).toContain('2000')
  })

  it('should format skill:cast_start events', () => {
    const bus = new EventBus()
    const registry = new CommandRegistry()
    const terminal = new DevTerminal(bus, registry)

    bus.emit('skill:cast_start', { caster: { id: 'p1' }, skill: { name: 'Fire I' } })

    const logs = terminal.getLogs()
    expect(logs[0]).toContain('p1')
    expect(logs[0]).toContain('Fire I')
  })
})
```

- [ ] **Step 5: 实现 DevTerminal**

```typescript
// src/devtools/dev-terminal.ts
import type { EventBus } from '@/core/event-bus'
import type { CommandRegistry } from './commands'

const MAX_LOG_LINES = 200

export class DevTerminal {
  private logs: string[] = []
  private container: HTMLDivElement | null = null
  private logEl: HTMLDivElement | null = null
  private inputEl: HTMLInputElement | null = null
  private visible = false

  constructor(
    private bus: EventBus,
    private commands: CommandRegistry,
  ) {
    this.subscribeEvents()
  }

  /** Attach to DOM (call once when UI is ready) */
  mount(parent: HTMLDivElement): void {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 40%;
      background: rgba(0, 0, 0, 0.85); display: none;
      flex-direction: column; z-index: 200; font-family: monospace;
      border-bottom: 1px solid rgba(255,255,255,0.15);
    `

    this.logEl = document.createElement('div')
    this.logEl.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px 12px;
      font-size: 12px; color: #aaa; line-height: 1.5;
      white-space: pre-wrap; word-break: break-all;
    `
    this.container.appendChild(this.logEl)

    this.inputEl = document.createElement('input')
    this.inputEl.style.cssText = `
      width: 100%; padding: 6px 12px; font-size: 13px;
      background: rgba(255,255,255,0.05); color: #ddd;
      border: none; border-top: 1px solid rgba(255,255,255,0.1);
      outline: none; font-family: monospace;
    `
    this.inputEl.placeholder = '> Type a command...'
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const input = this.inputEl!.value.trim()
        if (input) {
          this.addLog(`> ${input}`, '#8cf')
          const result = this.commands.execute(input)
          if (result) this.addLog(result, '#ccc')
          this.inputEl!.value = ''
        }
      }
      // Prevent game input while typing
      e.stopPropagation()
    })
    this.container.appendChild(this.inputEl)

    parent.appendChild(this.container)

    // Toggle with ~ key
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        e.preventDefault()
        this.toggle()
      }
    })
  }

  toggle(): void {
    this.visible = !this.visible
    if (this.container) {
      this.container.style.display = this.visible ? 'flex' : 'none'
      if (this.visible) this.inputEl?.focus()
    }
  }

  isVisible(): boolean { return this.visible }

  getLogs(): string[] { return [...this.logs] }

  addLog(message: string, color = '#aaa'): void {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const line = `[${timestamp}] ${message}`
    this.logs.push(line)
    if (this.logs.length > MAX_LOG_LINES) this.logs.shift()

    if (this.logEl) {
      const lineEl = document.createElement('div')
      lineEl.textContent = line
      lineEl.style.color = color
      this.logEl.appendChild(lineEl)

      // Auto-scroll to bottom
      this.logEl.scrollTop = this.logEl.scrollHeight

      // Trim DOM
      while (this.logEl.children.length > MAX_LOG_LINES) {
        this.logEl.removeChild(this.logEl.firstChild!)
      }
    }
  }

  private subscribeEvents(): void {
    this.bus.on('skill:cast_start', (p: any) => {
      this.addLog(`${p.caster?.id} starts casting ${p.skill?.name ?? p.skillId}`, '#7bf')
    })

    this.bus.on('skill:cast_complete', (p: any) => {
      const name = p.skill?.name ?? p.skillId ?? '?'
      this.addLog(`${p.caster?.id} casts ${name}`, '#8f8')
    })

    this.bus.on('skill:cast_interrupted', (p: any) => {
      this.addLog(`${p.caster?.id} interrupted (${p.reason})`, '#fa5')
    })

    this.bus.on('damage:dealt', (p: any) => {
      this.addLog(`${p.source?.id} → ${p.target?.id}: ${p.amount} damage`, '#f88')
    })

    this.bus.on('damage:lethal', (p: any) => {
      this.addLog(`LETHAL: ${p.target?.id} killed (${p.reason})`, '#f44')
    })

    this.bus.on('entity:created', (p: any) => {
      this.addLog(`Entity created: ${p.entity?.id} (${p.entity?.type})`, '#888')
    })

    this.bus.on('entity:died', (p: any) => {
      this.addLog(`Entity died: ${p.entity?.id}`, '#f66')
    })

    this.bus.on('buff:applied', (p: any) => {
      this.addLog(`${p.target?.id} gained ${p.buff?.name}`, '#bf8')
    })

    this.bus.on('buff:removed', (p: any) => {
      this.addLog(`${p.target?.id} lost ${p.buff?.name} (${p.reason})`, '#ba8')
    })

    this.bus.on('target:locked', (p: any) => {
      this.addLog(`${p.entity?.id} locked target: ${p.target?.id}`, '#aaf')
    })

    this.bus.on('target:released', (p: any) => {
      this.addLog(`${p.entity?.id} released target`, '#aaf')
    })

    this.bus.on('aoe:zone_created', (p: any) => {
      this.addLog(`AOE zone created: ${p.zone?.def?.shape?.type} (${p.skill})`, '#fa8')
    })

    this.bus.on('aoe:zone_resolved', (p: any) => {
      const hitCount = p.hitEntities?.length ?? 0
      this.addLog(`AOE zone resolved: hit ${hitCount} entities`, '#fa8')
    })
  }
}
```

- [ ] **Step 6: 运行测试**

```bash
pnpm test:run src/devtools/
```

- [ ] **Step 7: 在 demo-scene 中集成**

在 `startDemo` 中创建 DevTerminal 并 mount：

```typescript
// In demo-scene.ts, add:
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'

// After EventBus creation:
const commandRegistry = new CommandRegistry()
const devTerminal = new DevTerminal(bus, commandRegistry)

// After UIManager creation:
devTerminal.mount(uiRoot)
```

在 InputManager 中，当 DevTerminal 可见时阻止游戏输入（在 gameLoop.onUpdate 中）：

```typescript
// In gameLoop.onUpdate:
gameLoop.onUpdate((dt) => {
  if (paused) return
  if (devTerminal.isVisible()) return  // freeze game while terminal is open
  const result = playerCtrl.update(dt)
  // ...
})
```

- [ ] **Step 8: Commit**

```bash
git add src/devtools/ src/demo/demo-scene.ts
git commit -m "feat: implement DevTerminal with event logging and command system"
```

---

### Task 14: 全量测试 + 清理

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 运行全量测试**

```bash
pnpm test:run
```

确保所有已有测试仍然通过。

- [ ] **Step 2: 类型检查**

```bash
pnpm exec tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 3: 更新 index.ts 导出新模块**

在 `src/index.ts` 末尾追加：

```typescript
// Renderer
export { SceneManager } from './renderer/scene-manager'
export { EntityRenderer } from './renderer/entity-renderer'
export { AoeRenderer } from './renderer/aoe-renderer'
export { ArenaRenderer } from './renderer/arena-renderer'
export { HitEffectRenderer } from './renderer/hit-effect-renderer'

// Input
export { InputManager, computeMoveDirection, computeFacingAngle } from './input/input-manager'

// UI
export { UIManager } from './ui/ui-manager'
export { MainMenu } from './ui/main-menu'
export { PauseMenu } from './ui/pause-menu'

// DevTools
export { DevTerminal } from './devtools/dev-terminal'
export { CommandRegistry } from './devtools/commands'

// Demo
export { startDemo } from './demo/demo-scene'
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: export Plan C modules and complete playable prototype"
```

---

## 完成标准

Plan C 完成后：

- `pnpm dev` 在浏览器中打开，首先看到主菜单
- 点击"Training Dummy"进入训练木人场景
- WASD 移动、鼠标朝向、右键锁定、1-4 技能释放均可操作
- 单体攻击有飞行箭头 + 目标闪白的命中特效
- GCD 扫描、血条、伤害飘字、AOE 预兆均有视觉表现
- 实体有胶囊体（淡绿玩家/淡蓝敌人）、判定点、朝向箭头、攻击范围环
- ESC 优先级：中断咏唱 → 取消锁定 → 暂停游戏
- ~ 键展开开发者终端，显示事件日志，支持指令输入
- 所有已有单元测试仍然通过
- 类型检查零错误

这是完整可游玩的原型 Demo。后续可在此基础上添加 BOSS 时间轴驱动的战斗。
