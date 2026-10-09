// src/renderer/vfx/vfx-renderer.ts
// Event-driven skill effects: cast circles, melee slashes, projectiles, impacts,
// buff auras, AOE resolution bursts and death bursts. Pure presentation — reads
// entities and bus events, never mutates game state. Every visual is pooled and
// capped so long fights don't leak meshes.
import {
  MeshBuilder, Color3, Vector3, Mesh, TransformNode,
  type Scene, type ShaderMaterial,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityManager } from '@/entity/entity-manager'
import type { FlurryGuard, SkillDef, VfxElement } from '@/core/types'
import type { ActiveAoeZone } from '@/skill/aoe-zone'
import type { SceneManager } from '../scene-manager'
import { resolveSkillVfx, type SkillVfx } from './vfx-style'
import { sampleZonePoints } from './zone-sampling'
import { ELEMENTS, QUARTER_TEXTURES, vfxTexture, preloadVfxTextures, type VfxTex, type ElementStyle } from './vfx-assets'
import { ParticleBurster, type BurstPreset } from './particle-burster'
import { createVfxMaterial } from './vfx-material'
import { MechanicVfx } from './mechanic-vfx'
import { HymnVfx } from './hymn-vfx'
import { ReviveVfx } from './revive-vfx'
import { HIT_INTERVAL_MS } from '../hit-split'
import { playClang } from '@/audio/clang'

type QuadKind = 'ground' | 'billboard' | 'billboardY' | 'flat' | 'arc'

interface Fx {
  mesh: Mesh
  kind: QuadKind
  age: number
  life: number
  /** t in 0..1 */
  tick(fx: Fx, t: number, dt: number): void
  onDone?(): void
}

interface Projectile {
  head: Fx
  from: Vector3
  targetId: string
  to: Vector3
  age: number
  life: number
  style: ElementStyle
  element: VfxElement
  small: boolean
  sourceId: string
}

interface CastFx { circle: Fx; inner: Fx; element: VfxElement; casterId: string; big: boolean }

const MAX_FX = 220
const PROJECTILE_SPEED = 28 // m/s
const DELIVERY_WINDOW = 700 // ms during which a delivery visual suppresses the generic damage impact

type PresetId = 'spark' | 'debris' | 'mote' | 'trail' | 'smoke'

/** Shield tint per guard: steel for a block, gold for a deflect, near-white gold for a perfect deflect */
const GUARD_COLORS: Record<Exclude<FlurryGuard, 'none'>, Color3> = {
  block: Color3.FromHexString('#9fd6ff'),
  deflect: Color3.FromHexString('#ffd27a'),
  perfect: Color3.FromHexString('#fff2c0'),
}

export class VfxRenderer {
  private scene: Scene
  private fx: Fx[] = []
  private pool = new Map<QuadKind, Mesh[]>()
  private materials = new Map<string, ShaderMaterial>()
  private bursters = new Map<string, ParticleBurster>()
  private projectiles: Projectile[] = []
  private casts = new Map<string, CastFx>()
  private skills = new Map<string, SkillDef>()
  /** `${sourceId}>${targetId}` → render clock ms of the last delivery visual */
  private deliveries = new Map<string, number>()
  private arcTemplate: Mesh
  private revive: ReviveVfx
  private now = 0

  constructor(
    readonly sm: SceneManager,
    bus: EventBus,
    readonly entities: EntityManager,
    readonly heightOf: (e: Entity) => number,
    private enemyElement: VfxElement,
  ) {
    this.scene = sm.scene
    preloadVfxTextures(this.scene)
    this.arcTemplate = this.buildArcTemplate()
    new MechanicVfx(this, bus)
    new HymnVfx(this, bus)
    this.revive = new ReviveVfx(this, bus)

    bus.on('skill:cast_start', ({ caster, skill }: { caster: Entity; skill: SkillDef }) => {
      this.skills.set(skill.id, skill)
      const castTime = caster.casting?.castTime ?? skill.castTime
      if (castTime > 0) this.startCast(caster, skill)
    })
    bus.on('skill:cast_interrupted', ({ caster }: { caster: Entity }) => this.endCast(caster.id))
    bus.on('skill:cast_complete', ({ caster, skill }: { caster: Entity; skill: SkillDef }) => {
      this.skills.set(skill.id, skill)
      this.endCast(caster.id)
      this.deliver(caster, skill)
    })
    bus.on('damage:dealt', (p: { source?: Entity; target: Entity; amount: number; periodic?: boolean }) => this.onDamage(p))
    bus.on('combat:flurry', (p: { sourceId?: string; targetId: string; hits: number; guard: FlurryGuard }) => {
      for (let i = 0; i < p.hits; i++) {
        this.later(i * HIT_INTERVAL_MS, () => this.strike(p.targetId, p.sourceId, p.guard, i === p.hits - 1))
      }
    })
    bus.on('aoe:zone_resolved', ({ zone }: { zone: ActiveAoeZone }) => this.onZoneResolved(zone))
    bus.on('entity:died', ({ entity }: { entity: Entity }) => this.onDeath(entity))
    // The game loop stops at combat end, so casts never get their interrupt/complete event
    bus.on('combat:ended', () => { for (const id of [...this.casts.keys()]) this.endCast(id) })
  }

