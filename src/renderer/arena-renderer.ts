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
  /** Pillar arenas: the column under the floor (shrinks with the floor when the rim breaks off) */
  private column: { mesh: Mesh; radius: number } | null = null

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
   * The guard rail shatters: edge becomes lethal, the surrounding courtyard + props drop into the
   * void, and the floor gets a floating-island underside (a pillar's column shrinks with it instead).
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
    if (this.column) {
      const k = radius / this.column.radius
      this.column.mesh.scaling.x = k
      this.column.mesh.scaling.z = k
    } else {
      this.addFloatingIsland(radius)
    }
    this.dropDressing()
  }

  private addFloatingIsland(radius: number): void {
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
  }

  /** Courtyard and props fall into the void */
  private dropDressing(): void {
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
    if (arenaDef.pillar) this.createColumn(radius)

    if (arenaDef.boundary === 'lethal') {
      // Floating island: thin platform slab + tapering rock underside
      // Top sits just below the floor: coplanar faces z-fight with the ground disc
      const slab = MeshBuilder.CreateCylinder('arena-platform', { height: 1.2, diameter: radius * 2, tessellation: 96 }, scene)
      slab.position.y = -0.62
      slab.material = this.cliffMaterial()
      if (decor && !arenaDef.pillar) {
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
      // Wall boundary: glowing rim + translucent shimmering barrier (rugged rocks on a pillar top)
      const boundary = MeshBuilder.CreateTorus('arena-boundary', { diameter: radius * 2, thickness: 0.12, tessellation: 128 }, scene)
      boundary.position.y = 0.05
      this.wallParts.push(boundary)
      boundary.material = decor ? this.accentMaterial('boundary-mat', 1, 0.9) : (() => {
        const m = new StandardMaterial('boundary-mat', scene)
        m.diffuseColor = new Color3(0.9, 0.9, 0.9)
        m.emissiveColor = new Color3(0.3, 0.3, 0.3)
        return m
      })()
      if (decor && arenaDef.pillar) {
        this.sm.addGlow(boundary)
        this.createRimRocks(radius)
      } else if (decor) {
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

  /**
   * Titan's Navel seen from the side: a wide flat top that funnels into a long, narrow, ragged
   * stone stem dropping into the abyss. Vertex colours fade it to the background colour with depth
   * (the scene has no fog to hide its foot).
   */
  private createColumn(radius: number): void {
    // Profile in units of the top radius: (radius, depth below the floor)
    const PROFILE: [number, number][] = [
      [1.0, 0.02], [0.97, 0.08], [0.86, 0.18], [0.7, 0.32], [0.55, 0.5], [0.45, 0.75], [0.4, 1.1],
      [0.36, 1.6], [0.39, 2.1], [0.33, 2.7], [0.36, 3.3], [0.31, 4.2],
    ]
    const depth = PROFILE[PROFILE.length - 1][1] * radius
    const column = MeshBuilder.CreateLathe('arena-column', {
      shape: PROFILE.map(([r, d]) => new Vector3(r * radius, -d * radius, 0)),
      tessellation: 26,
      sideOrientation: Mesh.DOUBLESIDE,
    }, this.scene)
    const positions = column.getVerticesData('position')!
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2]
      // The rim stays round (it meets the floor); below it the rock gets ragged
      if (y > -0.3 * radius) continue
      const a = Math.atan2(z, x)
      const v = y / radius
      const n = Math.sin(a * 3 + v * 1.7) + 0.6 * Math.sin(a * 7 - v * 2.9) + 0.5 * Math.sin(v * 4.3 + a)
      const k = 1 + 0.07 * n
      positions[i] = x * k
      positions[i + 2] = z * k
    }
    column.setVerticesData('position', positions)
    column.convertToFlatShadedMesh()
    const flat = column.getVerticesData('position')!
    const colors: number[] = []
    for (let i = 0; i < flat.length; i += 3) {
      const k = Math.max(0, 1 + flat[i + 1] / (depth * 0.8)) // 1 at the top, 0 at 80% of the way down
      colors.push(k, k, k, 1)
    }
    column.setVerticesData('color', colors)
    // Floor stone, darker: the theme's cliff colour is too dark to read the column against the void
    const mat = new StandardMaterial('arena-column-mat', this.scene)
    mat.diffuseColor = Color3.FromHexString(this.theme.tileAlt).scale(0.8)
    // The sides get little of the overhead light: a touch of self-light keeps the silhouette readable
    mat.emissiveColor = Color3.FromHexString(this.theme.tileAlt).scale(0.3)
    mat.specularColor = Color3.Black()
    column.material = mat
    column.receiveShadows = true
    column.isPickable = false
    this.column = { mesh: column, radius }
  }

  /**
   * The guard rail of a pillar top: a ring of rugged rocks along the rim (it falls when the rim
   * breaks). Looks only: the wall is still the arena's circle.
   */
  private createRimRocks(radius: number): void {
    let seed = 4242
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const count = Math.round((Math.PI * 2 * radius) / 1.1)
    const rocks: Mesh[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.04
      // Dodecahedra / icosahedra: blunt boulders (sharper polyhedra read as crystals)
      const rock = MeshBuilder.CreatePolyhedron('rim-rock', { type: 2 + Math.floor(rand() * 2), size: 0.5 }, this.scene)
      const h = 0.6 + rand() * 0.9
      rock.scaling.set(1.1 + rand() * 0.9, h, 0.9 + rand() * 0.7)
      const r = radius + 0.35 + (rand() - 0.5) * 0.3
      rock.position.set(Math.cos(a) * r, h * 0.3, Math.sin(a) * r)
      rock.rotation.set((rand() - 0.5) * 0.5, -a + (rand() - 0.5) * 0.8, (rand() - 0.5) * 0.5)
      rocks.push(rock)
    }
    const rim = Mesh.MergeMeshes(rocks, true)!
    rim.name = 'arena-rim-rocks'
    rim.convertToFlatShadedMesh()
    const mat = new StandardMaterial('arena-rim-rocks-mat', this.scene)
    mat.diffuseColor = Color3.FromHexString(this.theme.tileAlt).scale(0.75)
    mat.specularColor = Color3.Black()
    rim.material = mat
    rim.receiveShadows = true
    rim.isPickable = false
    this.sm.addShadowCaster(rim)
    this.dressing.push(rim)
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
    // Props float below the rim of a lethal edge or a pillar top; a walled floor sits in a courtyard
    const lethal = arenaDef.boundary === 'lethal' || arenaDef.pillar === true

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
      // Around a pillar the rocks drift far below the top, so the platform reads as high up
      const r = extent + (arenaDef.pillar ? 8 + rand() * 14 : lethal ? 6 + rand() * 6 : 3.5 + rand() * 5)
      const y = arenaDef.pillar ? -10 - rand() * 22 : lethal ? -1.5 - rand() * 3 : 0
      const prop = buildProp(scene, kind, this.theme, rand, { floating: lethal })
      prop.root.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
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
