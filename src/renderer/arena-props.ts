// src/renderer/arena-props.ts
// Procedural low-poly set dressing placed outside the walkable arena.
import {
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, TransformNode, ParticleSystem,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { ArenaPropKind, ArenaTheme } from './arena-theme'
import { fxTexture } from './fx-textures'

export interface ArenaProp {
  root: TransformNode
  casters: Mesh[]
  glows: Mesh[]
}

const materials = new WeakMap<Scene, Map<string, StandardMaterial>>()
function mat(scene: Scene, hex: string, emissive = 0, unlit = false): StandardMaterial {
  let m = materials.get(scene)
  if (!m) { m = new Map(); materials.set(scene, m) }
  const key = `${hex}-${emissive}-${unlit}`
  let out = m.get(key)
  if (!out) {
    out = new StandardMaterial(`prop-${key}`, scene)
    out.diffuseColor = Color3.FromHexString(hex)
    out.emissiveColor = out.diffuseColor.scale(emissive)
    out.specularColor = new Color3(0.05, 0.05, 0.05)
    out.disableLighting = unlit
    m.set(key, out)
  }
  return out
}

function stoneColor(theme: ArenaTheme, k = 1): string {
  return Color3.FromHexString(theme.tile).scale(k).toHexString()
}

export function buildProp(scene: Scene, kind: ArenaPropKind, theme: ArenaTheme, rand: () => number, opts: { floating: boolean }): ArenaProp {
  const root = new TransformNode(`prop-${kind}`, scene)
  const casters: Mesh[] = []
  const glows: Mesh[] = []
  const add = (m: Mesh) => { m.parent = root; m.isPickable = false; m.receiveShadows = true; casters.push(m); return m }

  if (opts.floating) {
    // Floating rock chunk beneath every prop on lethal arenas
    const rock = add(MeshBuilder.CreateIcoSphere('prop-rock', { radius: 1.6 + rand(), subdivisions: 1, flat: true }, scene))
    rock.scaling.set(1.2, 0.7, 1.1)
    rock.position.y = -0.6
    rock.material = mat(scene, theme.cliff)
  }

  switch (kind) {
    case 'pillar': {
      const broken = rand() < 0.4
      const h = broken ? 1.5 + rand() * 2 : 4 + rand() * 2.5
      const base = add(MeshBuilder.CreateBox('prop-pillar-base', { width: 1.5, height: 0.5, depth: 1.5 }, scene))
      base.position.y = 0.25
      base.material = mat(scene, stoneColor(theme, 0.85))
      const shaft = add(MeshBuilder.CreateCylinder('prop-pillar', { height: h, diameterTop: 0.9, diameterBottom: 1.05, tessellation: 10 }, scene))
      shaft.position.y = 0.5 + h / 2
      shaft.rotation.z = (rand() - 0.5) * 0.06
      shaft.material = mat(scene, stoneColor(theme, 1.15))
      shaft.convertToFlatShadedMesh()
      if (!broken) {
        const cap = add(MeshBuilder.CreateBox('prop-pillar-cap', { width: 1.4, height: 0.4, depth: 1.4 }, scene))
        cap.position.y = 0.5 + h + 0.2
        cap.material = base.material
        // Accent rune band
        const band = MeshBuilder.CreateTorus('prop-pillar-band', { diameter: 1.02, thickness: 0.08, tessellation: 24 }, scene)
        band.parent = root
        band.position.y = 0.5 + h * 0.62
        band.material = mat(scene, theme.accent, 1, true)
        glows.push(band)
      } else {
        // Rubble at the foot
        for (let i = 0; i < 3; i++) {
          const r = add(MeshBuilder.CreateBox('prop-rubble', { size: 0.35 + rand() * 0.3 }, scene))
          r.position.set((rand() - 0.5) * 2.4, 0.15, (rand() - 0.5) * 2.4)
          r.rotation.set(rand(), rand(), rand())
          r.material = shaft.material
        }
      }
      break
    }
    case 'brazier': {
      const legs = add(MeshBuilder.CreateCylinder('prop-brazier-stand', { height: 1.1, diameterTop: 0.25, diameterBottom: 0.7, tessellation: 6 }, scene))
      legs.position.y = 0.55
      legs.material = mat(scene, '#2b2522')
      const bowl = add(MeshBuilder.CreateCylinder('prop-brazier-bowl', { height: 0.45, diameterTop: 1.2, diameterBottom: 0.5, tessellation: 10 }, scene))
      bowl.position.y = 1.3
      bowl.material = mat(scene, '#3c3029')
      const coals = MeshBuilder.CreateDisc('prop-brazier-coals', { radius: 0.5, tessellation: 12 }, scene)
      coals.parent = root
      coals.rotation.x = Math.PI / 2
      coals.position.y = 1.5
      coals.material = mat(scene, theme.accent, 1.2, true)
      glows.push(coals)
      flame(scene, root, new Vector3(0, 1.55, 0), theme.accent)
      break
    }
    case 'crystal': {
      const cluster = 1 + Math.floor(rand() * 3)
      for (let i = 0; i < cluster; i++) {
        const c = MeshBuilder.CreatePolyhedron('prop-crystal', { type: 1, size: 0.5 + rand() * 0.35 }, scene)
        c.parent = root
        c.isPickable = false
        c.scaling.set(1, 2.6 + rand(), 1)
        c.position.set((rand() - 0.5) * 1.4, 1.2 + rand() * 0.6, (rand() - 0.5) * 1.4)
        c.rotation.set((rand() - 0.5) * 0.5, rand() * 3, (rand() - 0.5) * 0.5)
        const cm = mat(scene, theme.accent, 0.55)
        cm.alpha = 0.85
        c.material = cm
        casters.push(c)
        glows.push(c)
      }
      const base = add(MeshBuilder.CreateIcoSphere('prop-crystal-base', { radius: 0.8, subdivisions: 1, flat: true }, scene))
      base.scaling.y = 0.45
      base.material = mat(scene, stoneColor(theme, 0.75))
      break
    }
    case 'rock': {
      const n = 1 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const r = add(MeshBuilder.CreateIcoSphere('prop-rock', { radius: 0.6 + rand() * 1.1, subdivisions: 1, flat: true }, scene))
        r.scaling.set(1 + rand() * 0.6, 0.5 + rand() * 0.6, 1 + rand() * 0.5)
        r.position.set((rand() - 0.5) * 2, 0.2, (rand() - 0.5) * 2)
        r.rotation.y = rand() * 3
        r.material = mat(scene, stoneColor(theme, 0.7 + rand() * 0.3))
      }
      break
    }
  }
  return { root, casters, glows }
}

