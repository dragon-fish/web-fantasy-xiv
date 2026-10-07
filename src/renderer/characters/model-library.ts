// src/renderer/characters/model-library.ts
// Loads glTF models once per scene into AssetContainers and stamps out
// independent instances (own skeleton, animation groups and materials).
import {
  LoadAssetContainerAsync, TransformNode, Color3, PBRMaterial, StandardMaterial,
  type AssetContainer, type Scene, type AbstractMesh, type AnimationGroup, type Node, type Material,
} from '@babylonjs/core'
// Static import registers the glTF plugin on the same @babylonjs/core instance Vite pre-bundles.
// Do not switch to `@babylonjs/loaders/dynamic`: its lazy import() is served un-bundled in dev
// and registers into a duplicate core copy ("Unable to find a plugin to load .glb files").
import '@babylonjs/loaders/glTF'
import type { ModelSpec } from './model-catalog'

export interface ModelInstance {
  /** Root to position/rotate; already scaled & grounded */
  root: TransformNode
  meshes: AbstractMesh[]
  materials: StandardMaterial[]
  animations: Map<string, AnimationGroup>
  dispose(): void
}

interface Prepared {
  container: AssetContainer
  /** Uniform scale that maps the model's bind-pose height to 1 meter */
  unitScale: number
  /** Bind-pose bottom (model units), to lift feet onto the ground */
  minY: number
}

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

export interface PropOptions {
  /** Multiply albedo */
  tint?: Color3
  /** Replace albedo and drop the texture; per-material brightness is kept so dark trims stay dark */
  recolor?: Color3
  emissive?: Color3
}

const libraries = new WeakMap<Scene, ModelLibrary>()

export class ModelLibrary {
  private prepared = new Map<string, Promise<Prepared>>()

  /** One library per scene so characters and set dressing share loaded containers. */
  static for(scene: Scene): ModelLibrary {
    let lib = libraries.get(scene)
    if (!lib) { lib = new ModelLibrary(scene); libraries.set(scene, lib) }
    return lib
  }

  private constructor(private scene: Scene) {}

  /** Static set dressing: scaled to `height`, grounded, StandardMaterial, no animation. */
  async instantiateProp(url: string, name: string, height: number, opts: PropOptions = {}): Promise<{ root: TransformNode; meshes: AbstractMesh[] }> {
    const prep = await this.prepare(url)
    const entries = prep.container.instantiateModelsToScene(n => `${name}:${n}`, true, { doNotInstantiate: true })
    const root = new TransformNode(`${name}-prop`, this.scene)
    const s = prep.unitScale * height
    root.scaling.setAll(s)
    root.position.y = -prep.minY * s
    for (const node of entries.rootNodes) node.parent = root
    for (const g of entries.animationGroups) g.dispose()
    const meshes = root.getChildMeshes(false)
    const converted = new Map<Material, StandardMaterial>()
    for (const m of meshes) {
      m.isPickable = false
      m.receiveShadows = true
      const src = m.material
      if (!src) continue
      let std = converted.get(src)
      if (!std) {
        std = toStandard(src, `${name}-${src.name}`, this.scene)
        if (opts.recolor) {
          const c = std.diffuseColor
          const luma = std.diffuseTexture ? 0.55 : c.r * 0.3 + c.g * 0.59 + c.b * 0.11
          std.diffuseTexture = null
          std.diffuseColor = opts.recolor.scale(0.35 + luma * 1.2)
        }
        else if (opts.tint) std.diffuseColor = std.diffuseColor.multiply(opts.tint)
        if (opts.emissive) std.emissiveColor = opts.emissive.clone()
        converted.set(src, std)
      }
      m.material = std
    }
    for (const [src, std] of converted) if (src !== std) src.dispose(false, false)
    return { root, meshes }
  }

  private prepare(url: string): Promise<Prepared> {
    let p = this.prepared.get(url)
    if (!p) {
      p = LoadAssetContainerAsync(assetUrl(url), this.scene).then((container) => {
        // Bind-pose bounds across all meshes
        let minY = Infinity, maxY = -Infinity
        for (const mesh of container.meshes) {
          if (!mesh.getTotalVertices()) continue
          mesh.computeWorldMatrix(true)
          const b = mesh.getBoundingInfo().boundingBox
          minY = Math.min(minY, b.minimumWorld.y)
          maxY = Math.max(maxY, b.maximumWorld.y)
        }
        const height = Number.isFinite(maxY - minY) && maxY > minY ? maxY - minY : 1
        return { container, unitScale: 1 / height, minY: Number.isFinite(minY) ? minY : 0 }
      })
      this.prepared.set(url, p)
    }
    return p
  }