  // --- Building blocks --------------------------------------------------------

  private buildArcTemplate(): Mesh {
    // 130° ribbon arc in the XZ plane centred on +Z; u runs along the arc, v across it
    const inner: Vector3[] = [], outer: Vector3[] = []
    const span = (130 * Math.PI) / 180
    for (let i = 0; i <= 24; i++) {
      const a = -span / 2 + (i / 24) * span
      inner.push(new Vector3(Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55))
      outer.push(new Vector3(Math.sin(a), 0, Math.cos(a)))
    }
    const arc = MeshBuilder.CreateRibbon('vfx-arc-template', { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE }, this.scene)
    arc.setEnabled(false)
    arc.isPickable = false
    return arc
  }

  private material(tex: VfxTex, color: Color3): ShaderMaterial {
    const key = `${tex}:${color.toHexString()}`
    let m = this.materials.get(key)
    if (!m) {
      m = createVfxMaterial(`vfx-${key}`, this.scene, vfxTexture(this.scene, tex), color, { quarter: QUARTER_TEXTURES.has(tex) })
      this.materials.set(key, m)
    }
    return m
  }

  private acquire(kind: QuadKind): Mesh {
    const list = this.pool.get(kind)
    const mesh = list?.pop() ?? this.createQuad(kind)
    mesh.setEnabled(true)
    mesh.visibility = 1
    mesh.renderingGroupId = 0
    mesh.scaling.setAll(1)
    mesh.rotation.set(kind === 'ground' ? 0 : 0, 0, 0)
    mesh.position.setAll(0)
    return mesh
  }

  private createQuad(kind: QuadKind): Mesh {
    let m: Mesh
    switch (kind) {
      case 'ground':
      case 'flat':
        m = MeshBuilder.CreateGround(`vfx-${kind}`, { width: 1, height: 1 }, this.scene)
        break
      case 'arc':
        m = this.arcTemplate.clone('vfx-arc')
        break
      default:
        m = MeshBuilder.CreatePlane(`vfx-${kind}`, { size: 1 }, this.scene)
        m.billboardMode = kind === 'billboard' ? TransformNode.BILLBOARDMODE_ALL : TransformNode.BILLBOARDMODE_Y
    }
    m.isPickable = false
    return m
  }

  private release(f: Fx): void {
    f.mesh.setEnabled(false)
    const list = this.pool.get(f.kind) ?? []
    list.push(f.mesh)
    this.pool.set(f.kind, list)
  }

  /** @internal shared with MechanicVfx */
  spawn(kind: QuadKind, tex: VfxTex, color: Color3, life: number, tick: Fx['tick']): Fx {
    return this.spawnWith(kind, this.material(tex, color), life, tick)
  }

  /** @internal shared with MechanicVfx — same pooling, caller-provided material (e.g. canvas glyphs) */
  spawnWith(kind: QuadKind, material: ShaderMaterial, life: number, tick: Fx['tick']): Fx {
    if (this.fx.length >= MAX_FX) {
      // Evict the oldest finite effect; infinite ones (cast circles, projectile heads) are owned elsewhere
      const i = this.fx.findIndex(f => Number.isFinite(f.life))
      if (i >= 0) {
        const [old] = this.fx.splice(i, 1)
        old.onDone?.()
        this.release(old)
      }
    }
    const mesh = this.acquire(kind)
    mesh.material = material
    const f: Fx = { mesh, kind, age: 0, life, tick }
    tick(f, 0, 0)
    this.fx.push(f)
    return f
  }

