// src/renderer/vfx/stack-marker.ts
// FFXIV stack (shared damage) markers: no danger fill, glowing orange chevrons that press inward.
// Circle stacks: four chevrons closing in from the diagonals. Line stacks: chevron pairs on both
// edges of the line, around the member it targets, and a downward arrow over that member's head.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial, TransformNode,
  type Mesh, type Scene,
} from '@babylonjs/core'

const cache = new WeakMap<Scene, StandardMaterial>()

/** A thick glowing chevron pointing to the canvas top (= mesh +Z once laid flat as a ground) */
function chevronMaterial(scene: Scene): StandardMaterial {
  const cached = cache.get(scene)
  if (cached) return cached
  const S = 256
  const tex = new DynamicTexture('stack-chevron', { width: S, height: S }, scene, true)
  tex.hasAlpha = true
  const ctx = tex.getContext() as CanvasRenderingContext2D
  ctx.clearRect(0, 0, S, S)
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(S * 0.5, S * 0.16)
    ctx.lineTo(S * 0.9, S * 0.62)
    ctx.lineTo(S * 0.72, S * 0.62)
    ctx.lineTo(S * 0.5, S * 0.38)
    ctx.lineTo(S * 0.28, S * 0.62)
    ctx.lineTo(S * 0.1, S * 0.62)
    ctx.closePath()
  }
  // Soft orange glow, then a fill running from deep orange at the back to pale yellow at the tip
  ctx.shadowColor = 'rgba(255,120,20,0.9)'
  ctx.shadowBlur = 28
  const grad = ctx.createLinearGradient(0, S * 0.62, 0, S * 0.16)
  grad.addColorStop(0, 'rgba(255,96,16,0.95)')
  grad.addColorStop(0.6, 'rgba(255,170,40,1)')
  grad.addColorStop(1, 'rgba(255,245,170,1)')
  ctx.fillStyle = grad
  path()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,250,210,0.9)'
  ctx.lineWidth = 3
  path()
  ctx.stroke()
  tex.update()

  const m = new StandardMaterial('stack-chevron-mat', scene)
  m.disableLighting = true
  m.diffuseColor = Color3.Black()
  m.specularColor = Color3.Black()
  m.emissiveTexture = tex
  m.opacityTexture = tex
  m.backFaceCulling = false
  m.disableDepthWrite = true
  cache.set(scene, m)
  return m
}

const CYCLE_MS = 1100

export class StackMarker {
  private meshes: Mesh[] = []
  /** Line stacks: the arrow over the targeted member's head */
  private head: Mesh | null = null

  constructor(scene: Scene, count: number, withHead = false) {
    const mat = chevronMaterial(scene)
    for (let i = 0; i < count; i++) {
      const m = MeshBuilder.CreateGround(`stack-chevron-${i}`, { width: 1, height: 1 }, scene)
      m.material = mat
      m.isPickable = false
      m.renderingGroupId = 1
      this.meshes.push(m)
    }
    if (withHead) {
      const h = MeshBuilder.CreatePlane('stack-head-arrow', { size: 1 }, scene)
      // Full billboard (seen edge-on otherwise from the overhead camera), turned to point down
      h.billboardMode = TransformNode.BILLBOARDMODE_ALL
      h.rotation.z = Math.PI
      h.material = mat
      h.isPickable = false
      h.renderingGroupId = 1
      this.head = h
    }
  }

  /** Place chevron `i` at (x, z) pointing along `angle` (degrees, 0 = +Z) */
  private place(i: number, x: number, z: number, angle: number, size: number, alpha: number): void {
    const m = this.meshes[i]!
    m.position.set(x, 0.09, z)
    m.rotation.y = (angle * Math.PI) / 180
    m.scaling.set(size, 1, size)
    m.visibility = alpha
  }

  /** Four chevrons closing in on the centre from the diagonals */
  updateCircle(cx: number, cz: number, radius: number, ageMs: number, intro: number): void {
    const k = (ageMs % CYCLE_MS) / CYCLE_MS
    const r = radius * (0.95 - 0.3 * k)
    const alpha = intro * Math.sin(Math.PI * Math.min(1, k * 1.15))
    const size = Math.max(1.6, radius * 0.75)
    for (let i = 0; i < 4; i++) {
      const at = 45 + i * 90
      const a = (at * Math.PI) / 180
      this.place(i, cx + Math.sin(a) * r, cz + Math.cos(a) * r, at + 180, size, alpha)
    }
  }

  /** Line stack aimed along `facing`: chevron pairs on both edges, centred on the marked member at (tx, tz) */
  updateLine(tx: number, tz: number, facing: number, width: number, ageMs: number, intro: number): void {
    const f = (facing * Math.PI) / 180
    const fwd = { x: Math.sin(f), z: Math.cos(f) }
    const right = { x: Math.cos(f), z: -Math.sin(f) }
    const k = (ageMs % CYCLE_MS) / CYCLE_MS
    const pulse = intro * (0.55 + 0.45 * Math.sin(Math.PI * k))
    const along = (d: number, side: number) => ({
      x: tx + fwd.x * d + right.x * side,
      z: tz + fwd.z * d + right.z * side,
    })
    const rows = [-2.4, 0, 2.4]
    const edge = width / 2 + 0.6 - 0.35 * k
    const size = Math.max(1.2, width * 0.42)
    rows.forEach((t, i) => {
      const l = along(t, -edge)
      const r = along(t, edge)
      this.place(i * 2, l.x, l.z, facing + 90, size, pulse)
      this.place(i * 2 + 1, r.x, r.z, facing - 90, size, pulse)
    })
  }

  /** The down arrow bobbing over the targeted member's head */
  updateHead(x: number, z: number, headY: number, ageMs: number, intro: number): void {
    if (!this.head) return
    this.head.position.set(x, headY + 1.4 + Math.abs(Math.sin(ageMs / 260)) * 0.35, z)
    this.head.scaling.setAll(2.2 * (1.3 - 0.3 * intro))
    this.head.visibility = intro
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose()
    this.head?.dispose()
    this.meshes = []
    this.head = null
  }
}

export const STACK_LINE_CHEVRONS = 6
export const STACK_CIRCLE_CHEVRONS = 4
