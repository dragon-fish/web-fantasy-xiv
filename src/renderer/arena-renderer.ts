// src/renderer/arena-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Color4, Vector3, ParticleSystem, Mesh, DynamicTexture, TransformNode,
  type Scene,
} from '@babylonjs/core'
import type { ArenaDef, AoeShapeDef } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { SceneManager } from './scene-manager'
import { resolveArenaTheme, type ArenaTheme } from './arena-theme'
import { createFloorTextures } from './arena-floor'
import { buildProp } from './arena-props'
import { fxTexture } from './fx-textures'

const DEATH_ZONE_COLOR = new Color3(0.1, 0.02, 0.13)  // abyss purple
const DEATH_ZONE_EMISSIVE = new Color3(0.16, 0.03, 0.2)

export interface ArenaRendererOptions {
  /** Floor texture, outer courtyard, props and ambient motes. Off for modes that dress the scene themselves. */
  decor: boolean
}

export class ArenaRenderer {
  private deathZoneMeshes = new Map<string, Mesh>()
  private dzMat: StandardMaterial
  private wallMat: StandardMaterial
  private scene: Scene
  readonly theme: ArenaTheme
  /** Guard rail meshes removed when the floor breaks */
  private wallParts: Mesh[] = []
  /** Courtyard + props: they fall into the void when the floor breaks */
  private dressing: TransformNode[] = []
  private def: ArenaDef

  constructor(private sm: SceneManager, arenaDef: ArenaDef, private bus?: EventBus, options: ArenaRendererOptions = { decor: true }) {
    const scene = this.scene = sm.scene
    this.def = arenaDef
    this.theme = resolveArenaTheme(arenaDef.theme)
    if (options.decor) sm.setAtmosphere(this.theme.atmosphere)

    if (arenaDef.shape.type === 'circle') {
      this.createCircleArena(arenaDef, options.decor)
    } else {
      this.createRectArena(arenaDef, options.decor)
    }
    if (options.decor) this.createSurroundings(arenaDef)

    this.dzMat = new StandardMaterial('deathzone-mat', scene)
    this.dzMat.diffuseColor = DEATH_ZONE_COLOR
    this.dzMat.emissiveColor = DEATH_ZONE_EMISSIVE
    this.dzMat.specularColor = Color3.Black()
    this.dzMat.alpha = 0.8

    this.wallMat = new StandardMaterial('wallzone-mat', scene)
    this.wallMat.diffuseColor = new Color3(0.2, 0.25, 0.35)
    this.wallMat.emissiveColor = new Color3(0.1, 0.12, 0.18)
    this.wallMat.specularColor = Color3.Black()
    this.wallMat.alpha = 0.85

    // Listen for dynamic death zone events
    if (bus) {
      bus.on('deathzone:added', (payload: { zone: { id: string; center: { x: number; y: number }; facing: number; shape: AoeShapeDef; behavior?: string; color?: string } }) => {
        this.addDeathZoneMesh(payload.zone.id, payload.zone.center, payload.zone.shape, payload.zone.facing, payload.zone.behavior, payload.zone.color)
      })
      bus.on('deathzone:removed', (payload: { id: string }) => {
        this.removeDeathZoneMesh(payload.id)
      })
      bus.on('arena:morphed', () => this.breakFloor())
    }
  }

