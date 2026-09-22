import { Sprite, SpriteManager, Color4, Vector3, Texture, type Scene } from '@babylonjs/core'
import type { Entity } from '@/entity/entity'
import { HealthBarMotion, type HealthBarSnapshot } from './health-bar-motion'
import type { EventBus } from '@/core/event-bus'

interface DamageFeedback {
  target: Entity
  source?: Entity
  amount: number
  isCritical?: boolean
}
interface NumberGroup { target: Entity; sprites: Sprite[]; age: number; lane: number; critical: boolean }
interface HealthBar { background: Sprite; trail: Sprite; fill: Sprite; heal: Sprite; edge: Sprite; castBackground: Sprite; castFill: Sprite }
export interface EntityCast { elapsed: number; total: number }
const GLYPHS = '0123456789+!无效'
const MAX_NUMBERS = 80
const MAX_HEALTH_BARS = 24
const LIFETIME = 1000
const COLORS = {
  outgoing: new Color4(1, 0.64, 0.2, 1), incoming: new Color4(1, 0.22, 0.22, 1),
  heal: new Color4(0.35, 1, 0.48, 1), neutral: new Color4(0.8, 0.8, 0.8, 1),
}

/** Shared world-space billboards; one glyph atlas and bounded reusable sprite pool. */
export class EntityFeedback {
  private manager: SpriteManager
  private numbers: NumberGroup[] = []
  private bars = new Map<Entity, HealthBar>()
  private pool: Sprite[] = []
  private health = new WeakMap<Entity, HealthBarMotion>()
  private serial = 0
  private orderDirty = false
  private onDamage = (event: DamageFeedback) => {
    if (!Number.isFinite(event.amount) || event.amount === 0) return
    if (!this.health.has(event.target)) this.health.set(event.target, new HealthBarMotion(Math.min(event.target.maxHp, event.target.hp + event.amount), event.target.maxHp))
    this.health.get(event.target)!.update(event.target.hp, event.target.maxHp, 0)
    const heal = event.amount < 0
    const critical = !heal && !!event.isCritical
    const color = heal ? COLORS.heal : event.target.type === 'player' ? COLORS.incoming
      : event.source?.type === 'player' ? COLORS.outgoing : COLORS.neutral
    const text = `${heal ? '+' : ''}${Math.round(Math.abs(event.amount))}${critical ? '!' : ''}`
    this.addNumber(event.target, text, color, critical)
  }
  private onInvulnerable = ({ target }: { target: Entity }) => this.addNumber(target, '无效', COLORS.neutral, false)
  constructor(
    private scene: Scene,
    private bus: EventBus,
    private heightFor: (entity: Entity) => number = e => e.type === 'boss' ? 3 : 1.8,
  ) {
    this.manager = new SpriteManager('entity-feedback', new URL('./combat-glyphs.svg', import.meta.url).href, 4096, 64, scene, 0.001, Texture.BILINEAR_SAMPLINGMODE)
    this.manager.texture.hasAlpha = true
    this.manager.renderingGroupId = 2
    this.manager.disableDepthWrite = true
    this.manager.isPickable = false
    bus.on('damage:dealt', this.onDamage)
    bus.on('damage:invulnerable', this.onInvulnerable)
  }
  private acquire(name: string, cell: number, color: Color4) {
    const sprite = this.pool.pop() ?? new Sprite(name, this.manager)
    sprite.name = name
    sprite.cellIndex = cell
    sprite.color.copyFrom(color)
    sprite.isVisible = true
    sprite.isPickable = false
    this.orderDirty = true
    return sprite
  }
  private release(sprite: Sprite) { sprite.isVisible = false; this.pool.push(sprite) }
  private addNumber(target: Entity, text: string, color: Color4, critical: boolean) {
    if (this.numbers.length >= MAX_NUMBERS) {
      for (const sprite of this.numbers.shift()!.sprites) this.release(sprite)
    }
    const id = ++this.serial
    const sprites = [...text].map(char => this.acquire(`combat-number:${id}`, GLYPHS.indexOf(char), color))
    this.numbers.push({ target, sprites, age: 0, lane: id % 3 - 1, critical })
  }
  private motion(entity: Entity) {
    let motion = this.health.get(entity)
    if (!motion) { motion = new HealthBarMotion(entity.hp, entity.maxHp); this.health.set(entity, motion) }
    return motion
  }
  healthState(entity: Entity): HealthBarSnapshot {
    const motion = this.motion(entity)
    motion.update(entity.hp, entity.maxHp, 0)
    return motion.snapshot
  }
  update(entities: Entity[], player: Entity, mainBossId: string | null, dt: number, bossCast: EntityCast | null = null) {
    for (const entity of entities) this.motion(entity).update(entity.hp, entity.maxHp, dt)
    const right = this.scene.activeCamera?.getDirection(Vector3.Right()).normalize() ?? Vector3.Right()
    const towardCamera = this.scene.activeCamera?.getDirection(Vector3.Forward()).negate() ?? Vector3.Backward()
    const injured = entities.filter(e => (e.type === 'mob' || e.type === 'boss') && e.id !== mainBossId && e.alive && e.visible && e.hp > 0 && e.hp < e.maxHp)
    const distanceSquared = (e: Entity) => (e.position.x - player.position.x) ** 2 + (e.position.y - player.position.y) ** 2
    injured.sort((a, b) => distanceSquared(a) - distanceSquared(b))
    const selected = new Set(injured.slice(0, MAX_HEALTH_BARS))
    const boss = entities.find(e => e.id === mainBossId && e.alive && e.visible && e.hp > 0)
    if (boss) selected.add(boss)
    for (const [entity, bar] of this.bars) {
      if (selected.has(entity)) continue
      for (const sprite of Object.values(bar)) this.release(sprite)
      this.bars.delete(entity)
    }
    for (const entity of selected) {
      let bar = this.bars.get(entity)
      if (!bar) {
        bar = {
          background: this.acquire(`hp-background:${entity.id}`, 14, new Color4(0.08, 0.06, 0.05, 0.9)),
          trail: this.acquire(`hp-trail:${entity.id}`, 14, new Color4(0.36, 0.12, 0.11, 1)),
          fill: this.acquire(`hp-fill:${entity.id}`, 14, new Color4(0.95, 0.31, 0.18, 1)),
          heal: this.acquire(`hp-heal:${entity.id}`, 14, new Color4(0.55, 1, 0.65, 1)),
          edge: this.acquire(`hp-edge:${entity.id}`, 14, new Color4(1, 0.8, 0.45, 1)),
          castBackground: this.acquire(`cast-background:${entity.id}`, 14, new Color4(0.08, 0.06, 0.05, 0.9)),
          castFill: this.acquire(`cast-fill:${entity.id}`, 14, new Color4(1, 0.69, 0.2, 1)),
        }
        this.bars.set(entity, bar)
      }
      const motion = this.healthState(entity)
      const width = entity.type === 'boss' ? 2.6 : 1.5
      const inner = width - 0.08
      const pct = Math.max(0, Math.min(1, entity.hp / entity.maxHp))
      bar.background.width = width; bar.background.height = 0.16
      bar.background.position.set(entity.position.x, this.heightFor(entity) + 0.3, entity.position.y)
      bar.background.position.addInPlace(right.scale(motion.shake * 0.045))
      const segment = (sprite: Sprite, start: number, end: number, height = 0.095, vertical = 0) => {
        sprite.isVisible = end > start
        sprite.width = Math.max(0, end - start) * inner; sprite.height = height
        sprite.position.copyFrom(bar.background.position).addInPlace(right.scale(((start + end) / 2 - 0.5) * inner)).addInPlace(towardCamera.scale(0.01))
        sprite.position.y += vertical
      }
      segment(bar.trail, pct, motion.damageEnd)
      segment(bar.fill, 0, pct)
      segment(bar.heal, motion.healStart, pct)
      segment(bar.edge, Math.max(0, pct - 0.015), Math.min(1, pct + 0.015), 0.21)
      bar.edge.color.copyFrom(motion.kind === 'heal' ? COLORS.heal : COLORS.outgoing)
      bar.edge.color.a = motion.pulse
      bar.edge.isVisible = motion.pulse > 0
      const cast = entity.id === mainBossId && bossCast ? bossCast
        : entity.casting ? { elapsed: entity.casting.elapsed, total: entity.casting.castTime } : null
      const casting = entity.type === 'boss' && cast && cast.total > 0
      segment(bar.castBackground, 0, casting ? 1 : 0, 0.12, -0.25)
      segment(bar.castFill, 0, casting ? Math.min(1, cast.elapsed / cast.total) : 0, 0.07, -0.25)
    }
    for (const group of this.numbers) {
      group.age += dt
      if (group.age >= LIFETIME) { for (const sprite of group.sprites) this.release(sprite); continue }
      const size = group.critical ? 1.15 : 0.95
      const step = size * 0.52
      for (let i = 0; i < group.sprites.length; i++) {
        const sprite = group.sprites[i]!
        sprite.width = size; sprite.height = size
        sprite.color.a = Math.min(1, (LIFETIME - group.age) / 350)
        sprite.isVisible = group.target.visible
        const offset = (i - (group.sprites.length - 1) / 2) * step + group.lane * 1.15
        sprite.position.set(group.target.position.x, this.heightFor(group.target) + 0.7 + group.age / 850 + (group.lane + 1) * 0.2, group.target.position.y)
        sprite.position.addInPlace(right.scale(offset))
      }
    }
    this.numbers = this.numbers.filter(group => group.age < LIFETIME)
    if (this.orderDirty) {
      // Sprite draw order must survive pool reuse: backgrounds, fills, then text.
      const layer = (sprite: Sprite) => sprite.name.startsWith('hp-background:') || sprite.name.startsWith('cast-background:') ? 0 : sprite.name.startsWith('hp-trail:') ? 1 : sprite.name.startsWith('hp-fill:') || sprite.name.startsWith('cast-fill:') ? 2 : sprite.name.startsWith('hp-heal:') || sprite.name.startsWith('hp-edge:') ? 3 : 4
      this.manager.sprites.sort((a, b) => layer(a) - layer(b))
      this.orderDirty = false
    }
  }
  dispose() {
    this.bus.off('damage:dealt', this.onDamage)
    this.bus.off('damage:invulnerable', this.onInvulnerable)
    this.numbers = []
    this.bars.clear()
    this.pool = []
    this.manager.dispose()
  }
}
