// src/renderer/characters/target-ring.ts
// FFXIV lock-on ring under the player's current target. The texture is the game's grayscale
// ring (FFXIV lets players pick the colour per relation), tinted here by what the target is.
import {
  Color3, MeshBuilder, StandardMaterial,
  type Mesh, type Scene, type TransformNode,
} from '@babylonjs/core'
import { vfxTexture } from '../vfx/vfx-assets'

/** Texture size and ring centre-line radius (px) of target_ring.png */
const TEX = 512
const R = 145.5
const MIN_RADIUS = 0.7
const PULSE_MS = 1400

const RELATION_TINT: Record<string, Color3> = {
  hostile: new Color3(0.95, 0.2, 0.16),
  player: new Color3(0.3, 0.6, 1),
  neutral: new Color3(1, 0.8, 0.3),
}

function relationOf(type: string): keyof typeof RELATION_TINT {
  if (type === 'boss' || type === 'mob') return 'hostile'
  if (type === 'player') return 'player'
  return 'neutral'
}

export class TargetRing {
  private mesh: Mesh
  private mat: StandardMaterial
  private attachedTo: TransformNode | null = null
  private t = 0

  constructor(scene: Scene) {
    const tex = vfxTexture(scene, 'targetRing')
    this.mat = new StandardMaterial('target-ring-mat', scene)
    this.mat.disableLighting = true
    this.mat.diffuseColor = Color3.Black()
    this.mat.specularColor = Color3.Black()
    // emissiveTexture is ADDED to emissiveColor: tint everywhere, a hot core where the mask peaks.
    // Separate clone so its level doesn't also thin out the opacity.
    const core = tex.clone()
    core.level = 0.4
    this.mat.emissiveTexture = core
    this.mat.opacityTexture = tex
    this.mat.opacityTexture.getAlphaFromRGB = true
    this.mat.disableDepthWrite = true

    this.mesh = MeshBuilder.CreateGround('target-ring', { width: 1, height: 1 }, scene)
    this.mesh.material = this.mat
    this.mesh.isPickable = false
    // Depth-tested in the main group: lies on the floor, bodies standing in it occlude it
    this.mesh.position.y = 0.04
    this.mesh.setEnabled(false)
  }

  /** Track `root` (position and facing) at hitbox `radius`; null hides the ring. */
  follow(root: TransformNode | null, radius: number, type: string, dt: number): void {
    if (root !== this.attachedTo) {
      this.attachedTo = root
      this.t = 0
      this.mat.emissiveColor = RELATION_TINT[relationOf(type)]
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
    this.mat.alpha = 0.85 + 0.15 * Math.sin((this.t / PULSE_MS) * Math.PI * 2)
  }
}