  /** @internal shared with MechanicVfx */
  burster(preset: PresetId, element: VfxElement): ParticleBurster {
    const key = `${preset}:${element}`
    let b = this.bursters.get(key)
    if (!b) {
      const s = ELEMENTS[element]
      const tex = (t: VfxTex) => vfxTexture(this.scene, t)
      const presets: Record<PresetId, BurstPreset> = {
        spark: { texture: tex('lightStar'), capacity: 300, size: [0.22, 0.5], life: [0.2, 0.45], speed: [5, 11], gravity: -14, endScale: 0.2 },
        debris: { texture: tex(s.debris), capacity: 500, size: [0.45, 0.95], life: [0.4, 0.85], speed: [2.5, 6.5], gravity: s.gravity * 1.6, spin: true, endScale: 0.3 },
        mote: { texture: tex('glow'), capacity: 300, size: [0.18, 0.4], life: [0.5, 1.1], speed: [0.6, 1.6], gravity: 1.2, endScale: 0.2 },
        trail: { texture: tex('glow'), capacity: 400, size: [0.5, 0.85], life: [0.14, 0.3], speed: [0, 0.4], gravity: 0, endScale: 0.1 },
        smoke: { texture: tex(element === 'fire' ? 'fireSmall' : element === 'dark' ? 'darkFire' : 'softWhite'), capacity: 200, size: [0.8, 1.6], life: [0.4, 0.9], speed: [0.8, 2], gravity: 1.5, spin: true, endScale: 1.6 },
      }
      b = new ParticleBurster(`vfx-${key}`, this.scene, presets[preset], s.color, s.core)
      this.bursters.set(key, b)
    }
    return b
  }

  /** @internal shared with MechanicVfx */
  chest(e: Entity): Vector3 {
    return new Vector3(e.position.x, this.heightOf(e) * 0.5, e.position.y)
  }

  private elementFor(caster: Entity | undefined, skill: SkillDef | undefined): SkillVfx | null {
    if (!skill) return null
    const fallback: VfxElement = caster?.type === 'player' ? 'physical' : this.enemyElement
    return resolveSkillVfx(skill, fallback)
  }

  // --- Casting ----------------------------------------------------------------

  private startCast(caster: Entity, skill: SkillDef): void {
    this.endCast(caster.id)
    const style = this.elementFor(caster, skill)!
    const s = ELEMENTS[style.element]
    const big = caster.type !== 'player'
    const r = big ? Math.max(2.6, caster.size * 2) : 1.9
    const circle = this.spawn('ground', big ? 'circleOctagon' : s.circle, s.color, Infinity, (f, _t, dt) => {
      const e = this.entities.get(caster.id)
      if (e) f.mesh.position.set(e.position.x, 0.05, e.position.y)
      f.mesh.rotation.y += dt * 0.0006
      const grow = Math.min(1, f.age / 220)
      f.mesh.scaling.set(r * 2 * (0.6 + grow * 0.4), 1, r * 2 * (0.6 + grow * 0.4))
      f.mesh.visibility = grow
    })
    const inner = this.spawn('ground', 'circleSimple', s.core, Infinity, (f, _t, dt) => {
      const e = this.entities.get(caster.id)
      if (e) f.mesh.position.set(e.position.x, 0.06, e.position.y)
      f.mesh.rotation.y -= dt * 0.0012
      const grow = Math.min(1, f.age / 300)
      f.mesh.scaling.set(r * 1.2 * grow, 1, r * 1.2 * grow)
      f.mesh.visibility = grow * 0.55
    })
    this.casts.set(caster.id, { circle, inner, element: style.element, casterId: caster.id, big })
  }

  private endCast(casterId: string): void {
    const c = this.casts.get(casterId)
    if (!c) return
    this.casts.delete(casterId)
    for (const f of [c.circle, c.inner]) {
      // Convert to a short fade-out
      const start = f.mesh.visibility
      const base = f.mesh.scaling.x
      f.age = 0
      f.life = 220
      f.tick = (fx, t) => {
        fx.mesh.visibility = start * (1 - t)
        fx.mesh.scaling.set(base * (1 + t * 0.25), 1, base * (1 + t * 0.25))
      }
    }
  }

