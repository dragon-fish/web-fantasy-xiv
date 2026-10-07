// src/renderer/characters/target-ring.ts
// FFXIV-style lock-on ring under the player's current target: glowing band on the hitbox edge,
// front arrow, flank chevrons and an open rear arc. Drawn procedurally so it stays crisp at any size.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial,
  type Mesh, type Scene, type TransformNode,
} from '@babylonjs/core'

const TEX = 512
const C = TEX / 2
/** Ring centre-line radius in texture pixels; maps to the target's hitbox radius in metres */
const R = 176
const REAR_GAP = 70 // degrees
const MIN_RADIUS = 0.7
const PULSE_MS = 1400

function drawRing(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, TEX, TEX)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Canvas angles run clockwise from +X; the rear (bottom, +90°) stays open
  const from = ((90 + REAR_GAP / 2) * Math.PI) / 180
  const to = ((90 - REAR_GAP / 2 + 360) * Math.PI) / 180
  const band = (width: number, style: string, blur = 0, glow = '') => {
    ctx.shadowBlur = blur
    ctx.shadowColor = glow
    ctx.lineWidth = width
    ctx.strokeStyle = style
    ctx.beginPath()
    ctx.arc(C, C, R, from, to)
    ctx.stroke()
  }
  const arrow = () => {
    const y = C - R
    ctx.beginPath()
    ctx.moveTo(C, y - 58)
    ctx.lineTo(C + 26, y + 8)
    ctx.lineTo(C, y - 6)
    ctx.lineTo(C - 26, y + 8)
    ctx.closePath()
  }
  const chevron = (x: number) => {
    ctx.beginPath()
    ctx.moveTo(x - 16, C + 10)
    ctx.lineTo(x, C - 10)
    ctx.lineTo(x + 16, C + 10)
  }

  // Dark underlay keeps the ring readable on bright, busy floors
  band(34, 'rgba(0,0,0,0.42)', 16, 'rgba(0,0,0,0.6)')
  arrow()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.fill()

  band(14, '#ff3b2f', 22, '#ff2a1a')
  band(5, '#fff1ec', 6, '#ff6a50')

  ctx.shadowBlur = 18
  ctx.shadowColor = '#ff2a1a'
  arrow()
  ctx.fillStyle = '#ff4433'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = '#fff1ec'
  ctx.stroke()

  ctx.lineWidth = 6
  ctx.strokeStyle = '#fff1ec'
  for (const x of [C - R, C + R]) {
    chevron(x)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

export class TargetRing {
  private mesh: Mesh
  private mat: StandardMaterial
  private attachedTo: TransformNode | null = null
  private t = 0

  constructor(scene: Scene) {
    const tex = new DynamicTexture('target-ring-tex', { width: TEX, height: TEX }, scene, true)
    tex.hasAlpha = true
    drawRing(tex.getContext() as CanvasRenderingContext2D)
    // invertY: canvas top (the arrow) must land on local +Z, the entity's forward
    tex.update(true)

    this.mat = new StandardMaterial('target-ring-mat', scene)
    this.mat.disableLighting = true
    this.mat.diffuseColor = Color3.Black()
    this.mat.specularColor = Color3.Black()
    this.mat.emissiveColor = Color3.Black()
    this.mat.emissiveTexture = tex
    this.mat.opacityTexture = tex
    this.mat.disableDepthWrite = true

    this.mesh = MeshBuilder.CreateGround('target-ring', { width: 1, height: 1 }, scene)
    this.mesh.material = this.mat
    this.mesh.isPickable = false
    // Above floor decals and telegraphs so the lock never gets buried
    this.mesh.renderingGroupId = 1
    this.mesh.position.y = 0.04
    this.mesh.setEnabled(false)
  }

  /** Track `root` (position and facing) at hitbox `radius`; null hides the ring. */
  follow(root: TransformNode | null, radius: number, dt: number): void {
    if (root !== this.attachedTo) {
      this.attachedTo = root
      this.t = 0
    }
    this.mesh.setEnabled(!!root)
    if (!root) return
    this.t += dt
    // Not parented: the target's root is disposed with its corpse and would take the ring with it
    this.mesh.position.x = root.position.x
    this.mesh.position.z = root.position.z
    this.mesh.rotation.y = root.rotation.y
    const scale = (TEX * Math.max(MIN_RADIUS, radius)) / R
    // Snap in from slightly larger on lock, then breathe gently
    const s = scale * (1 + 0.25 * Math.max(0, 1 - this.t / 160))
    this.mesh.scaling.set(s, 1, s)
    this.mat.alpha = 0.82 + 0.18 * Math.sin((this.t / PULSE_MS) * Math.PI * 2)
  }

  dispose(): void {
    this.mesh.dispose()
    this.mat.emissiveTexture?.dispose()
    this.mat.dispose()
  }
}
