// src/renderer/vfx/target-marker.ts
// FFXIV single-target marker (单体点名): an orange quatrefoil ring with four hooked blades, standing
// around the marked member's body and slowly turning. Not the AOE lock-on (LockOnMarker): this one
// says "it lands on you alone", nothing to spread from.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial, TransformNode,
  type Mesh, type Scene,
} from '@babylonjs/core'

interface Assets {
  tex: DynamicTexture
  mat: StandardMaterial
}

const cache = new WeakMap<Scene, Assets>()

function buildAssets(scene: Scene): Assets {
  const S = 512
  const tex = new DynamicTexture('target-marker', { width: S, height: S }, scene, true)
  tex.hasAlpha = true
  const c = tex.getContext() as CanvasRenderingContext2D
  c.clearRect(0, 0, S, S)
  const o = S / 2
  const R = S * 0.36

  // Quatrefoil: four lobes inside the ring, a faint red wash with a darker rim
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    const lx = o + Math.cos(a) * R * 0.42
    const ly = o + Math.sin(a) * R * 0.42
    const g = c.createRadialGradient(lx, ly, 0, lx, ly, R * 0.48)
    g.addColorStop(0, 'rgba(255,90,40,0.10)')
    g.addColorStop(0.8, 'rgba(230,60,30,0.28)')
    g.addColorStop(1, 'rgba(160,30,20,0.55)')
    c.fillStyle = g
    c.beginPath()
    c.arc(lx, ly, R * 0.48, 0, Math.PI * 2)
    c.fill()
  }

  c.shadowColor = 'rgba(255,120,30,0.9)'
  c.shadowBlur = 18
  // Main ring
  c.strokeStyle = '#ff8a1c'
  c.lineWidth = S * 0.05
  c.beginPath()
  c.arc(o, o, R, 0, Math.PI * 2)
  c.stroke()
  // Four hooked blades sweeping clockwise off the ring
  c.fillStyle = '#ff7a12'
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const at = (ang: number, r: number) => [o + Math.cos(ang) * r, o + Math.sin(ang) * r] as const
    c.beginPath()
    c.moveTo(...at(a - 0.42, R * 0.97))
    c.quadraticCurveTo(...at(a - 0.05, R * 1.28), ...at(a + 0.38, R * 1.36))
    c.quadraticCurveTo(...at(a + 0.12, R * 1.12), ...at(a + 0.2, R * 0.97))
    c.closePath()
    c.fill()
  }
  // Thin red inner arcs
  c.shadowBlur = 8
  c.strokeStyle = 'rgba(255,60,30,0.9)'
  c.lineWidth = S * 0.012
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    c.beginPath()
    c.arc(o, o, R * 0.8, a + 0.25, a + Math.PI / 2 - 0.25)
    c.stroke()
  }
  tex.update()

  const mat = new StandardMaterial('target-marker-mat', scene)
  mat.disableLighting = true
  mat.diffuseColor = Color3.Black()
  mat.specularColor = Color3.Black()
  mat.emissiveTexture = tex
  mat.opacityTexture = tex
  mat.backFaceCulling = false
  mat.disableDepthWrite = true
  return { tex, mat }
}

export class TargetMarker {
  private plane: Mesh
  private assets: Assets

  constructor(scene: Scene) {
    let assets = cache.get(scene)
    if (!assets) { assets = buildAssets(scene); cache.set(scene, assets) }
    this.assets = assets
    this.plane = MeshBuilder.CreatePlane('target-marker', { size: 1 }, scene)
    // Full billboard: the ring stands around the body facing the overhead camera
    this.plane.billboardMode = TransformNode.BILLBOARDMODE_ALL
    this.plane.material = assets.mat
    this.plane.isPickable = false
  }

  update(x: number, z: number, height: number, size: number, ageMs: number): void {
    const intro = Math.min(1, ageMs / 220)
    this.plane.position.set(x, height * 0.55, z)
    const d = Math.max(2.2, height * 1.5, size * 3)
    this.plane.scaling.setAll(d * (1.3 - 0.3 * intro))
    this.plane.visibility = intro
    // Billboards drop mesh rotation: spin the (shared) texture instead
    this.assets.tex.wAng = -ageMs / 900
  }

  dispose(): void {
    this.plane.dispose()
  }
}
