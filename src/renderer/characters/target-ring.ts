// src/renderer/characters/target-ring.ts
// FFXIV lock-on ring under the player's current target: wide dark band with a white rim, a light
// inner band, a teardrop arrow out front, flank chevrons and a 90° rear opening. FFXIV lets the
// player recolour it per relation, so the texture is drawn from a tint (one canvas per relation).
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial,
  type Mesh, type Scene, type TransformNode,
} from '@babylonjs/core'

const TEX = 1024
const C = TEX / 2
/** Geometry is authored in reference units (outer rim radius 762) and scaled into the canvas */
const K = 0.47
/** The band's centre line sits on the target's hitbox edge */
const HITBOX_REF = 725
const MIN_RADIUS = 0.7
const PULSE_MS = 1400
const GAP = 90 // rear opening, degrees

type Relation = 'hostile' | 'player' | 'neutral'

const RELATION_TINT: Record<Relation, Color3> = {
  hostile: new Color3(0.87, 0.03, 0.03),
  player: new Color3(0.2, 0.5, 1),
  neutral: new Color3(1, 0.75, 0.15),
}

function relationOf(type: string): Relation {
  if (type === 'boss' || type === 'mob') return 'hostile'
  if (type === 'player') return 'player'
  return 'neutral'
}

function css(c: Color3, alpha = 1): string {
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`
}

function drawRing(ctx: CanvasRenderingContext2D, tint: Color3): void {
  const white = new Color3(1, 0.96, 0.96)
  const deep = tint.scale(0.55)
  const light = Color3.Lerp(tint, white, 0.5)
  // Canvas angles run clockwise from +X; the rear (bottom, +90°) stays open, cut radially
  const from = ((90 + GAP / 2) * Math.PI) / 180
  const to = ((90 - GAP / 2 + 360) * Math.PI) / 180
  const band = (r: number, width: number, style: string | CanvasGradient, blur = 0, glow = 'transparent') => {
    ctx.shadowBlur = blur * K
    ctx.shadowColor = glow
    ctx.lineWidth = width * K
    ctx.strokeStyle = style
    ctx.beginPath()
    ctx.arc(C, C, r * K, from, to)
    ctx.stroke()
  }

  ctx.clearRect(0, 0, TEX, TEX)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'round'

  // Halo fading out from the rim, then the bands from the outside in
  const halo = ctx.createRadialGradient(C, C, 740 * K, C, C, 890 * K)
  halo.addColorStop(0, css(tint.scale(0.8), 0.95))
  halo.addColorStop(0.45, css(tint.scale(0.7), 0.6))
  halo.addColorStop(1, css(tint.scale(0.6), 0))
  band(815, 150, halo)
  band(725, 74, css(deep), 0)
  band(670, 38, css(tint), 24, css(tint))
  band(640, 26, css(light), 10, css(tint))
  band(642, 3, css(white))
  band(762, 9, css(white), 22, css(tint))

  ctx.save()
  ctx.translate(C, C)
  ctx.scale(K, K)

  // Front teardrop arrow just outside the rim, with a stem down into the band
  const teardrop = (tip: number, base: number, half: number) => {
    ctx.beginPath()
    ctx.moveTo(0, -tip)
    ctx.bezierCurveTo(half * 0.75, -tip + 40, half, -base - 70, half, -base)
    ctx.lineTo(half * 0.35, -base - 22)
    ctx.lineTo(0, -base + 10)
    ctx.lineTo(-half * 0.35, -base - 22)
    ctx.lineTo(-half, -base)
    ctx.bezierCurveTo(-half, -base - 70, -half * 0.75, -tip + 40, 0, -tip)
    ctx.closePath()
  }
  ctx.shadowBlur = 50
  ctx.shadowColor = css(deep)
  teardrop(1010, 780, 100)
  ctx.fillStyle = css(tint.scale(0.7), 0.9)
  ctx.fill()
  ctx.shadowBlur = 18
  ctx.shadowColor = css(tint)
  teardrop(990, 790, 86)
  ctx.fillStyle = css(white)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 8
  ctx.strokeStyle = css(tint)
  teardrop(920, 800, 40)
  ctx.stroke()
  // Slot and stem
  ctx.fillStyle = css(tint)
  ctx.beginPath()
  ctx.ellipse(0, -858, 10, 40, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = css(white)
  ctx.fillRect(-8, -800, 16, 50)

  // Flank chevrons (pointing forward) with a small diamond below, sitting on the band
  const chevron = (x: number) => {
    ctx.save()
    ctx.translate(x, -8)
    ctx.scale(1.35, 1.35)
    ctx.beginPath()
    ctx.moveTo(-44, 14); ctx.lineTo(0, -38); ctx.lineTo(44, 14)
    ctx.lineTo(30, 22); ctx.lineTo(0, -12); ctx.lineTo(-30, 22)
    ctx.closePath()
    ctx.moveTo(0, 26); ctx.lineTo(14, 44); ctx.lineTo(0, 62); ctx.lineTo(-14, 44)
    ctx.closePath()
    ctx.shadowBlur = 16
    ctx.shadowColor = css(tint)
    ctx.fillStyle = css(tint)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.lineWidth = 5
    ctx.strokeStyle = css(white)
    ctx.stroke()
    ctx.restore()
  }
  chevron(-705)
  chevron(705)
  ctx.restore()
}

export class TargetRing {
  private mesh: Mesh
  private mat: StandardMaterial
  private textures = new Map<Relation, DynamicTexture>()
  private attachedTo: TransformNode | null = null
  private t = 0

  constructor(private scene: Scene) {
    this.mat = new StandardMaterial('target-ring-mat', scene)
    this.mat.disableLighting = true
    this.mat.diffuseColor = Color3.Black()
    this.mat.specularColor = Color3.Black()
    this.mat.emissiveColor = Color3.Black()
    this.mat.disableDepthWrite = true

    this.mesh = MeshBuilder.CreateGround('target-ring', { width: 1, height: 1 }, scene)
    this.mesh.material = this.mat
    this.mesh.isPickable = false
    // Depth-tested in the main group: lies on the floor, bodies standing in it occlude it
    this.mesh.position.y = 0.04
    this.mesh.setEnabled(false)
  }

  private texture(relation: Relation): DynamicTexture {
    let tex = this.textures.get(relation)
    if (!tex) {
      tex = new DynamicTexture(`target-ring-${relation}`, { width: TEX, height: TEX }, this.scene, true)
      tex.hasAlpha = true
      drawRing(tex.getContext() as CanvasRenderingContext2D, RELATION_TINT[relation])
      // invertY: canvas top (the arrow) must land on local +Z, the entity's forward
      tex.update(true)
      this.textures.set(relation, tex)
    }
    return tex
  }

  /** Track `root` (position and facing) at hitbox `radius`; null hides the ring. */
  follow(root: TransformNode | null, radius: number, type: string, dt: number): void {
    if (root !== this.attachedTo) {
      this.attachedTo = root
      this.t = 0
      if (root) {
        const tex = this.texture(relationOf(type))
        this.mat.emissiveTexture = tex
        this.mat.opacityTexture = tex
      }
    }
    this.mesh.setEnabled(!!root)
    if (!root) return
    this.t += dt
    // Not parented: the target's root is disposed with its corpse and would take the ring with it
    this.mesh.position.x = root.position.x
    this.mesh.position.z = root.position.z
    this.mesh.rotation.y = root.rotation.y
    const scale = (TEX * Math.max(MIN_RADIUS, radius)) / (HITBOX_REF * K)
    // Snap in from slightly larger on lock, then breathe gently
    const s = scale * (1 + 0.25 * Math.max(0, 1 - this.t / 160))
    this.mesh.scaling.set(s, 1, s)
    this.mat.alpha = 0.88 + 0.12 * Math.sin((this.t / PULSE_MS) * Math.PI * 2)
  }
}
