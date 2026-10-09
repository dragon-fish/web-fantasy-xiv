// src/game/party/npc-brain.ts
// One NPC ally: dodge first, then role duties, then damage (see docs/superpowers/specs/2026-10-09-npc-party-design.md).
import type { Vec2 } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { EntityManager } from '@/entity/entity-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { ActiveAoeZone, AoeZoneManager } from '@/skill/aoe-zone'
import type { EnmitySystem } from '@/combat/enmity'
import type { Arena } from '@/arena/arena'
import type { DisplacementAnimator } from '../displacement-animator'
import { rangeTo } from '@/skill/skill-resolver'
import { isHostile, isPartyMember } from '@/combat/party'
import { findSafeSpot, inHazard, isSafe, pathIsSafe, type Ground } from './npc-nav'
import { NPC_RAISE_COOLDOWN_MS, type NpcKit } from './npc-kits'
import type { PartyConfig } from './party-config'

/** NPCs think this often (ms); movement runs every tick */
export const THINK_MS = 150
const REACTION_MS: [number, number] = [300, 900]
const LATE_REACTION_MS: [number, number] = [1500, 2500]
/** Tank mitigation goes up this long before a tankbuster lands */
const BUSTER_LEAD_MS: [number, number] = [1000, 3000]
const LOW_HP_MIT = 0.25
const TANK_HEAL_BELOW = 0.85
const SINGLE_HEAL_BELOW = 0.75
const AOE_HEAL_BELOW = 0.85
const ARRIVED = 0.4

export interface NpcWorld {
  now(): number
  entities: EntityManager
  skills: SkillResolver
  buffs: BuffSystem
  zones: AoeZoneManager
  enmity: EnmitySystem
  arena: Arena
  displacer: DisplacementAnimator
  ground: Ground
  config: PartyConfig
  player: Entity
  boss: Entity
  /** Boss chase range (it walks until its target is this close) */
  bossChaseRange: number
  priority(e: Entity): number
  /** Mechanic spot for this NPC, already past its reaction delay; null = none */
  spotFor(npc: Entity): Vec2 | null
  /** Formation slot (0, 1, 2) among the NPCs */
  slot(npc: Entity): number
  rng(): number
}

export type HealerAction =
  | { kind: 'heal'; target: Entity }
  | { kind: 'aoe_heal' }
  | { kind: 'prepare' }
  | { kind: 'raise'; target: Entity }
  | null

/**
 * Healer duty, highest first: heal the tank > party heal > raidwide prep > single-heal whoever is low > raise.
 * `prepare` = a raidwide is coming and has not been answered yet.
 */
export function chooseHealerAction(party: Entity[], raidwideComing: boolean, canRaise: boolean, player: Entity): HealerAction {
  const ratio = (e: Entity) => e.hp / Math.max(1, e.maxHp)
  const alive = party.filter(e => e.alive)
  const tank = alive.find(e => e.role === 'tank' && ratio(e) < TANK_HEAL_BELOW)
  if (tank) return { kind: 'heal', target: tank }
  if (alive.filter(e => ratio(e) < AOE_HEAL_BELOW).length >= 2) return { kind: 'aoe_heal' }
  if (raidwideComing) return { kind: 'prepare' }
  const low = alive.filter(e => ratio(e) < SINGLE_HEAL_BELOW).sort((a, b) => ratio(a) - ratio(b))[0]
  if (low) return { kind: 'heal', target: low }
  if (canRaise) {
    const fallen = party.filter(e => !e.alive)
    const order = (e: Entity) => (e.role === 'tank' ? 0 : e.id === player.id ? 1 : 2)
    const next = fallen.sort((a, b) => order(a) - order(b))[0]
    if (next) return { kind: 'raise', target: next }
  }
  return null
}

const between = (rng: () => number, [lo, hi]: [number, number]) => lo + rng() * (hi - lo)
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
const pos = (e: Entity): Vec2 => ({ x: e.position.x, y: e.position.y })
const dirOf = (deg: number): Vec2 => ({ x: Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) })

function damageEffects(z: ActiveAoeZone) {
  return z.def.effects.filter(e => e.type === 'damage') as Extract<ActiveAoeZone['def']['effects'][number], { type: 'damage' }>[]
}

