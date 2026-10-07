// src/renderer/vfx/tankbuster-marker.ts
// FFXIV tankbuster head marker, built in 3D so it reads from any camera angle: a white
// double chevron pressing down over the head, a red/black hazard-striped band around the
// body and a broken hazard-striped ring on the floor.
import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture, TransformNode,
  type Scene,
} from '@babylonjs/core'

const RED = '#e8141c'
const BLACK = '#140405'

interface Assets {
  band: StandardMaterial
  floor: StandardMaterial
  chevron: StandardMaterial
}

const cache = new WeakMap<Scene, Assets>()

function alphaMaterial(name: string, scene: Scene, tex: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene)
  m.disableLighting = true
  m.diffuseColor = Color3.Black()
  m.specularColor = Color3.Black()
  m.emissiveColor = Color3.Black()
  m.emissiveTexture = tex
  m.opacityTexture = tex
  m.backFaceCulling = false
  m.disableDepthWrite = true
  return m
}

function stripes(ctx: CanvasRenderingContext2D, w: number, h: number, period: number): void {
  ctx.fillStyle = RED
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = BLACK
  // Diagonal hazard stripes; whole periods across the width so the band tiles seamlessly
  for (let x = -h; x < w + h; x += period) {
    ctx.beginPath()
    ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.lineTo(x + h + period * 0.42, 0); ctx.lineTo(x + period * 0.42, h)
    ctx.closePath()
    ctx.fill()
  }
}

function buildAssets(scene: Scene): Assets {
  // Band: stripes wrapped around an open cylinder
  const bandTex = new DynamicTexture('tb-band', { width: 512, height: 64 }, scene, true)
  const b = bandTex.getContext() as CanvasRenderingContext2D
  stripes(b, 512, 64, 512 / 12)
  b.fillStyle = 'rgba(0,0,0,0.5)'
  b.fillRect(0, 0, 512, 4); b.fillRect(0, 60, 512, 4)
  bandTex.update()
  bandTex.wrapU = Texture.WRAP_ADDRESSMODE
  bandTex.uScale = 2
  const band = new StandardMaterial('tb-band-mat', scene)
  band.disableLighting = true
  band.diffuseColor = Color3.Black()
  band.specularColor = Color3.Black()
  band.emissiveTexture = bandTex
  band.backFaceCulling = false

  // Floor: three striped arcs with gaps
  const S = 512
  const floorTex = new DynamicTexture('tb-floor', { width: S, height: S }, scene, true)
  floorTex.hasAlpha = true
  const f = floorTex.getContext() as CanvasRenderingContext2D
  f.clearRect(0, 0, S, S)
  const pattern = document.createElement('canvas')
  pattern.width = 64; pattern.height = 64
  stripes(pattern.getContext('2d')!, 64, 64, 32)
  f.strokeStyle = f.createPattern(pattern, 'repeat')!
  f.lineWidth = 46
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    f.beginPath()
    f.arc(S / 2, S / 2, S / 2 - 30, a, a + (Math.PI * 2) / 3 - 0.55)
    f.stroke()
  }
  floorTex.update()
  const floor = alphaMaterial('tb-floor-mat', scene, floorTex)

  // Chevron: two white downward chevrons with a red glow
  const chevTex = new DynamicTexture('tb-chevron', { width: 256, height: 256 }, scene, true)
  chevTex.hasAlpha = true
  const c = chevTex.getContext() as CanvasRenderingContext2D
  c.clearRect(0, 0, 256, 256)
  const glow = c.createRadialGradient(128, 128, 10, 128, 128, 128)
  glow.addColorStop(0, 'rgba(232,20,28,0.55)')
  glow.addColorStop(1, 'rgba(232,20,28,0)')
  c.fillStyle = glow
  c.fillRect(0, 0, 256, 256)
  c.shadowColor = '#ff3a3a'
  c.shadowBlur = 22
  c.fillStyle = '#fff6f6'
  for (const [y, s] of [[58, 0.8], [124, 1]] as const) {
    c.beginPath()
    c.moveTo(128 - 52 * s, y - 26 * s)
    c.lineTo(128, y + 26 * s)
    c.lineTo(128 + 52 * s, y - 26 * s)
    c.lineTo(128 + 52 * s, y + 10 * s)
    c.lineTo(128, y + 62 * s)
    c.lineTo(128 - 52 * s, y + 10 * s)
    c.closePath()
    c.fill()
  }
  chevTex.update()
  const chevron = alphaMaterial('tb-chevron-mat', scene, chevTex)
  return { band, floor, chevron }
}

export class TankbusterMarker {
  private root: TransformNode
  private band: Mesh
  private floor: Mesh
  private chevron: Mesh

  constructor(scene: Scene) {
    let assets = cache.get(scene)
    if (!assets) { assets = buildAssets(scene); cache.set(scene, assets) }
    this.root = new TransformNode('tb-marker', scene)

    this.band = MeshBuilder.CreateCylinder('tb-band', { height: 0.45, diameter: 1, tessellation: 48, cap: Mesh.NO_CAP }, scene)
    this.band.material = assets.band
    this.band.parent = this.root

    this.floor = MeshBuilder.CreateGround('tb-floor', { width: 1, height: 1 }, scene)
    this.floor.material = assets.floor
    this.floor.position.y = 0.06
    this.floor.parent = this.root

    this.chevron = MeshBuilder.CreatePlane('tb-chevron', { size: 1 }, scene)
    // Full billboard: a Y-only billboard is seen almost edge-on from the overhead camera
    this.chevron.billboardMode = TransformNode.BILLBOARDMODE_ALL
    this.chevron.material = assets.chevron
    this.chevron.parent = this.root

    for (const m of [this.band, this.floor, this.chevron]) m.isPickable = false
  }

  /** Follow a target at ground position (x, z) with the given body height and hitbox radius. */
  update(x: number, z: number, height: number, radius: number, age: number): void {
    this.root.position.set(x, 0, z)
    const intro = Math.min(1, age / 220)
    // Markers dwarf the character on purpose: they must read from the overhead camera
    const r = Math.max(1.3, radius + 0.8)

    this.band.position.y = height * 0.55
    this.band.scaling.set(r * 2 * (1.3 - 0.3 * intro), 1, r * 2 * (1.3 - 0.3 * intro))
    this.band.rotation.y = age / 900

    const fr = r * 2 * 1.6
    this.floor.scaling.set(fr, 1, fr)
    this.floor.rotation.y = -age / 1400

    // Chevrons press down onto the head in a repeating beat
    const beat = (age % 900) / 900
    this.chevron.position.y = height + 1.6 + 0.5 * (1 - beat)
    this.chevron.scaling.setAll(3.2 * (0.95 + 0.05 * Math.sin(age / 90)))
    this.chevron.visibility = intro * (0.75 + 0.25 * (1 - beat))
  }

  dispose(): void {
    this.root.dispose()
  }
}