  /** Warm the cache so the first entity of a kind doesn't pop in late. */
  preload(urls: string[]): void {
    for (const url of new Set(urls)) this.prepare(url).catch(() => {})
  }

  async instantiate(spec: ModelSpec, name: string, scale = 1): Promise<ModelInstance> {
    const prep = await this.prepare(spec.url)
    const entries = prep.container.instantiateModelsToScene(n => `${name}:${n}`, true, { doNotInstantiate: true })

    const root = new TransformNode(`${name}-model`, this.scene)
    const s = prep.unitScale * spec.height * scale
    const inner = new TransformNode(`${name}-model-inner`, this.scene)
    inner.parent = root
    inner.scaling.setAll(s)
    inner.position.y = -prep.minY * s + (spec.hover ?? 0)
    inner.rotation.y = spec.yaw ?? 0
    for (const node of entries.rootNodes) node.parent = inner

    const meshes = inner.getChildMeshes(false)
    const animations = new Map<string, AnimationGroup>()
    for (const group of entries.animationGroups) {
      group.stop()
      const clip = group.name.slice(group.name.indexOf(':') + 1)
      animations.set(clip, group)
    }

    // Weapon slots: keep only the listed meshes under each slot node
    if (spec.weaponSlots) {
      const keep = new Set(spec.weapons ?? [])
      for (const slotName of spec.weaponSlots) {
        const slot = findNode(inner, slotName)
        if (!slot) continue
        for (const child of slot.getChildMeshes(false)) {
          const base = child.name.slice(child.name.indexOf(':') + 1)
          if (!keep.has(base)) child.setEnabled(false)
        }
      }
    }

    // Attached props (weapons from separate files)
    if (spec.attach) {
      for (const a of spec.attach) {
        const slot = findNode(inner, a.slot)
        if (!slot) continue
        const wp = await this.prepare(a.url)
        const w = wp.container.instantiateModelsToScene(n => `${name}:${a.slot}:${n}`, true)
        const holder = new TransformNode(`${name}-attach`, this.scene)
        holder.parent = slot
        holder.position.set(...a.position)
        holder.rotation.set(...a.rotation)
        holder.scaling.setAll(a.scale)
        for (const node of w.rootNodes) node.parent = holder
        meshes.push(...holder.getChildMeshes(false))
      }
    }

    // glTF PBR → StandardMaterial: matches the scene's lighting model and is cheaper.
    // Materials are per-instance (cloneMaterials above) so tint / hit flash stay local.
    const converted = new Map<Material, StandardMaterial>()
    const tint = spec.tint ? Color3.FromHexString(spec.tint) : null
    for (const m of meshes) {
      m.isPickable = false
      const src = m.material
      if (!src) continue
      let std = converted.get(src)
      if (!std) {
        std = toStandard(src, `${name}-${src.name}`, this.scene)
        if (tint) {
          const c = std.diffuseColor
          const luma = c.r * 0.3 + c.g * 0.59 + c.b * 0.11
          if (spec.tintMode === 'replace') {
            if (std.diffuseTexture || luma > 0.15) std.diffuseColor = tint.scale(Math.min(1.2, 0.6 + (std.diffuseTexture ? 0.5 : luma)))
            std.diffuseTexture = null
          }
          else std.diffuseColor = c.multiply(tint)
        }
        converted.set(src, std)
      }
      m.material = std
    }
    for (const [src, std] of converted) if (src !== std) src.dispose(false, false)
    const materials = new Set<StandardMaterial>(converted.values())

    return {
      root,
      meshes,
      materials: [...materials],
      animations,
      dispose: () => {
        for (const g of entries.animationGroups) g.dispose()
        for (const sk of entries.skeletons) sk.dispose()
        for (const mat of materials) mat.dispose(false, false)
        root.dispose(false, false)
      },
    }
  }
}

function toStandard(src: Material, name: string, scene: Scene): StandardMaterial {
  const std = new StandardMaterial(name, scene)
  std.specularColor = new Color3(0.06, 0.06, 0.06)
  std.specularPower = 32
  if (src instanceof PBRMaterial) {
    std.diffuseTexture = src.albedoTexture
    std.diffuseColor = src.albedoColor.clone()
    if (src.emissiveTexture) std.emissiveTexture = src.emissiveTexture
    std.emissiveColor = src.emissiveColor.clone()
    std.alpha = src.alpha
    std.backFaceCulling = src.backFaceCulling
    if (src.albedoTexture?.hasAlpha && src.transparencyMode) std.useAlphaFromDiffuseTexture = true
  } else if (src instanceof StandardMaterial) {
    return src
  }
  return std
}

function findNode(root: Node, baseName: string): Node | null {
  for (const n of root.getDescendants(false)) {
    if (n.name.slice(n.name.indexOf(':') + 1) === baseName) return n
  }
  return null
}

