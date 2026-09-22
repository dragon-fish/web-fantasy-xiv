import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { Entity } from '@/entity/entity'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import type { CombatResolver } from '@/game/combat-resolver'
import type { DisplacementAnimator } from '@/game/displacement-animator'
import type { BuffDef } from '@/core/types'
import { Progression } from './progression'
import { Dash } from './dash'
import { Weapons } from './weapons'
import { CARDS, type WeaponId } from './catalog'
import { distance, nearest, type Effect, type Gem } from './types'

export interface SurvivorDeps {
  bus: EventBus; entityMgr: EntityManager; buffSystem: BuffSystem; arena: Arena
  combatResolver: CombatResolver; displacer: DisplacementAnimator; player: Entity
}
const FROST: BuffDef = { id: 'sv_frost', name: '冰结', type: 'debuff', duration: 1000, durationGrace: 0, stackable: false, maxStacks: 1, effects: [{ type: 'speed_modify', value: -0.55 }] }
const SHOCK: BuffDef = { id: 'sv_shock', name: '感电', type: 'debuff', duration: 4000, stackable: false, maxStacks: 1, effects: [] }
const FIRE: BuffDef = { id: 'sv_fire', name: '火种', type: 'debuff', duration: 4000, stackable: false, maxStacks: 1, effects: [] }
export const RUN_DURATION = 480000

