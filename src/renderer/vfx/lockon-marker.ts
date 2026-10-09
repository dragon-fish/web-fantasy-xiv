// src/renderer/vfx/lockon-marker.ts
// FFXIV "you are targeted" head marker: a red crystal sigil (a long blade pointing down, swept
// side wings, a small finial) floating over the head, over a dark red ring on the floor.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial, TransformNode,
  type Mesh, type Scene, type Texture,
} from '@babylonjs/core'

interface Assets {
  sigil: StandardMaterial
  ring: StandardMaterial
}

const cache = new WeakMap<Scene, Assets>()

function alphaMaterial(name: string, scene: Scene, tex: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene)
  m.disableLighting = true
  m.diffuseColor = Color3.Black()
  m.specularColor = Color3.Black()
  m.emissiveTexture = tex
  m.opacityTexture = tex
  m.backFaceCulling = false
  m.disableDepthWrite = true
  return m
}

function buildAssets(scene: Scene): Assets {
  const W = 256
  const H = 320
  const tex = new DynamicTexture('lockon-sigil', { width: W, height: H }, scene, true)
  tex.hasAlpha = true
  const c = tex.getContext() as CanvasRenderingContext2D
  c.clearRect(0, 0, W, H)
  const cx = W / 2
  const crystal = (y0: number, y1: number) => {
    const g = c.createLinearGradient(cx - 40, 0, cx + 40, 0)
    g.addColorStop(0, '#5a0606')
    g.addColorStop(0.42, '#e0401a')
    g.addColorStop(0.5, '#ffd27a')
    g.addColorStop(0.58, '#e0401a')
    g.addColorStop(1, '#5a0606')
    return g
  }
  c.shadowColor = 'rgba(255,60,20,0.85)'
  c.shadowBlur = 24
  // Side wings, swept up and out from the guard
  for (const side of [-1, 1]) {
    c.beginPath()
    c.moveTo(cx + side * 14, 118)
    c.lineTo(cx + side * 70, 70)
    c.lineTo(cx + side * 104, 96)
    c.lineTo(cx + side * 78, 112)
    c.lineTo(cx + side * 96, 150)
    c.lineTo(cx + side * 22, 152)
    c.closePath()
    c.fillStyle = crystal(70, 152)
    c.fill()
  }
  // Main blade pointing down
  c.beginPath()
  c.moveTo(cx, 44)
  c.lineTo(cx + 26, 118)
  c.lineTo(cx + 16, 170)
  c.lineTo(cx, 300)
  c.lineTo(cx - 16, 170)
  c.lineTo(cx - 26, 118)
  c.closePath()
  c.fillStyle = crystal(44, 300)
  c.fill()
  // Finial
  c.beginPath()
  c.moveTo(cx, 6)
  c.lineTo(cx + 12, 30)
  c.lineTo(cx, 46)
  c.lineTo(cx - 12, 30)
  c.closePath()
  c.fill()
  // Facet highlight down the blade
  c.shadowBlur = 0
  c.strokeStyle = 'rgba(255,240,200,0.75)'
  c.lineWidth = 3
  c.beginPath()
  c.moveTo(cx, 52)
  c.lineTo(cx, 280)
  c.stroke()
  tex.update()

  const S = 256
  const ringTex = new DynamicTexture('lockon-ring', { width: S, height: S }, scene, true)
  ringTex.hasAlpha = true
  const r = ringTex.getContext() as CanvasRenderingContext2D
  r.clearRect(0, 0, S, S)
  const g = r.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.5)
  g.addColorStop(0, 'rgba(120,20,10,0)')
  g.addColorStop(0.55, 'rgba(150,30,14,0.85)')
  g.addColorStop(0.8, 'rgba(90,14,8,0.6)')
  g.addColorStop(1, 'rgba(60,8,4,0)')
  r.fillStyle = g
  r.fillRect(0, 0, S, S)
  ringTex.update()

  return { sigil: alphaMaterial('lockon-sigil-mat', scene, tex), ring: alphaMaterial('lockon-ring-mat', scene, ringTex) }
}

export class LockOnMarker {
  private root: TransformNode
  private sigil: Mesh
  private ring: Mesh

  constructor(scene: Scene) {
    let assets = cache.get(scene)
    if (!assets) { assets = buildAssets(scene); cache.set(scene, assets) }
    this.root = new TransformNode('lockon-marker', scene)
    this.sigil = MeshBuilder.CreatePlane('lockon-sigil', { width: 1, height: 1.25 }, scene)
    // Full billboard: a Y-only billboard is seen almost edge-on from the overhead camera
    this.sigil.billboardMode = TransformNode.BILLBOARDMODE_ALL
    this.sigil.material = assets.sigil
    this.sigil.parent = this.root
    this.ring = MeshBuilder.CreateGround('lockon-ring', { width: 1, height: 1 }, scene)
    this.ring.material = assets.ring
    this.ring.position.y = 0.05
    this.ring.parent = this.root
    for (const m of [this.sigil, this.ring]) m.isPickable = false
  }

  update(x: number, z: number, headY: number, size: number, ageMs: number): void {
    this.root.position.set(x, 0, z)
    const intro = Math.min(1, ageMs / 220)
    this.sigil.position.y = headY + 1.6 + Math.sin(ageMs / 380) * 0.1
    this.sigil.scaling.setAll(2.4 * (1.35 - 0.35 * intro))
    this.sigil.visibility = intro
    const d = Math.max(1.6, size * 2 + 1.2)
    this.ring.scaling.set(d, 1, d)
    this.ring.visibility = 0.9 * intro
  }

  dispose(): void {
    this.root.dispose(false, true)
  }
}