function isBuster(effects: { type: string; dmgType?: unknown }[]): boolean {
  return effects.some(e => e.type === 'damage' && (Array.isArray(e.dmgType) ? e.dmgType.includes('tankbuster') : e.dmgType === 'tankbuster'))
}

export class NpcBrain {
  dest: Vec2 | null = null
  private thinkAcc = 0
  /** zone id → when this NPC has registered it */
  private seen = new Map<string, number>()
  /** Raidwides already answered (healer) */
  private prepared = new Set<string>()
  /** Tankbusters → lead time for mitigation (tank) */
  private busterLead = new Map<string, number>()
  private dodge: { key: string; spot: Vec2 } | null = null
  /** Free mode's chosen fighting spot, kept while it stays good */
  private fight: Vec2 | null = null
  /** Where this NPC stands relative to a stack carrier (fixed per stack) */
  private stackOffset: { zoneId: string; x: number; y: number } | null = null
  private raiseReadyAt = 0

  constructor(readonly entity: Entity, readonly kit: NpcKit, private world: NpcWorld) {}

  update(dt: number): void {
    this.thinkAcc += dt
    if (this.thinkAcc >= THINK_MS) {
      this.thinkAcc = 0
      this.think()
    }
    this.move(dt)
  }

  // --- Perception ----------------------------------------------------------

  /** Pending enemy AOEs this NPC has noticed (timeline-driven, not telegraph-driven) */
  private threats(now: number): ActiveAoeZone[] {
    const w = this.world
    const out: ActiveAoeZone[] = []
    const live = new Set<string>()
    for (const z of w.zones.getActiveZones()) {
      if (z.resolved) continue
      const caster = z.casterId ? w.entities.get(z.casterId) : null
      if (!caster || !isHostile(caster, this.entity)) continue
      live.add(z.id)
      if (!this.seen.has(z.id)) {
        const late = w.rng() < w.config.mistakeRate
        this.seen.set(z.id, now + between(w.rng, REACTION_MS) + (late ? between(w.rng, LATE_REACTION_MS) : 0))
      }
      if (now >= this.seen.get(z.id)!) out.push(z)
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id)
    return out
  }

  /** AOEs worth walking out of: not raidwides, not markers riding on party members */
  private dodgeable(zones: ActiveAoeZone[]): ActiveAoeZone[] {
    return zones.filter((z) => {
      if (z.def.telegraph === false) return false
      const anchored = z.anchorEntityId ? this.world.entities.get(z.anchorEntityId) : null
      return !(anchored && isPartyMember(anchored) && z.def.anchor.type !== 'target')
    })
  }

  // --- Decisions -----------------------------------------------------------

  private think(): void {
    const e = this.entity
    const w = this.world
    if (!e.alive) { this.dest = null; return }
    const now = w.now()
    const threats = this.threats(now)
    const hazards = this.dodgeable(threats)
    const target = this.pickTarget()
    if (target) e.target = target.id
    this.dest = this.chooseDestination(target, hazards, threats)
    const moving = dist(pos(e), this.dest) > ARRIVED

    // Casters and healers get to safety first, then cast again from there (even with the AOE still pending)
    if (e.casting && moving) w.skills.interruptCast(e)
    if (moving) this.travelSkills(target, hazards)

    if (this.kit.mitigation) this.tankDuty(threats, now)
    if (this.kit.style === 'healer' && this.healerDuty(threats, moving, now)) return
    if (target) this.attack(target, moving)
  }

  /** Highest-priority attackable enemy (nearest among equals); the NPC tank sticks to the boss */
  private pickTarget(): Entity | null {
    const w = this.world
    const e = this.entity
    const attackable = (t: Entity) => t.alive && t.visible && t.targetable && !t.dormant && isHostile(e, t)
    if (this.kit.style === 'tank' && attackable(w.boss)) return w.boss
    // Among equals: nearest; a tank first goes for whatever is not on it yet
    const score = (t: Entity) => dist(pos(e), pos(t)) + (this.kit.style === 'tank' && t.target === e.id ? 100 : 0)
    let best: Entity | null = null
    for (const t of w.entities.getAll()) {
      if (!attackable(t)) continue
      if (!best || w.priority(t) > w.priority(best)
        || (w.priority(t) === w.priority(best) && score(t) < score(best))) best = t
    }
    return best
  }

