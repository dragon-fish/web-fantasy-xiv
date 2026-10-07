// src/renderer/arena-props.ts
// Set dressing outside the walkable arena: CC0 ruins/crystal/torch models
// (public/models/props), tinted per theme. Models stream in asynchronously;
// flames are particle systems so they appear immediately.
import {
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, TransformNode, ParticleSystem,
  type Scene, type AbstractMesh, type Mesh,
} from '@babylonjs/core'
import type { ArenaPropKind, ArenaTheme } from './arena-theme'
import { fxTexture } from './fx-textures'
import { ModelLibrary } from './characters/model-library'

export interface ArenaProp {
  root: TransformNode
  /** Resolves with meshes to register as shadow casters / glow once the model has loaded */
  loaded: Promise<{ casters: AbstractMesh[]; glows: AbstractMesh[] }>
}

const P = 'models/props/'

export function buildProp(scene: Scene, kind: ArenaPropKind, theme: ArenaTheme, rand: () => number, opts: { floating: boolean }): ArenaProp {
  const lib = ModelLibrary.for(scene)
  const root = new TransformNode(`prop-${kind}`, scene)
  const stone = Color3.FromHexString(theme.tile).scale(1.35)
  const accent = Color3.FromHexString(theme.accent)
  const jobs: Promise<{ casters: AbstractMesh[]; glows: AbstractMesh[] }>[] = []
  const place = (url: string, height: number, o: Parameters<ModelLibrary['instantiateProp']>[3], glow = false, y = 0, x = 0, z = 0, yaw = 0) => {
    jobs.push(lib.instantiateProp(P + url, `prop-${kind}`, height, o).then(({ root: r, meshes }) => {
      r.parent = root
      r.position.addInPlace(new Vector3(x, y, z))
      r.rotation.y = yaw
      return { casters: meshes, glows: glow ? meshes : [] }
    }))
  }

  if (opts.floating) {
    place('rock-large.glb', 2.2 + rand(), { recolor: Color3.FromHexString(theme.cliff).scale(1.6) }, false, -2.4)
  }

  switch (kind) {
    case 'pillar': {
      const r = rand()
      if (r < 0.45) {
        place('column-round.glb', 5 + rand() * 1.5, { recolor: stone })
        accentBand(scene, root, accent, 2.6 + rand() * 0.8)
      } else if (r < 0.7) {
        place('column-round-short.glb', 1.8 + rand() * 0.6, { recolor: stone })
      } else if (r < 0.85) {
        place('arch-round.glb', 4.5, { recolor: stone })
      } else {
        place('wall-broken.glb', 2.4, { recolor: stone })
      }
      break
    }
    case 'brazier': {
      if (rand() < 0.6) {
        const h = 2.6
        place('torch.glb', h, { emissive: accent.scale(0.15) })
        flame(scene, root, new Vector3(0, h * 0.93, 0), theme.accent, 0.8)
      } else {
        place('fire-pit.glb', 0.75, { recolor: stone })
        flame(scene, root, new Vector3(0, 0.45, 0), theme.accent, 1.5)
      }
      break
    }
    case 'crystal': {
      // Emissive only: adding crystals to the glow layer on top of bloom smears them into blobs
      const recolor = accent.scale(0.8)
      const emissive = accent.scale(0.22)
      place('big-crystal.glb', 2.6 + rand() * 1.4, { recolor, emissive })
      if (rand() < 0.7) place('crystal.glb', 1.1 + rand() * 0.6, { recolor, emissive }, false, 0, 1.2, 0.6, rand() * 6)
      break
    }
    case 'rock': {
      place('rock-large.glb', 1 + rand() * 1.6, { recolor: Color3.FromHexString(theme.tile).scale(0.72) })
      if (rand() < 0.5) place('rock-large.glb', 0.6 + rand() * 0.6, { recolor: Color3.FromHexString(theme.tile).scale(0.62) }, false, 0, 1.4, -0.8, rand() * 6)
      break
    }
  }

  const loaded = Promise.allSettled(jobs).then(results => {
    const out = { casters: [] as AbstractMesh[], glows: [] as AbstractMesh[] }
    for (const r of results) {
      if (r.status === 'fulfilled') { out.casters.push(...r.value.casters); out.glows.push(...r.value.glows) }
      else console.warn('[arena-props] prop model failed to load', r.reason)
    }
    return out
  })
  return { root, loaded }
}

const bandMaterials = new WeakMap<Scene, Map<string, StandardMaterial>>()
function accentBand(scene: Scene, parent: TransformNode, accent: Color3, y: number): Mesh {
  let m = bandMaterials.get(scene)
  if (!m) { m = new Map(); bandMaterials.set(scene, m) }
  const key = accent.toHexString()
  let mat = m.get(key)
  if (!mat) {
    mat = new StandardMaterial(`prop-band-${key}`, scene)
    mat.disableLighting = true
    mat.emissiveColor = accent
    m.set(key, mat)
  }
  const band = MeshBuilder.CreateTorus('prop-pillar-band', { diameter: 1.15, thickness: 0.07, tessellation: 24 }, scene)
  band.parent = parent
  band.position.y = y
  band.material = mat
  band.isPickable = false
  return band
}

function flame(scene: Scene, parent: TransformNode, offset: Vector3, hex: string, scale: number): void {
  const ps = new ParticleSystem('prop-flame', 70, scene)
  ps.particleTexture = fxTexture(scene, 'dot')
  const emitter = new TransformNode('prop-flame-emitter', scene)
  emitter.parent = parent
  emitter.position.copyFrom(offset)
  ps.emitter = emitter as any
  ps.minEmitBox = new Vector3(-0.12, 0, -0.12).scale(scale)
  ps.maxEmitBox = new Vector3(0.12, 0, 0.12).scale(scale)
  const c = Color3.FromHexString(hex)
  ps.color1 = new Color4(1, 0.85, 0.5, 0.9)
  ps.color2 = new Color4(c.r, c.g, c.b, 0.9)
  ps.colorDead = new Color4(c.r * 0.3, 0, 0, 0)
  ps.minLifeTime = 0.25
  ps.maxLifeTime = 0.6
  ps.emitRate = 50 * scale
  ps.direction1 = new Vector3(-0.08, 1, -0.08)
  ps.direction2 = new Vector3(0.08, 1.3, 0.08)
  ps.minEmitPower = 0.7 * scale
  ps.maxEmitPower = 1.2 * scale
  ps.addSizeGradient(0, 0.38 * scale)
  ps.addSizeGradient(1, 0.04)
  ps.blendMode = ParticleSystem.BLENDMODE_ADD
  ps.start()
}