  private addDeathZoneMesh(id: string, center: { x: number; y: number }, shape: AoeShapeDef, facing: number, behavior?: string, color?: string): void {
    // Remove existing mesh with same id
    this.removeDeathZoneMesh(id)

    const isWall = behavior === 'wall'
    let mesh: Mesh
    const facingRad = (facing * Math.PI) / 180

    if (isWall && shape.type === 'rect') {
      // Wall zones: 3D box with height
      const wallHeight = 1.5
      mesh = MeshBuilder.CreateBox(`deathzone-${id}`, {
        width: shape.width,
        height: wallHeight,
        depth: shape.length,
      }, this.scene)
      mesh.rotation.y = (facing * Math.PI) / 180
      // Position at rect's visual center (offset from start along facing by half-length)
      const offsetX = Math.sin(facingRad) * (shape.length / 2)
      const offsetZ = Math.cos(facingRad) * (shape.length / 2)
      mesh.position.set(center.x + offsetX, wallHeight / 2, center.y + offsetZ)
      mesh.material = this.wallMat
      this.sm.addShadowCaster(mesh)
      this.deathZoneMeshes.set(id, mesh)
      return
    }

    switch (shape.type) {
      case 'circle':
        mesh = MeshBuilder.CreateDisc(`deathzone-${id}`, { radius: shape.radius, tessellation: 48 }, this.scene)
        break
      case 'fan':
        mesh = MeshBuilder.CreateDisc(`deathzone-${id}`, { radius: shape.radius, arc: shape.angle / 360, tessellation: 48 }, this.scene)
        break
      case 'ring':
        mesh = MeshBuilder.CreateDisc(`deathzone-${id}`, { radius: shape.outerRadius, tessellation: 48 }, this.scene)
        // TODO: proper ring with inner hole — for now use outer disc
        break
      case 'rect':
        mesh = MeshBuilder.CreateGround(`deathzone-${id}`, { width: shape.width, height: shape.length }, this.scene)
        break
      default:
        return
    }

    // Lay flat — disc/fan needs rotation.x, ground (rect) is already flat
    if (shape.type !== 'rect') mesh.rotation.x = Math.PI / 2

    // Facing rotation — same formula as AoeRenderer
    if (shape.type === 'fan') {
      mesh.rotation.y = ((facing - 90 + shape.angle / 2) * Math.PI) / 180
    } else if (shape.type === 'rect') {
      mesh.rotation.y = (facing * Math.PI) / 180
    }

    // Position — rects offset along facing (start at center, extend forward)
    if (shape.type === 'rect') {
      const offsetX = Math.sin(facingRad) * (shape.length / 2)
      const offsetZ = Math.cos(facingRad) * (shape.length / 2)
      mesh.position.set(center.x + offsetX, 0.02, center.y + offsetZ)
    } else {
      mesh.position.set(center.x, 0.02, center.y)
    }
    mesh.material = isWall ? this.wallMat : this.dzMat
    // Damage zones (lava and the like): a glowing floor in their own colour with a bright rim
    if (behavior === 'damage') {
      // Default deep red: orange is what AOE telegraphs look like
      const tint = Color3.FromHexString(color ?? '#b81236')
      mesh.material = this.hazardMaterial(tint)
      mesh.position.y = 0.03
      if (shape.type === 'circle') {
        const rim = MeshBuilder.CreateTorus(`deathzone-rim-${id}`, { diameter: shape.radius * 2, thickness: 0.22, tessellation: 96 }, this.scene)
        rim.parent = mesh
        rim.rotation.x = -Math.PI / 2
        rim.scaling.y = 0.3
        rim.material = this.hazardMaterial(tint.add(new Color3(0.25, 0.25, 0.2)), 1)
        this.sm.addGlow(rim)
      }
      this.deathZoneMeshes.set(id, mesh)
      return
    }
    // Lethal pits read as an abyss: near-black floor with a glowing danger rim
    if (!isWall && shape.type === 'circle') {
      mesh.material = this.abyssMaterial()
      const rim = MeshBuilder.CreateTorus(`deathzone-rim-${id}`, { diameter: shape.radius * 2, thickness: 0.18, tessellation: 96 }, this.scene)
      rim.parent = mesh
      rim.rotation.x = -Math.PI / 2
      rim.scaling.y = 0.3
      rim.material = this.dangerRimMaterial()
      this.sm.addGlow(rim)
    }
    this.deathZoneMeshes.set(id, mesh)
  }

  private hazardMats = new Map<string, StandardMaterial>()
  private hazardMaterial(tint: Color3, alpha = 0.78): StandardMaterial {
    const key = `${tint.toHexString()}:${alpha}`
    let m = this.hazardMats.get(key)
    if (!m) {
      m = new StandardMaterial(`hazard-${key}`, this.scene)
      m.diffuseColor = tint.scale(0.5)
      m.emissiveColor = tint.scale(0.85)
      m.specularColor = Color3.Black()
      m.alpha = alpha
      this.hazardMats.set(key, m)
    }
    return m
  }

  private abyss: StandardMaterial | null = null
  private abyssMaterial(): StandardMaterial {
    if (!this.abyss) {
      this.abyss = new StandardMaterial('abyss-mat', this.scene)
      this.abyss.diffuseColor = Color3.Black()
      this.abyss.specularColor = Color3.Black()
      this.abyss.emissiveColor = new Color3(0.05, 0.01, 0.06)
    }
    return this.abyss
  }

  private dangerRim: StandardMaterial | null = null
  private dangerRimMaterial(): StandardMaterial {
    if (!this.dangerRim) {
      this.dangerRim = new StandardMaterial('danger-rim-mat', this.scene)
      this.dangerRim.disableLighting = true
      this.dangerRim.emissiveColor = new Color3(0.85, 0.25, 0.95)
    }
    return this.dangerRim
  }