  private tickCasts(): void {
    for (const c of this.casts.values()) {
      const e = this.entities.get(c.casterId)
      if (!e) continue
      if (Math.random() < (c.big ? 0.9 : 0.5)) {
        const r = c.big ? Math.max(2, e.size * 1.6) : 1.2
        const a = Math.random() * Math.PI * 2
        this.burster('mote', c.element).emit(e.position.x + Math.cos(a) * r, 0.1, e.position.y + Math.sin(a) * r, 1, { dirY: 1, spread: 0.1, jitter: 0.1 })
      }
    }
  }

  // --- Delivery ---------------------------------------------------------------

  private deliver(caster: Entity, skill: SkillDef): void {
    const style = this.elementFor(caster, skill)!
    const s = ELEMENTS[style.element]
    const small = skill.id.endsWith('_auto')
    const target = caster.target ? this.entities.get(caster.target) : undefined
    const casterHeight = this.heightOf(caster)

    // Spell release flash at the caster
    if (skill.type === 'spell' && style.delivery !== 'buff') {
      const p = new Vector3(caster.position.x, casterHeight * 0.6, caster.position.y)
      this.flash(p, s.impact, s.color, 2.6, 240)
    }

    switch (style.delivery) {
      case 'melee':
        this.slash(caster, s, small, style.element)
        if (target) {
          this.markDelivery(caster.id, target.id)
          const t = this.chest(target)
          this.later(70, () => this.impact(t, style.element, small ? 0.6 : 1, caster))
        }
        break
      case 'projectile':
        if (target) this.projectile(caster, target, style.element, small)
        break
      case 'beam':
        if (target) {
          this.markDelivery(caster.id, target.id)
          this.bolt(target, style.element)
        }
        break
      case 'buff':
        this.aura(caster, style.element)
        break
      case 'burst':
        // Zone visuals play on aoe:zone_resolved; a small flourish marks the release
        this.flash(new Vector3(caster.position.x, 0.4, caster.position.y), 'glowRing', s.color, 2.5, 260, 'ground')
        break
    }

    const partyHeal = skill.effects?.find(e => e.type === 'party_heal')
    if (partyHeal?.type === 'party_heal') this.ripple(caster, partyHeal.radius, style.element)
  }

  /** Party heals: waves roll out from the caster's feet to the edge of the effect range */
  private ripple(caster: Entity, radius: number, element: VfxElement): void {
    const s = ELEMENTS[element]
    const x = caster.position.x, z = caster.position.y
    // Ring textures peak at ~0.78 of the quad's half-width; scale so the bright edge lands on `r`
    const ringScale = (r: number) => r * 2 / 0.78
    for (let i = 0; i < 3; i++) {
      this.later(i * 160, () => this.spawn('ground', 'ringThin', s.color, 900, (f, t) => {
        const r = 0.6 + (radius - 0.6) * (1 - (1 - t) ** 2)
        f.mesh.position.set(x, 0.09 + i * 0.005, z)
        f.mesh.scaling.set(ringScale(r), 1, ringScale(r))
        f.mesh.visibility = (i === 0 ? 0.8 : 0.45) * (1 - t * t)
      }))
    }
  }

  private markDelivery(sourceId: string, targetId: string): void {
    this.deliveries.set(`${sourceId}>${targetId}`, this.now)
  }

  private timers: { at: number; fn: () => void }[] = []
  /** @internal shared with MechanicVfx */
  later(ms: number, fn: () => void): void {
    this.timers.push({ at: this.now + ms, fn })
  }

