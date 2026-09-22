import { Color3, MeshBuilder, StandardMaterial, Vector3, type Scene, type Mesh, type InstancedMesh } from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityVisuals } from '@/renderer/entity-renderer'
import type { SurvivorRuntime } from './runtime'
import { BOSS_ARENA_RADIUS } from './boss'
import { buildModel, type ModelKind } from './models'
import type { Effect } from './types'

interface Flash { mesh: Mesh; age: number; duration: number; radius: number; kind: Effect['kind'] }
export class SurvivorVisuals implements EntityVisuals {
  private models = new Map<ModelKind, Mesh>()
  private entities = new Map<string, InstancedMesh | Mesh>()
  private flashes: Flash[] = []
  private pool = new Map<string, Mesh[]>()
  private materials = new Map<string, StandardMaterial>()
  private banks = new Map<string, { source: Mesh; instances: InstancedMesh[]; used: number }>()
  private hitUntil = new Map<string, number>()
  private boundary: Mesh | null = null
  private barrier: Mesh | null = null
  private time = 0
  private run: SurvivorRuntime | null = null
  constructor(private scene: Scene, bus: EventBus) {
    for (const kind of ['player', 'imp', 'bat', 'golem', 'elite', 'sentinel'] as const) this.models.set(kind, buildModel(scene, kind))
    bus.on('entity:created', ({ entity }: { entity: Entity }) => {
      const kind = entity.type === 'player' ? 'player' : entity.group as ModelKind
      const template = this.models.get(kind) ?? this.models.get('imp')!
      const mesh = entity.type === 'player' ? template.clone(entity.id) : template.createInstance(entity.id)
      mesh.isVisible = true
      mesh.isPickable = false
      this.entities.set(entity.id, mesh)
    })
    bus.on('entity:died', ({ entity }: { entity: Entity }) => {
      this.entities.get(entity.id)?.dispose()
      this.entities.delete(entity.id)
      this.hitUntil.delete(entity.id)
    })
    bus.on('survivor:effect', (effect: Effect) => this.effect(effect))
    bus.on('damage:dealt', ({ target }: { target: Entity }) => this.flashHit(target.id))
    this.decorate()
  }
  bind(run: SurvivorRuntime) { this.run = run }
  private mat(color: string, glow = 0.65) {
    const key = `${color}-${glow}`
    if (!this.materials.has(key)) {
      const mat = new StandardMaterial(`survivor-${key}`, this.scene)
      mat.diffuseColor = Color3.FromHexString(color)
      mat.emissiveColor = mat.diffuseColor.scale(glow)
      mat.specularColor = Color3.Black()
      this.materials.set(key, mat)
    }
    return this.materials.get(key)!
  }
  private decorate() {
    this.boundary = MeshBuilder.CreateTorus('boss-boundary', { diameter: BOSS_ARENA_RADIUS * 2, thickness: 0.13, tessellation: 96 }, this.scene)
    this.boundary.material = this.mat('#f2b065')
    this.boundary.position.y = 0.12
    this.boundary.isPickable = false
    this.boundary.setEnabled(false)
    this.barrier = MeshBuilder.CreateCylinder('boss-barrier', { diameter: BOSS_ARENA_RADIUS * 2, height: 1.5, cap: 0, sideOrientation: 2, tessellation: 96 }, this.scene)
    const barrierMat = this.mat('#ca8053', 0.25)
    barrierMat.alpha = 0.16
    this.barrier.material = barrierMat
    this.barrier.position.y = 0.75
    this.barrier.isPickable = false
    this.barrier.setEnabled(false)
    this.scene.clearColor.set(0.027, 0.045, 0.065, 1)
    const ground = this.scene.getMeshByName('arena-ground')
    if (ground) ground.material = this.mat('#172c35', 0.12)
    const lines: Vector3[][] = []
    for (let i = -60; i <= 60; i += 6) {
      lines.push([new Vector3(i, 0.025, -60), new Vector3(i, 0.025, 60)])
      lines.push([new Vector3(-60, 0.025, i), new Vector3(60, 0.025, i)])
    }
    const grid = MeshBuilder.CreateLineSystem('survivor-stone-grid', { lines }, this.scene)
    grid.color = Color3.FromHexString('#28434c')
    grid.isPickable = false
    for (const radius of [8, 16, 30, 46]) {
      const ring = MeshBuilder.CreateTorus('aether-ring', { diameter: radius * 2, thickness: 0.045, tessellation: 96 }, this.scene)
      ring.position.y = 0.04
      ring.material = this.mat('#41666a', 0.2)
      ring.isPickable = false
    }
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6
      const stone = MeshBuilder.CreateCylinder('aether-obelisk', { height: 3, diameterTop: 0, diameterBottom: 0.9, tessellation: 4 }, this.scene)
      stone.position.set(Math.cos(angle) * 42, 1.5, Math.sin(angle) * 42)
      stone.material = this.mat('#67848b', 0.12)
      stone.isPickable = false
    }
  }
  flashHit(id: string) { this.hitUntil.set(id, this.time + 100) }
  updateAll(entities: Entity[], dt: number) {
    if (!this.run?.progression.pending && !this.run?.result && !this.scene.metadata?.paused) this.time += dt
    for (const e of entities) {
      const mesh = this.entities.get(e.id)
      if (!mesh) continue
      const phase = Number(e.id.split('_').pop()) || 0
      const bob = Math.sin(this.time / (e.group === 'bat' ? 70 : 130) + phase)
      mesh.position.set(e.position.x, e.group === 'bat' ? bob * 0.2 + 0.25 : Math.abs(bob) * 0.05, e.position.y)
      mesh.rotation.y = e.facing * Math.PI / 180
      mesh.rotation.z = e.group === 'bat' ? bob * 0.2 : 0
      const scale = e.group === 'sentinel' ? 2.1 : e.group === 'elite' ? 1.4 : 1
      mesh.scaling.set(scale, scale * (this.hitUntil.has(e.id) ? 0.87 : 1), scale)
      if (e.type === 'player') mesh.visibility = e.buffs.some(b => b.defId === 'sv_dash_guard') ? 0.45 : 1
      if ((this.hitUntil.get(e.id) ?? Infinity) < this.time) this.hitUntil.delete(e.id)
    }
  }
  private instance(key: string, shape: 'ball' | 'blade' | 'field' | 'gem', color: string): InstancedMesh {
    let bank = this.banks.get(key)
    if (!bank) {
      const source = shape === 'field'
        ? MeshBuilder.CreateTorus(key, { diameter: 2, thickness: 0.07, tessellation: 48 }, this.scene)
        : shape === 'blade'
          ? MeshBuilder.CreateBox(key, { width: 0.14, height: 0.12, depth: 1.15 }, this.scene)
          : shape === 'gem'
            ? MeshBuilder.CreatePolyhedron(key, { type: 1, size: 0.2 }, this.scene)
            : MeshBuilder.CreateSphere(key, { diameter: 0.42, segments: 4 }, this.scene)
      source.material = this.mat(color)
      source.visibility = key.startsWith('trail-') ? 0.4 : shape === 'field' ? 0.65 : 1
      source.isVisible = false
      source.isPickable = false
      bank = { source, instances: [], used: 0 }
      this.banks.set(key, bank)
    }
    let mesh = bank.instances[bank.used]
    if (!mesh) {
      mesh = bank.source.createInstance(`${key}-${bank.used}`)
      mesh.isPickable = false
      bank.instances.push(mesh)
    }
    bank.used++
    mesh.setEnabled(true)
    mesh.isVisible = true
    mesh.scaling.setAll(1)
    return mesh
  }
  render(dt: number, paused: boolean) {
    this.scene.metadata = { paused }
    const run = this.run
    if (!run) return
    this.boundary?.setEnabled(!!run.bossFight && !run.result)
    this.barrier?.setEnabled(!!run.bossFight && !run.result)
    for (const bank of this.banks.values()) bank.used = 0
    for (const p of run.weapons.projectiles) {
      const color = p.weapon === 'fire' ? '#ff944f' : p.weapon === 'holy' ? '#ffe9b0' : '#7affdf'
      const m = this.instance(`shot-${p.weapon}`, p.weapon === 'orbit' ? 'blade' : 'ball', color)
      m.position.set(p.x, 0.85, p.y)
      m.rotation.y = Math.atan2(p.vx, p.vy)
      m.scaling.z = 1.7
      const tail = this.instance(`trail-${p.weapon}`, 'blade', color)
      const speed = Math.hypot(p.vx, p.vy)
      tail.position.set(p.x - p.vx / speed * 0.5, 0.8, p.y - p.vy / speed * 0.5)
      tail.rotation.y = m.rotation.y
    }
    for (const orb of run.weapons.orbs) {
      const m = this.instance('orbit', 'blade', '#88ffed')
      m.position.set(orb.x, 0.85, orb.y)
      m.rotation.y = Math.atan2(orb.x - run.player.position.x, orb.y - run.player.position.y)
      m.scaling.set(2, 1, 1.6)
    }
    for (const f of run.weapons.fields) {
      const m = this.instance('ice-field', 'field', '#7bbfeb')
      m.position.set(f.x, 0.09, f.y)
      m.scaling.set(f.radius, 1, f.radius)
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + this.time / 9000
        const crystal = this.instance('ice-crystal', 'gem', '#a8e5ff')
        crystal.position.set(f.x + Math.cos(a) * f.radius * 0.65, 0.3, f.y + Math.sin(a) * f.radius * 0.65)
        crystal.scaling.set(1, 2.8, 1)
      }
    }
    for (const g of run.gems) {
      const m = this.instance('experience', 'gem', '#7dffc9')
      m.position.set(g.x, 0.3, g.y)
      m.rotation.y = this.time / 700
      const life = Math.max(0, g.expiresAt - run.elapsed)
      const fade = Math.min(1, life / 4000)
      m.scaling.setAll((g.value > 3 ? 1.5 : 1) * fade)
    }
    for (const bank of this.banks.values()) for (let i = bank.used; i < bank.instances.length; i++) bank.instances[i]!.setEnabled(false)
    const experience = this.banks.get('experience')
    if (experience) while (experience.instances.length > experience.used + 24) experience.instances.pop()!.dispose()
    if (paused) return
    for (const f of this.flashes) {
      f.age += dt
      const t = f.age / f.duration
      f.mesh.visibility = Math.max(0, 1 - t)
      if (f.kind === 'burst' || f.kind === 'slash') f.mesh.scaling.set(f.radius * (0.5 + t * 0.5), 1, f.radius * (0.5 + t * 0.5))
      if (t >= 1) {
        f.mesh.setEnabled(false)
        const key = f.mesh.metadata as string
        const pool = this.pool.get(key) ?? []
        pool.push(f.mesh)
        this.pool.set(key, pool)
      }
    }
    this.flashes = this.flashes.filter(f => f.age < f.duration)
  }
  private effect(e: Effect) {
    if (this.flashes.length >= 120) return
    if ((e.kind === 'line' || e.kind === 'dash') && e.to) {
      const count = e.kind === 'line' ? 5 : 1
      let from = e.from
      for (let i = 1; i <= count; i++) {
        const t = i / count
        const to = { x: e.from.x + (e.to.x - e.from.x) * t + (i < count ? Math.sin(i * 7) * 0.45 : 0), y: e.from.y + (e.to.y - e.from.y) * t + (i < count ? Math.cos(i * 7) * 0.45 : 0) }
        const mesh = this.acquire('line', e.color)
        mesh.position.set((from.x + to.x) / 2, 0.85, (from.y + to.y) / 2)
        mesh.rotation.y = -Math.atan2(to.y - from.y, to.x - from.x)
        mesh.scaling.set(Math.hypot(to.x - from.x, to.y - from.y), e.kind === 'dash' ? 2 : 1, e.kind === 'dash' ? 3 : 1)
        this.flashes.push({ mesh, age: 0, duration: 220, radius: 1, kind: e.kind })
        from = to
      }
    } else {
      const mesh = this.acquire(e.kind === 'slash' ? 'slash' : 'burst', e.color)
      mesh.position.set(e.from.x, 0.2, e.from.y)
      mesh.rotation.y = ((e.facing ?? 0) - 90 + 75) * Math.PI / 180
      mesh.scaling.set(e.radius * 0.5, 1, e.radius * 0.5)
      this.flashes.push({ mesh, age: 0, duration: 350, radius: e.radius, kind: e.kind })
    }
  }
  private acquire(shape: 'line' | 'burst' | 'slash', color: string) {
    const key = `${shape}-${color}`
    let mesh = this.pool.get(key)?.pop()
    if (!mesh) {
      mesh = shape === 'line' ? MeshBuilder.CreateBox(key, { width: 1, height: 0.08, depth: 0.09 }, this.scene)
        : shape === 'burst' ? MeshBuilder.CreateTorus(key, { diameter: 2, thickness: 0.12, tessellation: 32 }, this.scene)
          : MeshBuilder.CreateDisc(key, { radius: 1, arc: 150 / 360, tessellation: 32, sideOrientation: 2 }, this.scene)
      if (shape === 'slash') mesh.rotation.x = Math.PI / 2
      mesh.material = this.mat(color)
      mesh.metadata = key
      mesh.isPickable = false
    }
    mesh.setEnabled(true)
    mesh.visibility = 1
    return mesh
  }
}