export class SurvivorRuntime {
  readonly progression: Progression
  readonly dash: Dash
  readonly weapons: Weapons
  elapsed = 0
  kills = 0
  result: 'victory' | 'wipe' | null = null
  gems: Gem[] = []
  private spawnTimer = 0
  private nextElite = 60000
  private serial = 0
  private gemSerial = 0
  constructor(readonly deps: SurvivorDeps, private random: () => number = Math.random) {
    this.progression = new Progression(random)
    this.dash = new Dash(deps.player, deps.buffSystem, deps.displacer)
    this.weapons = new Weapons(this)
    deps.player.inCombat = true
  }
  get player() { return this.deps.player }
  get area() { return 1 + this.rank('area') * 0.15 }
  rank(id: string) { return this.progression.rank(id) }
  enemies() { return this.deps.entityMgr.getAlive().filter(e => e.type === 'mob' || e.type === 'boss') }
  effect(effect: Effect) { this.deps.bus.emit('survivor:effect', effect) }
  freeze(target: Entity) { this.deps.buffSystem.applyBuff(target, FROST, this.player.id) }
  shock(target: Entity) { this.deps.buffSystem.applyBuff(target, SHOCK, this.player.id) }
  choose(id: string) {
    if (this.result) return
    const card = this.progression.choose(id)
    if (card.buff) {
      // Shared effects have distinct stacking rules; these four read one total value.
      const effects = card.buff.effects.map(effect =>
        effect.type === 'damage_increase' || effect.type === 'lifesteal' || effect.type === 'speed_modify' || effect.type === 'haste'
          ? { ...effect, value: effect.value * this.rank(id) } : effect)
      this.deps.buffSystem.applyBuff(this.player, { ...card.buff, effects }, this.player.id)
    }
    if (id === 'vitality') this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.2)
    this.dash.configure(1 + this.rank('dashStock'), 12000 - this.rank('dashHaste') * 2000)
  }
  useDash() {
    if (this.result || this.progression.pending) return false
    const from = { ...this.player.position }
    if (!this.dash.use()) return false
    const rad = this.player.facing * Math.PI / 180
    this.effect({ kind: 'dash', from, to: { x: from.x + Math.sin(rad) * 6, y: from.y + Math.cos(rad) * 6 }, radius: 1, color: '#b6ffee' })
    return true
  }
  tick(dt: number) {
    if (this.result) return
    if (this.player.hp <= 0) { this.finish('wipe'); return }
    if (this.progression.pending) return
    this.elapsed += dt
    if (this.elapsed >= RUN_DURATION) { this.finish('victory'); return }
    this.dash.tick(dt)
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer += Math.max(160, 850 - this.elapsed / 750)
      for (let i = 0; i < 1 + Math.floor(this.elapsed / 90000); i++) {
        if (this.enemies().length < 320) this.spawn(false)
      }
    }
    if (this.elapsed >= this.nextElite) { this.spawn(true); this.nextElite += 60000 }
    for (const enemy of this.enemies()) {
      const d = distance(enemy.position, this.player.position)
      if (d > 0.7) {
        const move = Math.min(d, enemy.speed * (1 + this.deps.buffSystem.getSpeedModifier(enemy)) * dt / 1000)
        const dx = (this.player.position.x - enemy.position.x) / d, dy = (this.player.position.y - enemy.position.y) / d
        enemy.position.x += dx * move
        enemy.position.y += dy * move
        enemy.facing = Math.atan2(dx, dy) * 180 / Math.PI
      }
      if (d < enemy.size + 0.6 && (enemy.customData.contactAt ?? 0) <= this.elapsed) {
        enemy.customData.contactAt = this.elapsed + 850
        this.deps.combatResolver.applyDamage(enemy, this.player, 1, '魔物袭击', ['physical'])
        if (this.player.hp <= 0) { this.finish('wipe'); return }
      }
    }
    this.weapons.tick(dt)
    const pickup = 3 + this.rank('stride') * 1.5
    this.gems = this.gems.filter(gem => {
      const d = distance(gem, this.player.position)
      if (d < 1) { this.progression.gainXp(gem.value); return false }
      if (d < pickup) {
        const step = Math.min(d, dt / 1000 * 18)
        gem.x += (this.player.position.x - gem.x) / d * step
        gem.y += (this.player.position.y - gem.y) / d * step
      }
      return true
    })
  }
  hit(target: Entity, potency: number, weapon: WeaponId, secondary = false) {
    if (!target.alive || this.result) return
    const { buffSystem: buffs, combatResolver: combat, entityMgr } = this.deps
    if (!secondary && this.rank('combustion')) buffs.applyBuff(target, FIRE, this.player.id)
    const frozen = buffs.hasBuff(target, FROST.id), shocked = buffs.hasBuff(target, SHOCK.id)
    const extra = [frozen ? this.rank('shatter') * 0.25 : 0, this.random() < this.rank('critical') * 0.12 ? 0.75 : 0]
    combat.applyDamage(this.player, target, potency, CARDS.find(c => c.id === weapon)!.name, ['magical'], extra)
    if (target.hp <= 0) {
      const center = { ...target.position }
      const burning = buffs.hasBuff(target, FIRE.id)
      entityMgr.destroy(target.id)
      this.kills++
      this.gems.push({ id: ++this.gemSerial, x: center.x, y: center.y, value: target.type === 'boss' ? 35 : 3 })
      // Merge old pickups without losing earned experience or growing scene memory forever.
      if (this.gems.length > 450) {
        const old = this.gems.shift()!
        const closest = this.gems.reduce((a, b) => distance(a, old) < distance(b, old) ? a : b)
        closest.value += old.value
      }
      if (target.type === 'boss') this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * 0.3)
      if (secondary) return
      if (burning) {
        this.effect({ kind: 'burst', from: center, radius: 2.5 * this.area, color: '#ff884e' })
        for (const e of this.enemies()) if (distance(center, e.position) < 2.5 * this.area) this.hit(e, this.rank('combustion') * 0.8, 'fire', true)
      }
      if (frozen && this.rank('ice') === 5) {
        this.effect({ kind: 'burst', from: center, radius: 4 * this.area, color: '#8ad5ff' })
        for (const e of this.enemies()) if (distance(center, e.position) < 4 * this.area) { this.freeze(e); this.hit(e, 1.2, 'ice', true) }
      }
      if (shocked && this.rank('thunder') === 5) this.arc(center, 1.8)
    } else if (!secondary && shocked && this.random() < this.rank('conduction') * 0.2) {
      this.arc(target.position, 0.8, target.id)
    }
  }
  private arc(from: { x: number; y: number }, potency: number, exclude?: string) {
    const next = nearest(from, this.enemies().filter(e => e.id !== exclude), 7 * this.area)
    if (!next) return
    this.effect({ kind: 'line', from: { ...from }, to: { ...next.position }, radius: 0.1, color: '#c3a5ff' })
    this.hit(next, potency, 'thunder', true)
  }
  private spawn(elite: boolean) {
    const angle = this.random() * Math.PI * 2
    const p = this.player.position
    let point = this.deps.arena.clampPosition({ x: p.x + Math.cos(angle) * 23, y: p.y + Math.sin(angle) * 23 })
    // Clamping an outward spawn at a corner must not place it on the player.
    if (distance(point, p) < 12) point = this.deps.arena.clampPosition({ x: p.x - Math.cos(angle) * 23, y: p.y - Math.sin(angle) * 23 })
    const minute = this.elapsed / 60000
    const kind = elite ? 'elite' : this.serial % 7 === 0 ? 'golem' : this.serial % 3 === 0 ? 'bat' : 'imp'
    const hp = (35 + minute * 22) * (elite ? 16 : kind === 'golem' ? 3 : 1)
    this.deps.entityMgr.create({ id: `sv_enemy_${++this.serial}`, type: elite ? 'boss' : 'mob', group: kind, position: { ...point, z: 0 }, hp, attack: (14 + minute * 4) * (elite ? 2 : 1), speed: kind === 'bat' ? 4.1 : kind === 'golem' ? 1.8 : 2.5 + minute * 0.12, size: elite ? 1.1 : kind === 'golem' ? 0.8 : 0.45 })
  }
  private finish(result: 'victory' | 'wipe') {
    this.result = result
    if (result === 'wipe') this.player.alive = false
    this.deps.bus.emit('combat:ended', { result, elapsed: this.elapsed })
  }
}
