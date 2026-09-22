import { isPointInAoeShape } from '@/skill/aoe-shape'
import type { Entity } from '@/entity/entity'
import type { Vec2 } from '@/core/types'
import { WEAPONS, type WeaponId } from './catalog'
import { distance, nearest, type WeaponContext, type Projectile, type Field, type Orb } from './types'

const INTERVAL: Record<WeaponId, number> = { fire: 950, orbit: 3500, ice: 2700, thunder: 1800, slash: 1050, holy: 1500 }
export class Weapons {
  projectiles: Projectile[] = []
  fields: Field[] = []
  orbs: Orb[] = []
  remaining: Partial<Record<WeaponId, number>> = {}
  private serial = 0
  private slashes = 0
  private orbitHits = new Map<string, number>()
  constructor(private ctx: WeaponContext) {}
  interval(id: WeaponId) { return INTERVAL[id] * (1 - this.ctx.rank('haste') * 0.08) }
  tick(dt: number) {
    const c = this.ctx
    for (const { weapon: id } of WEAPONS) {
      if (!c.rank(id)) continue
      this.remaining[id] = (this.remaining[id] ?? 0) - dt
      if (this.remaining[id]! <= 0) {
        this.remaining[id] = this.interval(id)
        this.cast(id)
      }
    }
    this.updateProjectiles(dt)
    this.updateFields(dt)
    this.updateOrbit()
  }
  private shoot(weapon: WeaponId, from: Vec2, angle: number, potency: number, target?: Entity, secondary = false) {
    if (this.projectiles.length >= 220) return
    const speed = weapon === 'holy' ? 14 : 23
    this.projectiles.push({ id: ++this.serial, x: from.x, y: from.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1800, weapon, potency, pierce: weapon === 'fire' ? 1 + this.ctx.rank('fire') : 1, hit: new Set(), target: target?.id, secondary })
  }
  private cast(id: WeaponId) {
    const c = this.ctx, p = c.player.position, level = c.rank(id)
    const enemies = c.enemies()
    const target = nearest(p, enemies, 30)
    if (!target && id !== 'orbit') return
    const potency = 1 + (level - 1) * 0.45
    const count = 1 + Math.floor(level / 3) + c.rank('multishot')
    if (id === 'fire' || id === 'holy') {
      const angle = Math.atan2(target!.position.y - p.y, target!.position.x - p.x)
      const targets = id === 'holy' ? enemies.filter(e => distance(p, e.position) < 30).sort((a, b) => distance(p, a.position) - distance(p, b.position)) : []
      for (let i = 0; i < count; i++) this.shoot(id, p, angle + (i - (count - 1) / 2) * 0.22, potency, id === 'holy' ? targets[i % targets.length] : undefined)
    } else if (id === 'ice') {
      this.fields.push({ id: ++this.serial, x: target!.position.x, y: target!.position.y, radius: (2.5 + level * 0.35) * c.area, life: 3800, tick: 0, potency: potency * 0.4 })
    } else if (id === 'thunder') {
      let from: Vec2 = p
      let next: Entity | undefined = target
      const hit = new Set<string>()
      for (let i = 0; i < 2 + level + c.rank('multishot') && next; i++) {
        hit.add(next.id)
        c.effect({ kind: 'line', from: { ...from }, to: { ...next.position }, radius: 0.1, color: '#c3a5ff' })
        c.shock(next)
        c.hit(next, potency, id)
        if (level === 5) {
          const branch = nearest(next.position, enemies.filter(e => !hit.has(e.id)), 5 * c.area)
          if (branch) {
            hit.add(branch.id)
            c.effect({ kind: 'line', from: { ...next.position }, to: { ...branch.position }, radius: 0.1, color: '#dfceff' })
            c.shock(branch)
            c.hit(branch, potency * 0.6, id, true)
          }
        }
        from = next.position
        next = nearest(from, enemies.filter(e => !hit.has(e.id)), 6 * c.area)
      }
    } else if (id === 'slash') {
      this.slashes++
      const facing = Math.atan2(target!.position.x - p.x, target!.position.y - p.y) * 180 / Math.PI
      const radius = (3.5 + level * 0.4) * c.area
      const evolved = level === 5 && this.slashes % 3 === 0
      c.effect({ kind: 'slash', from: { ...p }, radius, facing, color: ['#8ad5ff', '#ffe6a4', '#ffaacc'][this.slashes % 3]! })
      if (evolved) c.effect({ kind: 'burst', from: { ...p }, radius: radius * 1.3, color: '#ffaacc' })
      for (const e of enemies) {
        if (isPointInAoeShape(e.position, p, evolved ? { type: 'circle', radius: radius * 1.3 } : { type: 'fan', radius, angle: 150 }, facing)) c.hit(e, potency * (evolved ? 2.5 : 1.5), id)
      }
    } else if (id === 'orbit' && level === 5) {
      for (let i = 0; i < 12; i++) this.shoot('orbit', p, i * Math.PI / 6, potency * 0.7)
    }
  }
  private updateProjectiles(dt: number) {
    const c = this.ctx
    const enemies = c.enemies()
    // Newly split projectiles start moving on the next tick.
    for (const shot of [...this.projectiles]) {
      shot.life -= dt
      if (shot.target) {
        const target = enemies.find(e => e.id === shot.target && e.alive) ?? nearest(shot, enemies.filter(e => !shot.hit.has(e.id)))
        if (target) {
          shot.target = target.id
          const d = Math.max(0.001, distance(shot, target.position))
          shot.vx = (target.position.x - shot.x) / d * 14
          shot.vy = (target.position.y - shot.y) / d * 14
        }
      }
      shot.x += shot.vx * dt / 1000
      shot.y += shot.vy * dt / 1000
      for (const e of enemies) {
        if (!e.alive || shot.hit.has(e.id) || distance(shot, e.position) > e.size + 0.45) continue
        shot.hit.add(e.id)
        c.hit(e, shot.potency, shot.weapon, shot.secondary)
        if (shot.weapon === 'fire' && c.rank('fire') === 5) {
          c.effect({ kind: 'burst', from: { ...shot }, radius: 2.2 * c.area, color: '#ff884e' })
          for (const splash of enemies) if (splash.alive && splash !== e && distance(splash.position, shot) < 2.2 * c.area) c.hit(splash, shot.potency * 0.55, 'fire', true)
        }
        if (shot.weapon === 'holy' && c.rank('holy') === 5 && !shot.secondary) {
          for (const t of enemies.filter(t => t.alive && t !== e).sort((a, b) => distance(a.position, shot) - distance(b.position, shot)).slice(0, 2)) {
            this.shoot('holy', shot, Math.atan2(t.position.y - shot.y, t.position.x - shot.x), shot.potency * 0.6, t, true)
          }
        }
        shot.pierce--
        if (shot.pierce <= 0) { shot.life = 0; break }
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0)
  }
  private updateFields(dt: number) {
    for (const field of this.fields) {
      field.life -= dt
      field.tick -= dt
      if (field.tick > 0) continue
      field.tick += 450
      for (const enemy of this.ctx.enemies()) {
        if (distance(field, enemy.position) > field.radius) continue
        this.ctx.freeze(enemy)
        this.ctx.hit(enemy, field.potency, 'ice')
      }
    }
    this.fields = this.fields.filter(f => f.life > 0)
  }
  private updateOrbit() {
    const c = this.ctx, level = c.rank('orbit')
    this.orbs = []
    if (!level) return
    const count = 2 + level + c.rank('multishot')
    for (let ring = 0; ring < (level === 5 ? 2 : 1); ring++) {
      const radius = (2.8 + ring * 1.7) * c.area
      for (let i = 0; i < count; i++) {
        const angle = c.elapsed / 650 * (ring ? -1 : 1) + i / count * Math.PI * 2
        this.orbs.push({ id: ring * count + i, x: c.player.position.x + Math.cos(angle) * radius, y: c.player.position.y + Math.sin(angle) * radius, radius })
      }
    }
    for (const e of c.enemies()) {
      if ((this.orbitHits.get(e.id) ?? 0) > c.elapsed) continue
      if (this.orbs.some(orb => distance(orb, e.position) < e.size + 0.6)) {
        this.orbitHits.set(e.id, c.elapsed + 400)
        c.hit(e, 0.65 + level * 0.25, 'orbit')
      }
    }
    for (const [id, time] of this.orbitHits) if (time < c.elapsed) this.orbitHits.delete(id)
  }
}