  /**
   * Movement state: a mechanic spot wins; with nothing to attack, the idle formation; the tank holds
   * the boss at the tank spot; everyone else is in free mode (`fightSpot`).
   */
  private chooseDestination(target: Entity | null, hazards: ActiveAoeZone[], threats: ActiveAoeZone[]): Vec2 {
    const w = this.world
    const e = this.entity
    const stack = this.stackToJoin(threats)
    if (stack) { this.dodge = null; this.fight = null; return stack }
    const spot = w.spotFor(e)
    if (spot) { this.dodge = null; this.fight = null; return spot }
    if (target && this.kit.style !== 'tank') { this.dodge = null; return this.fightSpot(target, hazards) }
    this.fight = null
    const preferred = this.preferredPosition(target)
    const here = pos(e)
    if (hazards.length === 0) {
      this.dodge = null
      // Close enough already: don't chase every small drift of the boss
      return dist(here, preferred) < 1.2 ? here : preferred
    }
    if (isSafe(here, hazards, w.ground) && dist(here, preferred) < 1.2) return here
    const key = hazards.map(z => z.id).sort().join(',')
    if (this.dodge?.key !== key || !isSafe(this.dodge.spot, hazards, w.ground)) {
      this.dodge = { key, spot: findSafeSpot(here, preferred, hazards, w.ground, w.rng) }
    }
    return this.dodge.spot
  }

  /**
   * A stack marker riding on someone else: stay inside its circle, following that member, whatever
   * the preset spots say (the marked member decides where the stack happens). Null when there is
   * none, or it is on this NPC (then it heads for its own spot and the others come along).
   */
  private stackToJoin(threats: ActiveAoeZone[]): Vec2 | null {
    const w = this.world
    const e = this.entity
    const zone = threats.find(z => z.def.share && z.anchorEntityId && z.def.anchor.type === 'party')
    if (!zone || zone.anchorEntityId === e.id) return null
    const carrier = w.entities.get(zone.anchorEntityId!)
    if (!carrier?.alive) return null
    const radius = zone.def.shape.type === 'circle' ? zone.def.shape.radius : 2
    // Anywhere inside the circle will do (with a little margin): no need to stand on the carrier
    if (dist(pos(e), pos(carrier)) <= Math.max(0.5, radius - 1)) return pos(e)
    if (this.stackOffset?.zoneId !== zone.id) {
      const a = w.rng() * Math.PI * 2
      const r = w.rng() * Math.min(1.5, radius * 0.4)
      this.stackOffset = { zoneId: zone.id, x: Math.sin(a) * r, y: Math.cos(a) * r }
    }
    return { x: carrier.position.x + this.stackOffset.x, y: carrier.position.y + this.stackOffset.y }
  }

