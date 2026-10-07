// src/renderer/characters/character-renderer.ts
// Default entity renderer: animated glTF characters with gameplay indicators
// (feet hit point, facing arrow, auto-attack range ring, aggro fan).
// Reads entity state + bus events only; never mutates game state.
import {
  MeshBuilder, StandardMaterial, Color3, TransformNode,
  type Mesh, type AnimationGroup, type Scene,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import type { EntityVisuals } from '../entity-visuals'
import type { SceneManager } from '../scene-manager'
import { buildModel, type ModelKind } from './procedural-models'
import { resolveModel, modelScaleFor, MODELS, type ModelSpec, type AnimRole } from './model-catalog'
import { ModelLibrary, type ModelInstance } from './model-library'
import { selectAnimation, resolveClip, type OneShot } from './animation-state'

const ROTATION_SPEED = 720 // degrees per second
const CROSSFADE_MS = 140
const FLASH_MS = 120
const SQUASH_MS = 160
const CORPSE_FADE_DELAY = 1400
const CORPSE_FADE_MS = 700

/** Shortest signed angular distance from `from` to `to` in degrees. */
function angleDelta(from: number, to: number): number {
  let d = ((to - from) % 360 + 360) % 360
  if (d > 180) d -= 360
  return d
}

interface Fade { group: AnimationGroup; from: number; to: number; t: number }

interface CharacterView {
  entity: Entity
  spec: ModelSpec
  scale: number
  root: TransformNode
  body: TransformNode
  placeholder: Mesh | null
  model: ModelInstance | null
  hitPoint: Mesh
  facingArrow: Mesh
  rangeRing: Mesh | null
  aggroFan: Mesh | null
  displayFacing: number
  lastX: number
  lastY: number
  velocity: number
  oneShot: OneShot | null
  attackVariant: number
  clip: AnimationGroup | null
  clipName: string | null
  fades: Fade[]
  flashUntil: number
  squashUntil: number
  lastHitAnim: number
  deadAt: number | null
  baseEmissive: Map<StandardMaterial, Color3>
}

export class CharacterRenderer implements EntityVisuals {
  private views = new Map<string, CharacterView>()
  private library: ModelLibrary
  private placeholders = new Map<ModelKind, Mesh>()
  private scene: Scene
  private now = 0

  constructor(private sm: SceneManager, bus: EventBus) {
    this.scene = sm.scene
    this.library = ModelLibrary.for(this.scene)

    bus.on('entity:created', ({ entity }: { entity: Entity }) => this.create(entity))
    bus.on('entity:died', ({ entity }: { entity: Entity }) => {
      const v = this.views.get(entity.id)
      if (v && v.deadAt === null) v.deadAt = this.now
    })
    bus.on('skill:cast_complete', ({ caster, skill }: { caster: Entity; skill: SkillDef }) => {
      const v = this.views.get(caster.id)
      if (!v) return
      const role: OneShot['role'] = skill.type === 'spell' ? 'castRelease'
        : v.spec.clips.shoot && skill.type !== 'ability' ? 'shoot' : 'attack'
      this.playOneShot(v, role)
    })
    bus.on('damage:dealt', (p: { target: Entity; amount: number; periodic?: boolean }) => {
      if (!(p.amount > 0)) return
      const v = this.views.get(p.target.id)
      if (!v) return
      // Bosses reaching 0 HP end the battle without entity:died; treat it as death here
      if (p.target.hp <= 0 && v.deadAt === null) v.deadAt = this.now
      v.flashUntil = this.now + FLASH_MS
      v.squashUntil = this.now + SQUASH_MS
      // Flinch only on meaningful direct hits, throttled so autos don't stun-lock the pose
      const meaningful = p.amount >= p.target.maxHp * (p.target.type === 'boss' ? 0.02 : 0.04)
      if (!p.periodic && meaningful && this.now - v.lastHitAnim > 900) {
        v.lastHitAnim = this.now
        this.playOneShot(v, 'hit')
      }
    })
  }

  // --- Creation --------------------------------------------------------------

  private placeholderTemplate(kind: ModelKind): Mesh {
    let t = this.placeholders.get(kind)
    if (!t) {
      t = buildModel(this.scene, kind)
      this.placeholders.set(kind, t)
    }
    return t
  }

  private create(entity: Entity): void {
    // Same id respawned while the previous corpse is still fading
    const existing = this.views.get(entity.id)
    if (existing) this.remove(existing)
    const query = { type: entity.type, model: entity.model, size: entity.size }
    const spec = resolveModel(query)
    const scale = modelScaleFor(spec, query)

    const root = new TransformNode(`entity-${entity.id}`, this.scene)
    root.position.set(entity.position.x, 0, entity.position.y)
    const body = new TransformNode(`entity-body-${entity.id}`, this.scene)
    body.parent = root

    const tpl = this.placeholderTemplate(spec.placeholder)
    const placeholder = tpl.clone(`placeholder-${entity.id}`)!
    placeholder.isVisible = true
    placeholder.parent = body
    const phScale = (spec.height * scale) / 2.4
    placeholder.scaling.setAll(phScale)
    placeholder.position.y = spec.hover ?? 0
    this.sm.addShadowCaster(placeholder)

    const color = this.indicatorColor(entity.type)
    const radius = entity.size || 0.5
    const v: CharacterView = {
      entity, spec, scale, root, body, placeholder, model: null,
      ...this.createIndicators(entity, root, color, radius),
      displayFacing: entity.facing,
      lastX: entity.position.x, lastY: entity.position.y, velocity: 0,
      oneShot: null, attackVariant: 0,
      clip: null, clipName: null, fades: [],
      flashUntil: 0, squashUntil: 0, lastHitAnim: -Infinity,
      deadAt: null, baseEmissive: new Map(),
    }
    this.views.set(entity.id, v)

    this.library.instantiate(spec, entity.id, scale).then((model) => {
      // Scene restarted (retry) or entity removed while the model was streaming in
      if (this.scene.isDisposed || this.views.get(entity.id) !== v) { model.dispose(); return }
      model.root.parent = body
      for (const m of model.meshes) this.sm.addShadowCaster(m)
      for (const mat of model.materials) v.baseEmissive.set(mat, mat.emissiveColor.clone())
      if (v.placeholder) {
        this.sm.removeShadowCaster(v.placeholder)
        v.placeholder.dispose()
        v.placeholder = null
      }
      v.model = model
      if (v.deadAt !== null) this.applyCorpseTint(v)
    }).catch((err) => {
      console.warn(`[CharacterRenderer] model ${spec.url} failed, keeping placeholder`, err)
    })
  }

  private createIndicators(entity: Entity, root: TransformNode, color: Color3, radius: number) {
    const scene = this.scene
    const hitPoint = MeshBuilder.CreateDisc(`hit-${entity.id}`, { radius: 0.11, tessellation: 16 }, scene)
    hitPoint.rotation.x = Math.PI / 2
    hitPoint.position.y = 0.06
    hitPoint.parent = root
    hitPoint.renderingGroupId = 1
    const hitMat = new StandardMaterial(`hit-mat-${entity.id}`, scene)
    hitMat.disableLighting = true
    hitMat.emissiveColor = new Color3(1, 1, 1)
    hitPoint.material = hitMat

    // Facing chevron flat on the ground, ahead of the feet
    const facingArrow = MeshBuilder.CreateDisc(`facing-${entity.id}`, { radius: 0.3, tessellation: 3 }, scene)
    // Disc tessellation 3 = triangle with a vertex on local +X; yaw -90° turns it to +Z (forward)
    facingArrow.rotation.x = Math.PI / 2
    facingArrow.rotation.y = -Math.PI / 2
    facingArrow.scaling.set(1.3, 0.75, 1)
    facingArrow.position.set(0, 0.05, radius + 0.45)
    facingArrow.parent = root
    facingArrow.renderingGroupId = 1
    const arrowMat = new StandardMaterial(`arrow-mat-${entity.id}`, scene)
    arrowMat.disableLighting = true
    arrowMat.emissiveColor = color.scale(1.1)
    arrowMat.alpha = 0.9
    facingArrow.material = arrowMat

    let rangeRing: Mesh | null = null
    const ringRadius = entity.autoAttackRange > 0
      ? entity.autoAttackRange
      : (entity.type !== 'player' ? entity.size + 0.3 : 0)
    if (ringRadius > 0) {
      rangeRing = MeshBuilder.CreateTorus(`range-${entity.id}`, { diameter: ringRadius * 2, thickness: 0.08, tessellation: 64 }, scene)
      rangeRing.position.y = 0.03
      rangeRing.scaling.y = 0.2
      rangeRing.parent = root
      const rangeMat = new StandardMaterial(`range-mat-${entity.id}`, scene)
      rangeMat.disableLighting = true
      rangeMat.emissiveColor = color.scale(0.7)
      rangeMat.alpha = 0.35
      rangeRing.material = rangeMat
    }

    let aggroFan: Mesh | null = null
    if ((entity.type === 'boss' || entity.type === 'mob') && entity.aggroRange > 0) {
      const aggroAngle = 120
      aggroFan = MeshBuilder.CreateDisc(`aggro-${entity.id}`, { radius: entity.aggroRange, tessellation: 48, arc: aggroAngle / 360 }, scene)
      aggroFan.rotation.x = Math.PI / 2
      aggroFan.rotation.y = ((0 - 90 + aggroAngle / 2) * Math.PI) / 180
      aggroFan.position.y = 0.012
      aggroFan.parent = root
      const aggroMat = new StandardMaterial(`aggro-mat-${entity.id}`, scene)
      aggroMat.disableLighting = true
      aggroMat.emissiveColor = new Color3(1.0, 0.4, 0.6)
      aggroMat.alpha = 0.1
      aggroFan.material = aggroMat
    }
    return { hitPoint, facingArrow, rangeRing, aggroFan }
  }

  private indicatorColor(type: string): Color3 {
    switch (type) {
      case 'player': return new Color3(0.45, 0.95, 0.55)
      case 'boss':
      case 'mob': return new Color3(1, 0.32, 0.25)
      default: return new Color3(0.6, 0.6, 0.6)
    }
  }

  // --- Animation -------------------------------------------------------------

  private playOneShot(v: CharacterView, role: OneShot['role']): void {
    if (role === 'hit') {
      // A flinch never interrupts a swing/release, a cast or movement (see selectAnimation)
      const busy = v.oneShot && v.oneShot.until > this.now && v.oneShot.role !== 'hit'
      const casting = !!v.entity.casting && v.entity.casting.castTime > 0
      if (busy || casting || v.velocity > 0.6 || v.deadAt !== null) return
    }
    if (!v.model || v.deadAt !== null) {
      v.oneShot = { role, until: this.now + 350 }
      return
    }
    if (role === 'attack') v.attackVariant++
    const name = resolveClip(role, v.spec.clips, c => v.model!.animations.has(c), v.attackVariant)
    if (!name) return
    const group = v.model.animations.get(name)!
    const speed = role === 'hit' ? 1.4 : 1.15
    const ms = ((group.to - group.from) / 60) * 1000 / speed
    v.oneShot = { role, until: this.now + Math.max(250, ms) }
    this.switchClip(v, name, false, speed, true)
  }

  private switchClip(v: CharacterView, name: string, loop: boolean, speed: number, restart = false): void {
    const model = v.model
    if (!model) return
    const next = model.animations.get(name)
    if (!next) return
    if (v.clipName === name && !restart) {
      next.speedRatio = speed
      return
    }
    if (v.clip && v.clip !== next) {
      v.fades = v.fades.filter(f => f.group !== v.clip)
      v.fades.push({ group: v.clip, from: v.clip.weight < 0 ? 1 : v.clip.weight, to: 0, t: 0 })
    }
    v.fades = v.fades.filter(f => f.group !== next)
    next.stop()
    next.start(loop, speed, next.from, next.to)
    const fadeIn = v.clip !== null && v.clip !== next
    next.weight = fadeIn ? 0 : 1
    if (fadeIn) v.fades.push({ group: next, from: 0, to: 1, t: 0 })
    v.clip = next
    v.clipName = name
  }

  private tickFades(v: CharacterView, dt: number): void {
    if (!v.fades.length) return
    for (const f of v.fades) {
      f.t = Math.min(1, f.t + dt / CROSSFADE_MS)
      f.group.weight = f.from + (f.to - f.from) * f.t
      if (f.t >= 1 && f.to === 0) f.group.stop()
    }
    v.fades = v.fades.filter(f => f.t < 1)
  }

  private animate(v: CharacterView, dt: number): void {
    const e = v.entity
    const role: AnimRole = selectAnimation({
      alive: e.alive && e.hp > 0,
      casting: !!e.casting && e.casting.castTime > 0,
      moving: v.velocity > 0.6,
      inCombat: e.inCombat,
      oneShot: v.oneShot,
      now: this.now,
    })
    if (v.oneShot && v.oneShot.until <= this.now) v.oneShot = null
    if (!v.model) return
    const isOneShot = role === 'attack' || role === 'castRelease' || role === 'shoot' || role === 'hit'
    if (!isOneShot) {
      const name = resolveClip(role, v.spec.clips, c => v.model!.animations.has(c))
      if (name) {
        const speed = role === 'move' ? Math.max(0.7, Math.min(1.6, v.velocity / 5)) : 1
        this.switchClip(v, name, role !== 'death', speed)
      }
    }
    this.tickFades(v, dt)
  }

  // --- Per-frame -------------------------------------------------------------

  updateAll(entities: Entity[], dt: number, lockedTargetId?: string | null): void {
    this.now += dt
    const seen = new Set<string>()
    for (const entity of entities) {
      const v = this.views.get(entity.id)
      if (!v) continue
      seen.add(entity.id)
      this.updateView(v, dt, lockedTargetId)
    }
    // Dead entities drop out of getAlive(): keep animating their corpses
    for (const v of this.views.values()) {
      if (seen.has(v.entity.id)) continue
      if (v.deadAt === null && !v.entity.alive) v.deadAt = this.now
      if (v.deadAt !== null) this.updateCorpse(v, dt)
    }
  }

  private updateView(v: CharacterView, dt: number, lockedTargetId?: string | null): void {
    const entity = v.entity
    v.root.setEnabled(entity.visible)
    if (!entity.visible) {
      v.lastX = entity.position.x
      v.lastY = entity.position.y
      return
    }

    // Revived (death window): clear corpse state
    if (v.deadAt !== null && entity.alive && entity.hp > 0) {
      v.deadAt = null
      this.restoreTint(v)
      v.root.setEnabled(true)
    }

    const fallY = (entity as any)._fallOffset ?? 0
    v.root.position.set(entity.position.x, -fallY, entity.position.y)

    // Velocity (m/s) from frame-to-frame displacement, lightly smoothed
    if (dt > 0) {
      const d = Math.hypot(entity.position.x - v.lastX, entity.position.y - v.lastY)
      const inst = (d / dt) * 1000
      // Teleports (>40 m/s) would read as a sprint in place; snap instead
      if (inst > 40) v.velocity = 0
      else v.velocity += (inst - v.velocity) * Math.min(1, dt / 70)
    }
    v.lastX = entity.position.x
    v.lastY = entity.position.y

    const delta = angleDelta(v.displayFacing, entity.facing)
    const maxStep = ROTATION_SPEED * (dt / 1000)
    v.displayFacing = ((v.displayFacing + Math.sign(delta) * Math.min(Math.abs(delta), maxStep)) % 360 + 360) % 360
    v.root.rotation.y = (v.displayFacing * Math.PI) / 180

    if (v.aggroFan) v.aggroFan.isVisible = !entity.inCombat
    if (v.rangeRing) {
      const isLocked = entity.id === lockedTargetId
      const mat = v.rangeRing.material as StandardMaterial
      v.rangeRing.scaling.y = isLocked ? 0.6 : 0.2
      mat.alpha = isLocked ? 0.85 : 0.35
      if (isLocked) mat.emissiveColor.set(1, 0.45, 0.2)
      else mat.emissiveColor = this.indicatorColor(entity.type).scale(0.7)
    }

    this.animate(v, dt)
    this.applyFeedback(v)
  }

  private applyFeedback(v: CharacterView): void {
    // Squash on hit (only the body, indicators stay put)
    const sq = v.squashUntil > this.now ? (v.squashUntil - this.now) / SQUASH_MS : 0
    v.body.scaling.set(1 + sq * 0.08, 1 - sq * 0.12, 1 + sq * 0.08)
    // Emissive flash
    const fl = v.flashUntil > this.now ? (v.flashUntil - this.now) / FLASH_MS : 0
    for (const [mat, base] of v.baseEmissive) {
      mat.emissiveColor.set(base.r + fl * 0.75, base.g + fl * 0.72, base.b + fl * 0.68)
    }
  }

  private updateCorpse(v: CharacterView, dt: number): void {
    this.animate(v, dt)
    this.applyFeedback(v)
    v.hitPoint.isVisible = false
    v.facingArrow.isVisible = false
    if (v.rangeRing) v.rangeRing.isVisible = false
    if (v.aggroFan) v.aggroFan.isVisible = false
    if (v.entity.type === 'player') {
      this.applyCorpseTint(v)
      return
    }
    const t = (this.now - (v.deadAt ?? this.now) - CORPSE_FADE_DELAY) / CORPSE_FADE_MS
    if (t <= 0) return
    if (t >= 1) { this.remove(v); return }
    for (const m of v.model?.meshes ?? []) m.visibility = 1 - t
    if (v.placeholder) v.placeholder.visibility = 1 - t
    v.root.position.y = -t * 0.4
  }

  private applyCorpseTint(v: CharacterView): void {
    if (v.entity.type !== 'player') return
    for (const mat of v.model?.materials ?? []) {
      if (!mat.metadata?.corpse) {
        mat.metadata = { ...(mat.metadata ?? {}), corpse: mat.diffuseColor.clone() }
        mat.diffuseColor = new Color3(0.42, 0.42, 0.45)
      }
    }
  }

  private restoreTint(v: CharacterView): void {
    for (const mat of v.model?.materials ?? []) {
      if (mat.metadata?.corpse) {
        mat.diffuseColor = mat.metadata.corpse
        delete mat.metadata.corpse
      }
    }
    v.hitPoint.isVisible = true
    v.facingArrow.isVisible = true
    if (v.rangeRing) v.rangeRing.isVisible = true
  }

  private remove(v: CharacterView): void {
    if (v.model) {
      for (const m of v.model.meshes) this.sm.removeShadowCaster(m)
      v.model.dispose()
    }
    if (v.placeholder) this.sm.removeShadowCaster(v.placeholder)
    v.root.dispose()
    this.views.delete(v.entity.id)
  }

  flashHit(entityId: string): void {
    const v = this.views.get(entityId)
    if (v) v.flashUntil = this.now + FLASH_MS
  }

  getHeight(entity: Entity): number {
    const v = this.views.get(entity.id)
    const spec = v?.spec ?? resolveModel({ type: entity.type, model: entity.model, size: entity.size })
    const scale = v?.scale ?? 1
    return spec.height * scale + (spec.hover ?? 0) + 0.2
  }

  /** Start fetching every model the encounter may need. */
  preload(modelIds: (string | undefined)[]): void {
    this.library.preload(modelIds.map(id => (id && MODELS[id] ? MODELS[id].url : null)).filter((u): u is string => !!u))
  }
}