function flame(scene: Scene, parent: TransformNode, offset: Vector3, hex: string): void {
  const ps = new ParticleSystem('prop-flame', 60, scene)
  ps.particleTexture = fxTexture(scene, 'dot')
  const emitter = new TransformNode('prop-flame-emitter', scene)
  emitter.parent = parent
  emitter.position.copyFrom(offset)
  ps.emitter = emitter as any
  ps.minEmitBox = new Vector3(-0.25, 0, -0.25)
  ps.maxEmitBox = new Vector3(0.25, 0, 0.25)
  const c = Color3.FromHexString(hex)
  ps.color1 = new Color4(1, 0.8, 0.45, 0.8)
  ps.color2 = new Color4(c.r, c.g, c.b, 1)
  ps.colorDead = new Color4(c.r * 0.3, 0, 0, 0)
  ps.minLifeTime = 0.3
  ps.maxLifeTime = 0.7
  ps.emitRate = 60
  ps.direction1 = new Vector3(-0.1, 1, -0.1)
  ps.direction2 = new Vector3(0.1, 1.4, 0.1)
  ps.minEmitPower = 0.8
  ps.maxEmitPower = 1.4
  ps.addSizeGradient(0, 0.45)
  ps.addSizeGradient(1, 0.05)
  ps.blendMode = ParticleSystem.BLENDMODE_ADD
  ps.start()
}