  private slash(caster: Entity, s: ElementStyle, small: boolean, element: VfxElement): void {
    const h = this.heightOf(caster)
    const reach = (small ? 2.4 : 3.6) * Math.max(1, caster.size / 0.6)
    const tilt = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35)
    const yaw = (caster.facing * Math.PI) / 180
    const sweep = Math.random() < 0.5 ? -1 : 1
    const tex: VfxTex = element === 'physical' ? 'slashArc' : 'slashArc'
    this.spawn('arc', tex, s.color, small ? 180 : 240, (f, t) => {
      f.mesh.position.set(caster.position.x, h * 0.48, caster.position.y)
      f.mesh.rotation.set(0, yaw + sweep * (t - 0.5) * 0.9, tilt)
      const sc = reach * (0.85 + t * 0.25)
      f.mesh.scaling.set(sc, 1, sc)
      f.mesh.visibility = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8
    })
    if (!small) {
      this.spawn('arc', 'slashRing', s.core, 200, (f, t) => {
        f.mesh.position.set(caster.position.x, h * 0.5, caster.position.y)
        f.mesh.rotation.set(0, yaw + sweep * (t - 0.5) * 1.2, tilt)
        const sc = reach * 0.9
        f.mesh.scaling.set(sc, 1, sc)
        f.mesh.visibility = (1 - t) * 0.8
      })
    }
  }

  private projectile(caster: Entity, target: Entity, element: VfxElement, small: boolean): void {
    const s = ELEMENTS[element]
    const from = new Vector3(caster.position.x, this.heightOf(caster) * 0.62, caster.position.y)
    const to = this.chest(target)
    const dist = Vector3.Distance(from, to)
    const life = Math.min(520, Math.max(120, (dist / PROJECTILE_SPEED) * 1000))
    const arrow = element === 'physical' || element === 'wind'
    const size = small ? 0.9 : 1.6
    const head = this.spawn(arrow ? 'flat' : 'billboard', s.orb, arrow ? s.core : s.color, Infinity, (f) => {
      if (arrow) f.mesh.scaling.set(2.2 * size, 1, 0.45 * size)
      else f.mesh.scaling.setAll(1.2 * size)
    })
    this.markDelivery(caster.id, target.id)
    this.projectiles.push({ head, from, to, targetId: target.id, age: 0, life, style: s, element, small, sourceId: caster.id })
  }

  private tickProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]
      p.age += dt
      const target = this.entities.get(p.targetId)
      if (target) p.to = this.chest(target)
      const t = Math.min(1, p.age / p.life)
      const pos = Vector3.Lerp(p.from, p.to, t)
      pos.y += Math.sin(t * Math.PI) * 0.6 * (p.small ? 0.4 : 1)
      p.head.mesh.position.copyFrom(pos)
      if (p.head.kind === 'flat') {
        const d = p.to.subtract(p.from)
        p.head.mesh.rotation.y = Math.atan2(-d.z, d.x)
      } else {
        p.head.mesh.rotation.z += dt * 0.01
      }
      this.burster('trail', p.element).emit(pos.x, pos.y, pos.z, p.small ? 1 : 2, { dirY: 0, spread: 0.2, jitter: 0.15 })
      if (t >= 1) {
        p.head.life = 0
        this.projectiles.splice(i, 1)
        this.impact(p.to, p.element, p.small ? 0.6 : 1.1, this.entities.get(p.sourceId))
      }
    }
  }

  private bolt(target: Entity, element: VfxElement): void {
    const s = ELEMENTS[element]
    const x = target.position.x, z = target.position.y
    this.spawn('billboardY', element === 'dark' ? 'boltPurple' : 'bolt', s.core, 260, (f, t) => {
      f.mesh.position.set(x, 4, z)
      f.mesh.scaling.set(2.2, 8.5, 1)
      f.mesh.visibility = t < 0.15 ? 1 : (1 - t) * 1.2 * (Math.random() * 0.4 + 0.6)
    })
    this.flash(new Vector3(x, 0.08, z), 'glowDisc', s.color, 3, 300, 'ground')
    this.impact(this.chest(target), element, 1.2)
  }

  private aura(caster: Entity, element: VfxElement): void {
    const s = ELEMENTS[element]
    const id = caster.id
    this.spawn('ground', 'glowRing', s.color, 650, (f, t) => {
      const e = this.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, 0.06, e.position.y)
      const sc = 1.5 + t * 4.5
      f.mesh.scaling.set(sc, 1, sc)
      f.mesh.visibility = 1 - t
    })
    this.spawn('ground', 'glowDisc', s.color, 450, (f, t) => {
      const e = this.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, 0.05, e.position.y)
      f.mesh.scaling.set(3.2, 1, 3.2)
      f.mesh.visibility = 0.7 * (1 - t)
    })
    this.spawn('billboardY', 'lightPillar', s.color, 650, (f, t) => {
      const e = this.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, 2.2, e.position.y)
      f.mesh.scaling.set(2.4 * (1 - t * 0.5), 4.6 + t, 1)
      f.mesh.visibility = t < 0.15 ? t / 0.15 : (1 - t) / 0.85
    })
    this.burster('mote', element).emit(caster.position.x, 0.2, caster.position.y, 40, { dirY: 1, spread: 0.6, jitter: 1.6 })
  }

  /** Camera-facing flash that pops and fades. `kind: 'ground'` lays it flat. */
  /** @internal shared with MechanicVfx */
  flash(pos: Vector3, tex: VfxTex, color: Color3, size: number, life: number, kind: QuadKind = 'billboard'): void {
    const rot = Math.random() * Math.PI * 2
    this.spawn(kind, tex, color, life, (f, t) => {
      f.mesh.position.copyFrom(pos)
      const sc = size * (0.55 + 0.6 * Math.sqrt(t))
      if (kind === 'ground') { f.mesh.scaling.set(sc, 1, sc); f.mesh.rotation.y = rot }
      else { f.mesh.scaling.setAll(sc); f.mesh.rotation.z = rot }
      f.mesh.visibility = 1 - t * t
    })
  }

  /** @internal shared with MechanicVfx */
  impact(pos: Vector3, element: VfxElement, scale = 1, source?: Entity): void {
    const s = ELEMENTS[element]
    this.flash(pos, s.impact, s.color, 3 * scale, 240)
    this.flash(pos, 'sparkB', s.core, 2 * scale, 160)
    this.burster('spark', element).emit(pos.x, pos.y, pos.z, Math.round(14 * scale), { dirY: 0.4, spread: 1.4, jitter: 0.25 })
    if (scale >= 1) this.burster('debris', element).emit(pos.x, pos.y, pos.z, Math.round(8 * scale), { dirY: 0.6, spread: 1.2, jitter: 0.4 })
    void source
  }

  // --- Reactions --------------------------------------------------------------

  private onDamage(p: { source?: Entity; target: Entity; amount: number; periodic?: boolean; hits?: number }): void {
    const target = p.target
    if (!target?.position) return
    if (p.amount < 0) {
      // Heal: rising green sparkles
      this.burster('mote', 'heal').emit(target.position.x, 0.3, target.position.y, 10, { dirY: 1, spread: 0.3, jitter: 0.8 })
      return
    }
    if (p.periodic || !(p.amount > 0)) return
    // Bosses reaching 0 HP end the fight without entity:died
    if (target.hp <= 0 && target.type === 'boss' && !this.dead.has(target.id)) { this.endCast(target.id); this.onDeath(target) }
    // Flurries land beat by beat through `combat:flurry`
    if ((p.hits ?? 1) > 1) return
    const key = `${p.source?.id}>${target.id}`
    const delivered = this.deliveries.get(key)
    if (delivered !== undefined && this.now - delivered < DELIVERY_WINDOW) return
    const source = p.source?.id ? this.entities.get(p.source.id) : undefined
    const element = source?.type === 'player' ? 'physical' : this.enemyElement
    this.impact(this.chest(target), element, 0.8)
    if (target.type === 'player') {
      const heavy = p.amount >= target.maxHp * 0.08
      this.sm.shake(heavy ? 0.35 : 0.12, heavy ? 260 : 140)
    }
  }

  /**
   * One beat of a flurry. Clean hits: shockwave at the feet, spark at the chest. Guarded hits
   * (Sekiro-style): a shield pops on the target, sparks fly where the blows meet and metal rings out.
   * The last beat hits hardest.
   */
  private strike(targetId: string, sourceId: string | undefined, guard: FlurryGuard, last: boolean): void {
    const e = this.entities.get(targetId)
    if (!e) return
    const chest = this.chest(e)
    if (guard !== 'none') {
      const src = sourceId ? this.entities.get(sourceId) : undefined
      const contact = src ? Vector3.Lerp(chest, this.chest(src), 0.3) : chest
      const shield = src ? Vector3.Lerp(chest, this.chest(src), 0.12) : chest
      const color = GUARD_COLORS[guard]
      const big = guard === 'perfect' || last
      this.flash(shield, 'circleSym', color, big ? 4.6 : 3.6, 200)
      this.flash(chest, 'glowRing', color, big ? 4.2 : 3.2, 180)
      this.flash(contact, 'flashStar', color, big ? 3.6 : 2.5, 140)
      this.burster('spark', 'physical').emit(contact.x, contact.y, contact.z, guard === 'block' ? 20 : big ? 56 : 34, { dirY: 0.4, spread: 2.4, jitter: 0.2 })
      if (last) this.flash(new Vector3(e.position.x, 0.08, e.position.y), 'ringThick', color, 6, 480, 'ground')
      if (e.type === 'player') this.sm.shake(guard === 'block' ? 0.12 : last ? 0.3 : 0.06, last ? 260 : 60)
      playClang(guard, { accent: last })
      return
    }
    const feet = new Vector3(e.position.x, 0.08, e.position.y)
    const s = ELEMENTS[this.enemyElement]
    this.flash(feet, 'ringThick', s.color, last ? 7 : 3.2, last ? 520 : 260, 'ground')
    this.flash(feet, 'waveRing', s.core, last ? 5 : 2.4, 220, 'ground')
    this.flash(chest, Math.random() < 0.5 ? 'spark' : 'crescent', s.core, last ? 4 : 2.2, 160)
    this.impact(chest, this.enemyElement, last ? 1.3 : 0.5)
    if (e.type === 'player') this.sm.shake(last ? 0.5 : 0.14, last ? 320 : 80)
  }

  private onZoneResolved(zone: ActiveAoeZone): void {
    const caster = zone.casterId ? this.entities.get(zone.casterId) : undefined
    const skill = this.skills.get(zone.skillId)
    const element: VfxElement = (skill && this.elementFor(caster, skill)?.element)
      || (caster?.type === 'player' ? 'aether' : this.enemyElement)
    const s = ELEMENTS[element]
    const shape = zone.def.shape
    const cx = zone.center.x, cz = zone.center.y

    // Knockback / pull: the marker already showed direction; a short pulse sells the shove
    if (zone.def.marker === 'knockback' || zone.def.marker === 'pull') {
      this.flash(new Vector3(cx, 0.1, cz), 'knockbackEmblem', s.core, 9, 380, 'ground')
      this.sm.shake(0.35, 260)
      return
    }

    // Splash around a single-target attack: the attack's own delivery already shows it
    if (zone.def.exceptTarget) return

    // Raidwide (no telegraph): one thin expanding wave from the caster instead of area-filling bursts
    if (zone.def.telegraph === false) {
      this.spawn('ground', 'ringThin', s.color, 700, (f, t) => {
        f.mesh.position.set(cx, 0.12, cz)
        const r = 2 + 46 * (1 - (1 - t) ** 2)
        f.mesh.scaling.set(r, 1, r)
        f.mesh.visibility = 1 - t
      })
      this.flash(new Vector3(cx, 2, cz), s.impact, s.core, 6, 380)
      this.sm.shake(0.3, 300)
      return
    }
    const area = shape.type === 'circle' ? Math.PI * shape.radius ** 2
      : shape.type === 'fan' ? Math.PI * shape.radius ** 2 * (shape.angle / 360)
      : shape.type === 'ring' ? Math.PI * (shape.outerRadius ** 2 - shape.innerRadius ** 2)
      : shape.length * shape.width

    // Shockwave
    if (shape.type === 'circle' || shape.type === 'ring') {
      const r0 = shape.type === 'ring' ? shape.innerRadius : shape.radius * 0.2
      const r1 = shape.type === 'ring' ? shape.outerRadius : shape.radius * 1.05
      this.spawn('ground', 'ringThick', s.color, 420, (f, t) => {
        const r = r0 + (r1 - r0) * (1 - (1 - t) ** 3)
        f.mesh.position.set(cx, 0.1, cz)
        f.mesh.scaling.set(r * 2.1, 1, r * 2.1)
        f.mesh.visibility = 1 - t
      })
      // Ground flash dims with area so arena-wide AOEs don't white out the screen
      if (shape.type === 'circle') {
        const peak = Math.min(0.8, 6 / shape.radius)
        this.spawn('ground', 'glowDisc', s.color, 380, (f, t) => {
          f.mesh.position.set(cx, 0.07, cz)
          const r = shape.radius * 2.2 * (0.7 + 0.3 * t)
          f.mesh.scaling.set(r, 1, r)
          f.mesh.visibility = peak * (1 - t)
        })
      }
    }

    // Scatter bursts across the area
    const points = sampleZonePoints(shape, zone.center, zone.facing, Math.min(36, Math.max(4, Math.round(area / 6))))
    let flashes = 0
    for (const pt of points) {
      this.burster('debris', element).emit(pt.x, 0.3, pt.y, 2, { dirY: 1, spread: 0.6, jitter: 0.6 })
      if (flashes < 7 && Math.random() < 0.35) {
        flashes++
        this.flash(new Vector3(pt.x, 0.6, pt.y), s.impact, s.color, 2.2, 260)
      }
    }
    if (element === 'fire' || element === 'dark' || element === 'earth') {
      for (const pt of points.slice(0, 10)) this.burster('smoke', element).emit(pt.x, 0.4, pt.y, 1, { dirY: 1, spread: 0.3, jitter: 0.5 })
    }
    if (element === 'lightning' || element === 'holy') {
      for (const pt of points.slice(0, 3)) {
        this.spawn('billboardY', element === 'holy' ? 'lightPillar' : 'bolt', s.core, 300, (f, t) => {
          f.mesh.position.set(pt.x, element === 'holy' ? 2.5 : 4, pt.y)
          f.mesh.scaling.set(element === 'holy' ? 2 : 2.4, element === 'holy' ? 5 : 8.5, 1)
          f.mesh.visibility = 1 - t
        })
      }
    }

    // Enemy hits shake the camera in proportion to the area
    if (caster?.type !== 'player') this.sm.shake(Math.min(0.3, 0.06 + area / 900), 220)
  }

  private dead = new Set<string>()

  private onDeath(entity: Entity): void {
    if (entity.type === 'player' || this.dead.has(entity.id)) return
    this.dead.add(entity.id)
    this.endCast(entity.id)
    const element = this.enemyElement
    const s = ELEMENTS[element]
    const big = entity.type === 'boss'
    const pos = this.chest(entity)
    this.flash(pos, 'flashStar', s.core, big ? 9 : 4, big ? 650 : 400)
    this.flash(new Vector3(pos.x, 0.08, pos.z), 'ringThick', s.color, big ? 14 : 6, big ? 700 : 450, 'ground')
    this.burster('debris', element).emit(pos.x, pos.y, pos.z, big ? 60 : 20, { dirY: 0.8, spread: 1.4, jitter: 0.8 })
    this.burster('mote', element).emit(pos.x, 0.3, pos.z, big ? 50 : 16, { dirY: 1, spread: 0.6, jitter: big ? 3 : 1.2 })
    if (big) this.sm.shake(0.5, 600)
  }

  /** Large enemies continuously shed motes of the encounter element. */
  private tickAuras(dt: number): void {
    for (const e of this.entities.getAlive()) {
      if (e.type === 'player' || !e.visible || e.size < 1.1) continue
      const rate = e.size * 9 // particles per second
      let n = rate * (dt / 1000)
      while (n > 0) {
        if (n < 1 && Math.random() > n) break
        n -= 1
        const a = Math.random() * Math.PI * 2
        const r = e.size * (0.4 + Math.random() * 0.9)
        this.burster('mote', this.enemyElement).emit(e.position.x + Math.cos(a) * r, 0.2 + Math.random() * 1.5, e.position.y + Math.sin(a) * r, 1, { dirY: 1, spread: 0.15, jitter: 0.2 })
      }
    }
  }

  // --- Frame ------------------------------------------------------------------

  update(dt: number): void {
    if (dt <= 0) return
    this.now += dt
    if (this.timers.length) {
      const due = this.timers.filter(t => t.at <= this.now)
      this.timers = this.timers.filter(t => t.at > this.now)
      for (const t of due) t.fn()
    }
    this.tickCasts()
    this.tickAuras(dt)
    this.revive.update(dt)
    this.tickProjectiles(dt)
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]
      f.age += dt
      const t = Number.isFinite(f.life) ? Math.min(1, f.age / Math.max(1, f.life)) : 0
      f.tick(f, t, dt)
      if (t >= 1) {
        f.onDone?.()
        this.release(f)
        this.fx.splice(i, 1)
      }
    }
    if (this.deliveries.size > 64) {
      for (const [k, at] of this.deliveries) if (this.now - at > DELIVERY_WINDOW) this.deliveries.delete(k)
    }
  }

  dispose(): void {
    for (const b of this.bursters.values()) b.dispose()
    this.bursters.clear()
  }
}