  /**
   * Free mode: keep hitting the target from wherever is fine. Stay while in range, safe and out of
   * the boss's front; otherwise take the closest such point (a short walk beats a nice angle).
   */
  private fightSpot(target: Entity, hazards: ActiveAoeZone[]): Vec2 {
    const w = this.world
    const e = this.entity
    const here = pos(e)
    const reach = this.kit.range - 0.3
    const inRange = (p: Vec2) => dist(p, pos(target)) - target.size <= reach
    // The boss's front belongs to whoever it faces (cleaves); adds aren't worth walking around
    const front = (p: Vec2) => {
      if (target !== w.boss || target.target === e.id) return false
      const bearing = ((Math.atan2(p.x - target.position.x, p.y - target.position.y) * 180) / Math.PI + 360) % 360
      return Math.abs(((bearing - target.facing + 540) % 360) - 180) < 60
    }
    const good = (p: Vec2) => inRange(p) && isSafe(p, hazards, w.ground) && !front(p)
    if (good(here)) { this.fight = null; return here }
    if (this.fight && good(this.fight)) return this.fight
    const melee = this.kit.style === 'melee'
    const radii = melee ? [1, 2] : [6, 10, 14, 18].filter(r => r <= reach)
    let best: Vec2 | null = null
    let bestCost = Infinity
    for (const r of radii) {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI * 2) / 24
        const c = { x: target.position.x + Math.sin(a) * (target.size + r), y: target.position.y + Math.cos(a) * (target.size + r) }
        if (!inRange(c) || !isSafe(c, hazards, w.ground)) continue
        const cost = dist(here, c) + (front(c) ? 8 : 0) + w.rng() * 0.5
        if (cost < bestCost) { bestCost = cost; best = c }
      }
    }
    this.fight = best ?? findSafeSpot(here, here, hazards, w.ground, w.rng)
    return this.fight
  }

  /** Idle formation, or (tank) where to hold the target */
  private preferredPosition(target: Entity | null): Vec2 {
    const w = this.world
    const e = this.entity
    const slot = w.slot(e)
    if (!target) {
      const a = ((slot - 1) * 50 + 180) * Math.PI / 180
      return { x: w.config.idle.x + Math.sin(a) * 2.5, y: w.config.idle.y + Math.cos(a) * 2.5 }
    }
    // Pull the boss to the tank spot only once it is on this tank; until then go and get it
    if (target === w.boss && target.target === e.id) {
      const face = dirOf(w.config.tankSpot.facing)
      const anchor = w.boss.speed > 0 ? w.config.tankSpot : pos(w.boss)
      const reach = w.boss.speed > 0 ? Math.max(w.boss.size + 1, w.bossChaseRange - 0.3) : w.boss.size + 1.5
      return { x: anchor.x + face.x * reach, y: anchor.y + face.y * reach }
    }
    const away = { x: e.position.x - target.position.x, y: e.position.y - target.position.y }
    const len = Math.hypot(away.x, away.y) || 1
    return { x: target.position.x + (away.x / len) * (target.size + 1.5), y: target.position.y + (away.y / len) * (target.size + 1.5) }
  }

  /** Melee close in with a dash after dodging; anyone may backstep away from danger */
  private travelSkills(target: Entity | null, hazards: ActiveAoeZone[]): void {
    const w = this.world
    const e = this.entity
    const dest = this.dest!
    const here = pos(e)
    const melee = this.kit.style === 'melee' || this.kit.style === 'tank'
    if (melee && target && !w.spotFor(e) && rangeTo(e, target) > this.kit.range + 3 && w.skills.getCharges(e.id, this.kit.dash) > 0) {
      const toward = { x: target.position.x - here.x, y: target.position.y - here.y }
      const len = Math.hypot(toward.x, toward.y) || 1
      const landing = { x: target.position.x - (toward.x / len) * Math.max(0, target.size - 0.1), y: target.position.y - (toward.y / len) * Math.max(0, target.size - 0.1) }
      if (dist(landing, dest) < 3 && pathIsSafe(here, landing, hazards, w.ground) && isSafe(landing, hazards, w.ground)) {
        w.skills.tryUse(e, this.kit.dash)
        return
      }
    }
    // Backstep only to get out of an AOE the NPC is standing in
    if (target && inHazard(here, hazards) && dist(here, dest) > 5 && w.skills.getCharges(e.id, this.kit.backstep) > 0) {
      const away = { x: here.x - target.position.x, y: here.y - target.position.y }
      const len = Math.hypot(away.x, away.y) || 1
      const toDest = { x: dest.x - here.x, y: dest.y - here.y }
      const along = (away.x * toDest.x + away.y * toDest.y) / (len * (Math.hypot(toDest.x, toDest.y) || 1))
      const landing = { x: here.x + (away.x / len) * 10, y: here.y + (away.y / len) * 10 }
      if (along > 0.8 && dist(landing, dest) < dist(here, dest) && isSafe(landing, hazards, w.ground) && pathIsSafe(here, landing, [], w.ground)) {
        w.skills.tryUse(e, this.kit.backstep)
      }
    }
  }

  /** Mitigation before every tankbuster aimed at this tank, and on low HP — one shared cooldown */
  private tankDuty(threats: ActiveAoeZone[], now: number): void {
    const w = this.world
    const e = this.entity
    const mit = this.kit.mitigation!
    if (w.skills.getCharges(e.id, mit) <= 0 || w.buffs.hasBuff(e, 'npc_tank_mit')) return
    let busterIn = Infinity
    for (const z of threats) {
      if (z.anchorEntityId !== e.id || !isBuster(damageEffects(z))) continue
      busterIn = Math.min(busterIn, z.def.resolveDelay - z.elapsed)
      if (!this.busterLead.has(z.id)) this.busterLead.set(z.id, between(w.rng, BUSTER_LEAD_MS))
      if (z.def.resolveDelay - z.elapsed <= this.busterLead.get(z.id)!) { w.skills.tryUse(e, mit); return }
    }
    for (const caster of w.entities.getAlive()) {
      const c = caster.casting
      if (!c || c.targetId !== e.id || !isHostile(caster, e)) continue
      const skill = w.skills.getSkill(c.skillId)
      if (!skill || !isBuster(skill.effects ?? [])) continue
      const key = `${caster.id}:${c.skillId}:${now - c.elapsed}`
      if (!this.busterLead.has(key)) this.busterLead.set(key, between(w.rng, BUSTER_LEAD_MS))
      if (c.castTime - c.elapsed <= this.busterLead.get(key)!) { w.skills.tryUse(e, mit); return }
    }
    if (busterIn === Infinity && e.hp / Math.max(1, e.maxHp) < LOW_HP_MIT) w.skills.tryUse(e, mit)
  }

  /** Returns true when the healer spent this think on a heal (or is committed to one) */
  private healerDuty(threats: ActiveAoeZone[], moving: boolean, now: number): boolean {
    const w = this.world
    const e = this.entity
    const kit = this.kit
    const party = w.entities.getAll().filter(isPartyMember)
    const raidwide = threats.find(z => z.def.telegraph === false && !this.prepared.has(z.id) && damageEffects(z).length > 0)
    const action = chooseHealerAction(party, !!raidwide, now >= this.raiseReadyAt, w.player)
    if (!action) return false
    if (action.kind === 'prepare') {
      if (w.skills.getCharges(e.id, kit.partyMit!) > 0 && w.skills.tryUse(e, kit.partyMit!)) {
        this.prepared.add(raidwide!.id)
        return false
      }
      if (moving || e.casting || e.gcdTimer > 0) return false
      if (w.skills.tryUse(e, kit.regen!)) this.prepared.add(raidwide!.id)
      return true
    }
    if (e.casting || e.gcdTimer > 0) return action.kind !== 'raise'
    // On the move only instants go out: the instant party heal stands in for a single heal
    const heal = action.kind === 'heal' && moving ? { kind: 'aoe_heal' as const } : action
    switch (heal.kind) {
      case 'heal':
        e.allyTarget = heal.target.id
        w.skills.tryUse(e, kit.heal!)
        return true
      case 'aoe_heal':
        w.skills.tryUse(e, kit.aoeHeal!)
        return true
      case 'raise':
        if (moving) return false
        e.allyTarget = heal.target.id
        if (w.skills.tryUse(e, kit.raise!)) this.raiseReadyAt = now + NPC_RAISE_COOLDOWN_MS
        return true
    }
  }

  private attack(target: Entity, moving: boolean): void {
    const w = this.world
    const e = this.entity
    if (e.casting) return
    if (rangeTo(e, target) > this.kit.range) {
      // Melee out of reach (mid-mechanic, walking in): a ranged GCD instead of nothing
      const ranged = this.kit.rangedGcd
      if (ranged && e.gcdTimer <= 0 && rangeTo(e, target) <= ranged.range) w.skills.tryUse(e, ranged)
      return
    }
    if (w.skills.getCharges(e.id, this.kit.burst) > 0) w.skills.tryUse(e, this.kit.burst)
    if (e.gcdTimer > 0) return
    if (moving && this.kit.gcd.castTime > 0) return
    w.skills.tryUse(e, this.kit.gcd)
  }

  // --- Movement ------------------------------------------------------------

  private move(dt: number): void {
    const w = this.world
    const e = this.entity
    if (!e.alive || !this.dest || e.casting) return
    if (w.displacer.isAnimating(e.id) || w.buffs.isStunned(e)) return
    const dx = this.dest.x - e.position.x
    const dy = this.dest.y - e.position.y
    const d = Math.hypot(dx, dy)
    if (d < 0.05) return
    const step = Math.min(d, e.speed * (1 + w.buffs.getSpeedModifier(e)) * (dt / 1000))
    const next = w.arena.clampToWallZones(w.arena.clampPosition({ x: e.position.x + (dx / d) * step, y: e.position.y + (dy / d) * step }))
    e.position.x = next.x
    e.position.y = next.y
    e.facing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  }
}