  /**
   * The guard rail shatters: edge becomes lethal, a floating-island underside appears and the
   * surrounding courtyard + props drop into the void.
   */
  private breakFloor(): void {
    if (this.def.shape.type !== 'circle') return
    const radius = this.def.shape.radius
    // The platform shrank: the floor goes with it (the rim beyond it has broken off)
    if (this.circleGround && radius < this.circleGround.radius) {
      const k = radius / this.circleGround.radius
      this.circleGround.mesh.scaling.x = k
      this.circleGround.mesh.scaling.y = k
    }
    for (const m of this.wallParts) m.dispose()
    this.wallParts = []

    const edge = MeshBuilder.CreateTorus('arena-edge-glow', { diameter: radius * 2, thickness: 0.16, tessellation: 128 }, this.scene)
    edge.position.y = 0.03
    edge.scaling.y = 0.3
    edge.material = this.dangerRimMaterial()
    this.sm.addGlow(edge)
    const slab = MeshBuilder.CreateCylinder('arena-platform', { height: 1.2, diameter: radius * 2, tessellation: 96 }, this.scene)
    slab.position.y = -0.62
    const cliff = new StandardMaterial('platform-break-mat', this.scene)
    cliff.diffuseColor = Color3.FromHexString(this.theme.cliff)
    cliff.specularColor = Color3.Black()
    slab.material = cliff
    const under = MeshBuilder.CreateCylinder('arena-underside', { height: radius * 0.9, diameterTop: radius * 1.96, diameterBottom: radius * 0.35, tessellation: 14, subdivisions: 3 }, this.scene)
    under.position.y = -1.2 - radius * 0.45
    under.material = cliff
    under.convertToFlatShadedMesh()

    const falling = this.dressing.map((node, i) => ({ node, v: 0, delay: (i % 7) * 90, spin: (Math.random() - 0.5) * 0.8 }))
    this.dressing = []
    let t = 0
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.scene.getEngine().getDeltaTime() / 1000
      t += dt * 1000
      let alive = false
      for (const f of falling) {
        if (t < f.delay || f.node.isDisposed()) { alive = alive || !f.node.isDisposed(); continue }
        f.v += 22 * dt
        f.node.position.y -= f.v * dt
        f.node.rotation.z += f.spin * dt
        if (f.node.position.y < -40) f.node.dispose()
        else alive = true
      }
      if (!alive) this.scene.onBeforeRenderObservable.remove(obs)
    })
  }

  private circleGround: { mesh: Mesh; radius: number } | null = null

  private removeDeathZoneMesh(id: string): void {
    const mesh = this.deathZoneMeshes.get(id)
    if (mesh) {
      mesh.dispose()
      this.deathZoneMeshes.delete(id)
    }
  }

  private floorMaterial(width: number, height: number, kind: 'circle' | 'rect', decor: boolean): StandardMaterial {
    const mat = new StandardMaterial('arena-mat', this.scene)
    mat.specularColor = new Color3(0.08, 0.08, 0.08)
    mat.specularPower = 24
    if (!decor) {
      mat.diffuseColor = new Color3(0.35, 0.35, 0.38)
      mat.specularColor = Color3.Black()
      return mat
    }
    const tex = createFloorTextures(this.scene, this.theme, { kind, width, height })
    mat.diffuseTexture = tex.diffuse
    mat.emissiveTexture = tex.emissive
    mat.bumpTexture = tex.normal
    mat.bumpTexture.level = 0.9
    return mat
  }

  private accentMaterial(name: string, alpha = 1, emissiveScale = 1): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene)
    const accent = Color3.FromHexString(this.theme.accent)
    mat.diffuseColor = accent.scale(0.4)
    mat.emissiveColor = accent.scale(emissiveScale)
    mat.specularColor = Color3.Black()
    mat.alpha = alpha
    mat.disableLighting = true
    return mat
  }

  private cliffMaterial(): StandardMaterial {
    const mat = new StandardMaterial('platform-mat', this.scene)
    mat.diffuseColor = Color3.FromHexString(this.theme.cliff)
    mat.specularColor = Color3.Black()
    return mat
  }

  private createCircleArena(arenaDef: ArenaDef, decor: boolean): void {
    const radius = (arenaDef.shape as { type: 'circle'; radius: number }).radius
    const scene = this.scene

    const ground = MeshBuilder.CreateDisc('arena-ground', { radius, tessellation: 96 }, scene)
    ground.rotation.x = Math.PI / 2 // flat on ground
    this.circleGround = { mesh: ground, radius }
    ground.material = this.floorMaterial(radius * 2, radius * 2, 'circle', decor)
    ground.receiveShadows = true
    if (decor) this.sm.addGlow(ground)

    if (arenaDef.boundary === 'lethal') {
      // Floating island: thin platform slab + tapering rock underside
      // Top sits just below the floor: coplanar faces z-fight with the ground disc
      const slab = MeshBuilder.CreateCylinder('arena-platform', { height: 1.2, diameter: radius * 2, tessellation: 96 }, scene)
      slab.position.y = -0.62
      slab.material = this.cliffMaterial()
      if (decor) {
        const under = MeshBuilder.CreateCylinder('arena-underside', {
          height: radius * 0.9, diameterTop: radius * 2 * 0.98, diameterBottom: radius * 0.35, tessellation: 14, subdivisions: 3,
        }, scene)
        under.position.y = -1.2 - radius * 0.45
        under.material = slab.material
        under.convertToFlatShadedMesh()
      }
      // Danger rim at the edge
      const edgeRing = MeshBuilder.CreateTorus('arena-edge-glow', { diameter: radius * 2, thickness: 0.16, tessellation: 128 }, scene)
      edgeRing.position.y = 0.03
      edgeRing.scaling.y = 0.3
      const edgeMat = new StandardMaterial('edge-glow-mat', scene)
      edgeMat.emissiveColor = new Color3(0.85, 0.25, 0.95)
      edgeMat.diffuseColor = Color3.Black()
      edgeMat.disableLighting = true
      edgeRing.material = edgeMat
      this.sm.addGlow(edgeRing)
    } else {
      // Wall boundary: glowing rim + translucent shimmering barrier
      const boundary = MeshBuilder.CreateTorus('arena-boundary', { diameter: radius * 2, thickness: 0.12, tessellation: 128 }, scene)
      boundary.position.y = 0.05
      this.wallParts.push(boundary)
      boundary.material = decor ? this.accentMaterial('boundary-mat', 1, 0.9) : (() => {
        const m = new StandardMaterial('boundary-mat', scene)
        m.diffuseColor = new Color3(0.9, 0.9, 0.9)
        m.emissiveColor = new Color3(0.3, 0.3, 0.3)
        return m
      })()
      if (decor) {
        this.sm.addGlow(boundary)
        const barrier = MeshBuilder.CreateCylinder('arena-barrier', {
          diameter: radius * 2, height: 1.6, tessellation: 128, cap: Mesh.NO_CAP, sideOrientation: Mesh.DOUBLESIDE,
        }, scene)
        barrier.position.y = 0.8
        this.wallParts.push(barrier)
        const mat = this.accentMaterial('arena-barrier-mat', 1, 0.8)
        mat.opacityTexture = this.barrierGradient()
        mat.backFaceCulling = false
        barrier.material = mat
        barrier.isPickable = false
      }
    }
  }

  /** Vertical alpha gradient (opaque at the floor, transparent at the top) for barrier walls. */
  private barrierGradient() {
    const dt = new DynamicTexture('arena-barrier-alpha', { width: 4, height: 128 }, this.scene, false)
    const ctx = dt.getContext() as CanvasRenderingContext2D
    const g = ctx.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.7, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(255,255,255,0.35)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 128)
    dt.hasAlpha = true
    dt.getAlphaFromRGB = false
    dt.update(true)
    return dt
  }

  private createRectArena(arenaDef: ArenaDef, decor: boolean): void {
    const shape = arenaDef.shape as { type: 'rect'; width: number; height: number }
    const { width, height } = shape
    const scene = this.scene

    const ground = MeshBuilder.CreateGround('arena-ground', { width, height }, scene)
    ground.material = this.floorMaterial(width, height, 'rect', decor)
    ground.receiveShadows = true
    if (decor) this.sm.addGlow(ground)

    const isLethal = arenaDef.boundary === 'lethal'

    if (isLethal) {
      const platformDepth = decor ? 1.2 : 3
      const platform = MeshBuilder.CreateBox('arena-platform', { width, height: platformDepth, depth: height }, scene)
      platform.position.y = -platformDepth / 2 - 0.02
      platform.material = this.cliffMaterial()
    }

    // Boundary lines
    const thickness = isLethal ? 0.15 : 0.1
    const lineHeight = isLethal ? 0.3 : 0.2
    const sides = [
      { name: 'top', w: width, h: thickness, x: 0, z: height / 2 },
      { name: 'bottom', w: width, h: thickness, x: 0, z: -height / 2 },
      { name: 'left', w: thickness, h: height, x: -width / 2, z: 0 },
      { name: 'right', w: thickness, h: height, x: width / 2, z: 0 },
    ]

    let boundaryMat: StandardMaterial
    if (isLethal) {
      boundaryMat = new StandardMaterial('boundary-mat', scene)
      boundaryMat.diffuseColor = new Color3(0.5, 0.1, 0.55)
      boundaryMat.emissiveColor = new Color3(0.5, 0.12, 0.6)
      boundaryMat.disableLighting = true
    } else if (decor) {
      boundaryMat = this.accentMaterial('boundary-mat', 1, 0.9)
    } else {
      boundaryMat = new StandardMaterial('boundary-mat', scene)
      boundaryMat.diffuseColor = new Color3(0.9, 0.9, 0.9)
      boundaryMat.emissiveColor = new Color3(0.3, 0.3, 0.3)
    }

    for (const side of sides) {
      const box = MeshBuilder.CreateBox(`boundary-${side.name}`, { width: side.w, height: lineHeight, depth: side.h }, scene)
      box.position.set(side.x, lineHeight / 2, side.z)
      box.material = boundaryMat
      if (decor) this.sm.addGlow(box)
    }
  }

  /** Outer courtyard ring, props placed around the arena and drifting motes. */
  private createSurroundings(arenaDef: ArenaDef): void {
    const scene = this.scene
    const extent = arenaDef.shape.type === 'circle'
      ? arenaDef.shape.radius
      : Math.max(arenaDef.shape.width, arenaDef.shape.height) / 2 * Math.SQRT2
    const lethal = arenaDef.boundary === 'lethal'

    if (!lethal) {
      // Darker courtyard stone around the arena so it doesn't float in a void
      const yard = MeshBuilder.CreateDisc('arena-courtyard', { radius: extent + 26, tessellation: 96 }, scene)
      yard.rotation.x = Math.PI / 2
      yard.position.y = -0.04
      const mat = new StandardMaterial('arena-courtyard-mat', scene)
      mat.diffuseColor = Color3.FromHexString(this.theme.grout).scale(1.15)
      mat.specularColor = Color3.Black()
      yard.material = mat
      yard.receiveShadows = true
      yard.isPickable = false
      this.dressing.push(yard)
    }

    // Props in a loose ring outside the walkable area
    let seed = 1337
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const count = Math.round(10 + extent * 0.6)
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.25
      const kind = this.theme.props[i % this.theme.props.length]
      const r = extent + (lethal ? 6 + rand() * 6 : 3.5 + rand() * 5)
      const prop = buildProp(scene, kind, this.theme, rand, { floating: lethal })
      prop.root.position.set(Math.cos(a) * r, lethal ? -1.5 - rand() * 3 : 0, Math.sin(a) * r)
      prop.root.rotation.y = rand() * Math.PI * 2
      this.dressing.push(prop.root)
      prop.loaded.then(({ casters, glows }) => {
        if (scene.isDisposed) return
        for (const m of casters) this.sm.addShadowCaster(m)
        for (const m of glows) this.sm.addGlow(m)
      })
    }

    // Drifting motes
    const motes = new ParticleSystem('arena-motes', 400, scene)
    motes.particleTexture = fxTexture(scene, 'dot')
    motes.emitter = new Vector3(0, lethal ? -4 : 0.2, 0)
    const spread = extent + 14
    motes.minEmitBox = new Vector3(-spread, 0, -spread)
    motes.maxEmitBox = new Vector3(spread, lethal ? 2 : 0.5, spread)
    const mc = Color3.FromHexString(this.theme.motes)
    motes.color1 = new Color4(mc.r, mc.g, mc.b, 0.9)
    motes.color2 = new Color4(mc.r * 0.8, mc.g * 0.8, mc.b, 0.6)
    motes.colorDead = new Color4(mc.r, mc.g, mc.b, 0)
    motes.minSize = 0.06
    motes.maxSize = 0.18
    motes.minLifeTime = 4
    motes.maxLifeTime = 8
    motes.emitRate = 40
    motes.direction1 = new Vector3(-0.15, 0.6, -0.15)
    motes.direction2 = new Vector3(0.15, 1, 0.15)
    motes.minEmitPower = 0.3
    motes.maxEmitPower = 0.6
    motes.blendMode = ParticleSystem.BLENDMODE_ADD
    motes.preWarmCycles = 200
    motes.start()
  }
}
