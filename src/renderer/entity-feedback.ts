import { Sprite, SpriteManager, Color4, Vector3, Texture, type Scene } from '@babylonjs/core'
import type { Entity } from '@/entity/entity'
import type { EventBus } from '@/core/event-bus'

interface DamageFeedback {
  target: Entity
  source?: Entity
  amount: number
  isCritical?: boolean
}
interface NumberGroup { target: Entity; sprites: Sprite[]; age: number; lane: number; critical: boolean }
interface HealthBar { background: Sprite; fill: Sprite }
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
  private serial = 0
  private orderDirty = false
  private onDamage = (event: DamageFeedback) => {
    if (!Number.isFinite(event.amount) || event.amount === 0) return
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
  update(entities: Entity[], player: Entity, mainBossId: string | null, dt: number) {
    const right = this.scene.activeCamera?.getDirection(Vector3.Right()).normalize() ?? Vector3.Right()
    const towardCamera = this.scene.activeCamera?.getDirection(Vector3.Forward()).negate() ?? Vector3.Backward()
    const injured = entities.filter(e => (e.type === 'mob' || e.type === 'boss') && e.id !== mainBossId && e.alive && e.visible && e.hp > 0 && e.hp < e.maxHp)
    const distanceSquared = (e: Entity) => (e.position.x - player.position.x) ** 2 + (e.position.y - player.position.y) ** 2
    injured.sort((a, b) => distanceSquared(a) - distanceSquared(b))
    const selected = new Set(injured.slice(0, MAX_HEALTH_BARS))
    for (const [entity, bar] of this.bars) {
      if (selected.has(entity)) continue
      this.release(bar.background); this.release(bar.fill)
      this.bars.delete(entity)
    }
    for (const entity of selected) {
      let bar = this.bars.get(entity)
      if (!bar) {
        bar = { background: this.acquire(`hp-background:${entity.id}`, 14, new Color4(0.08, 0.06, 0.05, 0.9)), fill: this.acquire(`hp-fill:${entity.id}`, 14, new Color4(0.95, 0.31, 0.18, 1)) }
        this.bars.set(entity, bar)
      }
      const width = 1.5, fill = 1.42 * Math.max(0, Math.min(1, entity.hp / entity.maxHp))
      bar.background.width = width; bar.background.height = 0.16
      bar.background.position.set(entity.position.x, this.heightFor(entity) + 0.3, entity.position.y)
      bar.fill.width = fill; bar.fill.height = 0.095
      bar.fill.position.copyFrom(bar.background.position).addInPlace(right.scale((fill - 1.42) / 2)).addInPlace(towardCamera.scale(0.01))
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
      const layer = (sprite: Sprite) => sprite.name.startsWith('hp-background:') ? 0 : sprite.name.startsWith('hp-fill:') ? 1 : 2
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
