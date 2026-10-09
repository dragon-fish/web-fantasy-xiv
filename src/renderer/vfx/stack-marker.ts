// src/renderer/vfx/stack-marker.ts
// FFXIV stack (shared damage) floor markers: no danger fill, glowing orange chevrons that press
// inward. Circle stacks: four chevrons closing in from the diagonals. Line stacks: chevron pairs
// along both edges pointing at the line, and a big arrow down its length from the origin.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial,
  type Mesh, type Scene,
} from '@babylonjs/core'

const cache = new WeakMap<Scene, StandardMaterial>()

/** A thick glowing chevron pointing to the canvas top (= mesh −Z once laid flat as a ground) */
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

  constructor(private scene: Scene, count: number) {
    const mat = chevronMaterial(scene)
    for (let i = 0; i < count; i++) {
      const m = MeshBuilder.CreateGround(`stack-chevron-${i}`, { width: 1, height: 1 }, scene)
      m.material = mat
      m.isPickable = false
      m.renderingGroupId = 1
      this.meshes.push(m)
    }
  }

  /** Place chevron `i` at (x, z) pointing along `angle` (degrees, 0 = +Z) */
  private place(i: number, x: number, z: number, angle: number, size: number, alpha: number): void {
    const m = this.meshes[i]!
    m.position.set(x, 0.09, z)
    // The canvas top lands on −Z: turn half a circle so the tip points along `angle`
    m.rotation.y = ((angle + 180) * Math.PI) / 180
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

  /**
   * Line stack from (ox, oz) along `facing`: one big arrow down the line near the origin, then
   * chevron pairs on both edges pointing in at it.
   */
  updateLine(ox: number, oz: number, facing: number, length: number, width: number, ageMs: number, intro: number): void {
    const f = (facing * Math.PI) / 180
    const fwd = { x: Math.sin(f), z: Math.cos(f) }
    const right = { x: Math.cos(f), z: -Math.sin(f) }
    const k = (ageMs % CYCLE_MS) / CYCLE_MS
    const pulse = intro * (0.55 + 0.45 * Math.sin(Math.PI * k))
    const along = (t: number, side: number) => ({
      x: ox + fwd.x * length * t + right.x * side,
      z: oz + fwd.z * length * t + right.z * side,
    })
    const head = along(0.12 + 0.04 * k, 0)
    this.place(0, head.x, head.z, facing, Math.max(2.4, width * 0.9), pulse)
    const rows = [0.3, 0.45, 0.6]
    const edge = width / 2 + 0.6 - 0.35 * k
    const size = Math.max(1.2, width * 0.42)
    rows.forEach((t, i) => {
      const l = along(t, -edge)
      const r = along(t, edge)
      this.place(1 + i * 2, l.x, l.z, facing + 90, size, pulse)
      this.place(2 + i * 2, r.x, r.z, facing - 90, size, pulse)
    })
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose()
    this.meshes = []
  }
}

export const STACK_LINE_CHEVRONS = 7
export const STACK_CIRCLE_CHEVRONS = 4
