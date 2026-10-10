// src/game/party/npc-brain.ts
// One NPC ally: dodge first, then role duties, then damage (see docs/superpowers/specs/2026-10-09-npc-party-design.md).
import type { Vec2 } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { EntityManager } from '@/entity/entity-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import { followsAnchor, type ActiveAoeZone, type AoeZoneManager } from '@/skill/aoe-zone'
import type { EnmitySystem } from '@/combat/enmity'
import type { Arena } from '@/arena/arena'
import type { DisplacementAnimator } from '../displacement-animator'
import { rangeTo } from '@/skill/skill-resolver'
import { canBeRaised, isHostile, isPartyMember } from '@/combat/party'
import { findSafeSpot, inHazard, isSafe, pathIsSafe, type Ground } from './npc-nav'
import type { NpcKit } from './npc-kits'
import { mistakeRateFor, type PartyConfig } from './party-config'
import { REGEN_INTERVAL, REGEN_RATE_COMBAT, REGEN_RATE_IDLE } from '../player-input-driver'

/** NPCs think this often (ms); movement runs every tick */
export const THINK_MS = 150
const REACTION_MS: [number, number] = [300, 900]
const LATE_REACTION_MS: [number, number] = [1500, 2500]
/** Tank mitigation goes up this long before a tankbuster lands */
const BUSTER_LEAD_MS: [number, number] = [1000, 3000]
const LOW_HP_MIT = 0.25
/** Single heal thresholds (HP ratio) */
const TANK_HEAL_BELOW = 0.7
const SINGLE_HEAL_BELOW = 0.6
/** Party heal once at least two are under this */
const AOE_HEAL_BELOW = 0.7
/** The healer always saves itself first under this */
const SELF_SAVE_BELOW = 0.33
/** Someone this low is single-healed before any party heal, whatever the numbers say */
const CRITICAL_BELOW = 0.25
/** A tankbuster's target is healed up to this before it lands */
const BUSTER_TOP_UP = 0.9
/** Its urgency climbs over this last stretch of the cast… */
const BUSTER_WINDOW_MS = 6000
/** …and inside this it beats everything but the healer's own rescue */
const BUSTER_LAST_CALL_MS = 2500
/** ±share of random wobble on urgency and on the heal comparison */
const HEAL_JITTER = 0.1
/** Party mitigation goes out in a panic when this many members are under this HP ratio */
const PANIC_MIT_COUNT = 3
const PANIC_MIT_BELOW = 0.5
const ARRIVED = 0.4
/** A chosen target is kept this long (ms, random within) unless it goes away */
const TARGET_COMMIT_MS: [number, number] = [2500, 4000]
/** Random wobble on target priority, in priority units */
const TARGET_WOBBLE = 0.5
/** Hold off breaking a jail under an incoming AOE once it is this low */
const JAIL_HOLD_BELOW = 0.3
/** Waves of AOEs: only those landing within this long of the soonest one are dodged now */
const WAVE_MS = 1200
/** The tank drags the boss back toward the tank spot once it strays this far, and lets go this close (m) */
const PULL_START = 6
const PULL_STOP = 2
/** The opener always drags the boss off-centre: for this long the tank settles it on the spot (ms, m) */
const OPENER_MS = 15000
const OPENER_TOLERANCE = 1.5
/** Non-tanks step out of the boss's front only for a spot this close (m, or a share of their distance
 *  from it); it is a preference, not a must */
const FRONT_STEP = 3
const FRONT_STEP_PER_RANGE = 0.6

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
  /** Where a knocked-back NPC may end up: inside the arena (or stopped by its wall) and off death zones */
  landable(p: Vec2): boolean
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

export interface HealerSense {
  /** Every party member, fallen ones included */
  party: Entity[]
  self: Entity
  player: Entity
  /** A raidwide is coming and has not been answered yet */
  raidwideComing: boolean
  /** A pending tankbuster: whom it is aimed at, and how soon it lands */
  buster: { target: Entity; inMs: number } | null
  /** HP one single heal / one party heal restores */
  singleHeal: number
  partyHeal: number
  rng: () => number
}

const ratio = (e: Entity) => e.hp / Math.max(1, e.maxHp)

/**
 * Healer duty. Self-save first (< 33%), then a tankbuster about to land on a target under 90%, then
 * anyone critical (< 25%), then raises — a fight that keeps chipping the party would otherwise
 * starve them forever. Then single heals (tank < 70%, others < 60%, a tankbuster's target < 90%) by
 * a curved urgency that the coming tankbuster raises as it nears, and party heals (two or more
 * < 70%): when both apply, the party heal goes first if it restores more in total. Then raidwide prep.
 */
export function chooseHealerAction(sense: HealerSense): HealerAction {
  const { party, self, player, rng } = sense
  const wobble = () => 1 + (rng() * 2 - 1) * HEAL_JITTER
  const alive = party.filter(e => e.alive)
  if (self.alive && ratio(self) < SELF_SAVE_BELOW) return { kind: 'heal', target: self }

  const buster = sense.buster?.target.alive ? sense.buster : null
  if (buster && buster.inMs <= BUSTER_LAST_CALL_MS && ratio(buster.target) < BUSTER_TOP_UP) return { kind: 'heal', target: buster.target }

  // Urgency grows steeply as HP falls below the member's threshold, and as a tankbuster on them nears
  const threshold = (e: Entity) => (e === buster?.target ? BUSTER_TOP_UP : e.role === 'tank' ? TANK_HEAL_BELOW : SINGLE_HEAL_BELOW)
  const busterBoost = (e: Entity) => (e === buster?.target ? 1 + 2 * Math.max(0, Math.min(1, 1 - buster.inMs / BUSTER_WINDOW_MS)) : 1)
  const single = alive
    .filter(e => ratio(e) < threshold(e))
    .map(e => ({ e, urgency: Math.pow((threshold(e) - ratio(e)) / threshold(e), 0.6) * busterBoost(e) * wobble() }))
    .sort((a, b) => b.urgency - a.urgency)[0]?.e
  const aoe = alive.filter(e => ratio(e) < AOE_HEAL_BELOW).length >= 2

  if (single && ratio(single) < CRITICAL_BELOW) return { kind: 'heal', target: single }
  const order = (e: Entity) => (e.role === 'tank' ? 0 : e.id === player.id ? 1 : 2)
  const fallen = party.filter(e => !e.alive && !e.customData.raising && canBeRaised(e)).sort((a, b) => order(a) - order(b))[0]
  if (fallen) return { kind: 'raise', target: fallen }
  if (single && aoe) {
    const missing = (e: Entity) => Math.max(0, e.maxHp - e.hp)
    const partyGain = alive.reduce((sum, e) => sum + Math.min(missing(e), sense.partyHeal), 0)
    const singleGain = Math.min(missing(single), sense.singleHeal)
    return partyGain * wobble() >= singleGain ? { kind: 'aoe_heal' } : { kind: 'heal', target: single }
  }
  if (single) return { kind: 'heal', target: single }
  if (aoe) return { kind: 'aoe_heal' }
  if (sense.raidwideComing) return { kind: 'prepare' }
  return null
}

/** Who steps aside when two marked members crowd each other: lower moves (the player never does) */
function yieldRank(e: Entity): number {
  if (!e.npc) return 9
  if (e.role === 'healer') return 0
  if (e.role === 'tank') return 3
  return e.customData.npcStyle === 'melee' ? 2 : 1
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
  /** Current target and until when it is kept */
  private commit: { id: string; until: number } | null = null
  /** Waiting on a jail that must not break yet */
  private holdFire = false
  /** Tank: dragging the boss back toward the tank spot */
  private pulling = false
  /** When the opener's strict centring ends (set on the first tanking think) */
  private openerUntil: number | null = null
  /** Where this NPC stands relative to a stack carrier (fixed per stack) */
  private stackOffset: { zoneId: string; x: number; y: number } | null = null
  /** This think's standable ground: the world's, narrowed by any knockback about to land */
  private ground!: Ground

  constructor(readonly entity: Entity, readonly kit: NpcKit, private world: NpcWorld) {}

  update(dt: number): void {
    this.regen(dt)
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
        const late = w.rng() < mistakeRateFor(w.config, this.entity.role)
        this.seen.set(z.id, now + between(w.rng, REACTION_MS) + (late ? between(w.rng, LATE_REACTION_MS) : 0))
      }
      if (now >= this.seen.get(z.id)!) out.push(z)
    }
    for (const id of this.seen.keys()) if (!live.has(id)) this.seen.delete(id)
    return out
  }

  /**
   * AOEs to stay out of: everything telegraphed, including markers riding on other members (their
   * spread circles, a tankbuster on the tank). Not raidwides, not stacks (those are joined), and
   * not this NPC's own marker. Between two marked members only the one lower in the yield order
   * steps aside (healer, then ranged, then melee, then tank; everyone yields to the player) —
   * if both dodged each other they would chase each other round.
   */
  private dodgeable(zones: ActiveAoeZone[]): ActiveAoeZone[] {
    const e = this.entity
    // Markers that ride on their carrier; circles locked where someone stood are plain ground AOEs
    const riding = (z: ActiveAoeZone) => followsAnchor(z.def.anchor)
    const marked = new Set(zones.filter(z => z.def.anchor.type === 'party' && riding(z) && !z.def.share && !z.def.targeted).map(z => z.anchorEntityId))
    const avoid = zones.filter((z) => {
      if (z.def.telegraph === false || z.def.share || z.def.targeted) return false
      if (z.anchorEntityId === e.id) return !riding(z)
      const carrier = z.anchorEntityId ? this.world.entities.get(z.anchorEntityId) : undefined
      if (!riding(z) || !carrier || !isPartyMember(carrier) || !marked.has(e.id)) return true
      return yieldRank(e) < yieldRank(carrier) || (yieldRank(e) === yieldRank(carrier) && e.id > carrier.id)
    })
    // Sequenced explosions can cover the whole floor: dodge the next wave only, and step into
    // ground that has just gone off (nine bombs, three rows)
    const left = (z: ActiveAoeZone) => z.def.resolveDelay - z.elapsed
    const soonest = Math.min(...avoid.map(left))
    return avoid.filter(z => left(z) <= soonest + WAVE_MS)
  }

  /** Unavoidable knockbacks about to land (no telegraph to walk out of): where they push matters */
  private knockbacks(threats: ActiveAoeZone[]): { zone: ActiveAoeZone; distance: number; from: Vec2 }[] {
    const out: { zone: ActiveAoeZone; distance: number; from: Vec2 }[] = []
    for (const z of threats) {
      if (z.def.telegraph !== false) continue
      for (const effect of z.def.effects) {
        if (effect.type !== 'knockback') continue
        const caster = z.casterId ? this.world.entities.get(z.casterId) : undefined
        const from = effect.source?.type === 'position' ? { x: effect.source.x, y: effect.source.y } : caster ? pos(caster) : z.center
        out.push({ zone: z, distance: effect.distance, from })
      }
    }
    return out
  }

  /** Would standing at `p` survive these knockbacks (landing in bounds, off death zones)? */
  private landsSafely(p: Vec2, knockbacks: { zone: ActiveAoeZone; distance: number; from: Vec2 }[]): boolean {
    for (const k of knockbacks) {
      if (!inHazard(p, [k.zone])) continue
      const dx = p.x - k.from.x
      const dy = p.y - k.from.y
      const len = Math.hypot(dx, dy) || 1
      if (!this.world.landable({ x: p.x + (dx / len) * k.distance, y: p.y + (dy / len) * k.distance })) return false
    }
    return true
  }

  // --- Decisions -----------------------------------------------------------

  private think(): void {
    const e = this.entity
    const w = this.world
    // Down, or jailed (untargetable, stunned): nothing to decide
    if (!e.alive || !e.targetable) { this.dest = null; return }
    const now = w.now()
    const threats = this.threats(now)
    const hazards = this.dodgeable(threats)
    const knockbacks = this.knockbacks(threats)
    this.ground = knockbacks.length
      ? { standable: p => w.ground.standable(p) && this.landsSafely(p, knockbacks) }
      : w.ground
    const target = this.pickTarget(threats)
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
  /**
   * Target choice is a priority with a little random wobble, and once made it holds for a few
   * seconds unless the target goes away — near-equal options would otherwise flip every think and
   * walk the NPC back and forth.
   */
  private pickTarget(threats: ActiveAoeZone[]): Entity | null {
    const w = this.world
    const e = this.entity
    const now = w.now()
    const usable = (t: Entity) => t.alive && t.visible && t.targetable && !t.dormant && isHostile(e, t)
    this.holdFire = false
    const committed = this.commit && w.entities.get(this.commit.id)
    let target = committed && usable(committed) && now < this.commit!.until ? committed : this.chooseTarget(usable)
    if (target && target !== committed) {
      this.commit = { id: target.id, until: now + TARGET_COMMIT_MS[0] + w.rng() * (TARGET_COMMIT_MS[1] - TARGET_COMMIT_MS[0]) }
    }
    // A jail about to break under a knockback or telegraphed AOE would free its prisoner into it:
    // stop short. Ranged turn to the boss meanwhile; melee just wait rather than walk off and back
    if (target && this.jailAtRisk(target, threats)) {
      const melee = this.kit.style === 'melee' || this.kit.style === 'tank'
      const boss = usable(w.boss) ? w.boss : null
      if (!melee && boss) target = boss
      else this.holdFire = true
    }
    return target
  }

  private chooseTarget(usable: (t: Entity) => boolean): Entity | null {
    const w = this.world
    const e = this.entity
    // The tank holds the boss — except to break a jail, which everyone helps with
    const jail = w.entities.getAll().find(t => usable(t) && this.holdsCaptive(t))
    if (this.kit.style === 'tank' && usable(w.boss)) return jail ?? w.boss
    // Priority first (wobbled so near-equal options split at random), then the nearest; a tank
    // first goes for whatever is not on it yet
    const score = (t: Entity) => w.priority(t) + w.rng() * TARGET_WOBBLE
      - dist(pos(e), pos(t)) * 0.01 - (this.kit.style === 'tank' && t.target === e.id ? 1 : 0)
    let best: Entity | null = null
    let bestScore = -Infinity
    for (const t of w.entities.getAll()) {
      if (!usable(t)) continue
      const sc = score(t)
      if (sc > bestScore) { bestScore = sc; best = t }
    }
    return best
  }

  /** A jail, in effect: an enemy holding a party member untargetable with a status it applied */
  private holdsCaptive(t: Entity): boolean {
    const w = this.world
    return w.entities.getAll().some(m => isPartyMember(m) && m.buffs.some(b =>
      b.sourceId === t.id && w.buffs.getDef(b.defId)?.effects.some(x => x.type === 'untargetable')))
  }

  private jailAtRisk(t: Entity, threats: ActiveAoeZone[]): boolean {
    if (t.hp / Math.max(1, t.maxHp) > JAIL_HOLD_BELOW || !this.holdsCaptive(t)) return false
    return threats.some(z => (z.def.telegraph !== false || z.def.effects.some(x => x.type === 'knockback')) && inHazard(pos(t), [z]))
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
    // Lava (a damage death zone) can sit right where the tank would hold the boss: step off it too
    if (hazards.length === 0 && this.ground.standable(preferred)) {
      this.dodge = null
      // Close enough already: don't chase every small drift of the boss
      return dist(here, preferred) < 1.2 ? here : preferred
    }
    if (isSafe(here, hazards, this.ground) && dist(here, preferred) < 1.2) return here
    const key = hazards.map(z => z.id).sort().join(',')
    if (this.dodge?.key !== key || !isSafe(this.dodge.spot, hazards, this.ground)) {
      this.dodge = { key, spot: findSafeSpot(here, preferred, hazards, this.ground, w.rng) }
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
    const line = threats.find(z => z.def.share && z.def.direction.type === 'toward_target' && z.targetId)
    if (line) return this.lineToJoin(line)
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
   * Line stack aimed at someone else: anywhere inside the line shares it, so stay if already in,
   * otherwise step to the nearest point inside it (well clear of the edges).
   */
  private lineToJoin(zone: ActiveAoeZone): Vec2 | null {
    const e = this.entity
    if (zone.targetId === e.id || zone.def.shape.type !== 'rect') return null
    const { length, width } = zone.def.shape
    const f = (zone.facing * Math.PI) / 180
    const fwd = { x: Math.sin(f), y: Math.cos(f) }
    const rel = { x: e.position.x - zone.center.x, y: e.position.y - zone.center.y }
    const along = rel.x * fwd.x + rel.y * fwd.y
    const across = rel.x * fwd.y - rel.y * fwd.x
    const half = Math.max(0.3, width / 2 - 1)
    if (along >= 1 && along <= length - 1 && Math.abs(across) <= half) return pos(e)
    const a = Math.min(length - 1.5, Math.max(1.5, along))
    const c = Math.max(-half * 0.5, Math.min(half * 0.5, across))
    return { x: zone.center.x + fwd.x * a + fwd.y * c, y: zone.center.y + fwd.y * a - fwd.x * c }
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
    // The boss's front (90°) belongs to whoever it faces; adds aren't worth walking around
    const front = (p: Vec2) => {
      if (target !== w.boss || target.target === e.id) return false
      const bearing = ((Math.atan2(p.x - target.position.x, p.y - target.position.y) * 180) / Math.PI + 360) % 360
      return Math.abs(((bearing - target.facing + 540) % 360) - 180) < 45
    }
    const good = (p: Vec2) => inRange(p) && isSafe(p, hazards, this.ground)
    if (this.fight && good(this.fight)) return this.fight
    if (good(here)) {
      this.fight = null
      if (!front(here)) return here
      // In front: step aside only if a spot out of it is close; never circle the boss for it
      const aside = this.closestFightSpot(target, c => good(c) && !front(c))
      const allowance = Math.max(FRONT_STEP, FRONT_STEP_PER_RANGE * dist(here, pos(target)))
      if (aside && dist(here, aside) <= allowance) { this.fight = aside; return aside }
      return here
    }
    this.fight = this.closestFightSpot(target, good, c => (front(c) ? 8 : 0))
      ?? findSafeSpot(here, here, hazards, this.ground, w.rng)
    return this.fight
  }

  /** Nearest ring point around `target` passing `ok`, by walk distance plus `penalty` */
  private closestFightSpot(target: Entity, ok: (p: Vec2) => boolean, penalty: (p: Vec2) => number = () => 0): Vec2 | null {
    const w = this.world
    const here = pos(this.entity)
    const reach = this.kit.range - 0.3
    const radii = this.kit.style === 'melee' ? [1, 2] : [6, 10, 14, 18].filter(r => r <= reach)
    let best: Vec2 | null = null
    let bestCost = Infinity
    for (const r of radii) {
      for (let i = 0; i < 24; i++) {
        const a = (i * Math.PI * 2) / 24
        const c = { x: target.position.x + Math.sin(a) * (target.size + r), y: target.position.y + Math.cos(a) * (target.size + r) }
        if (!ok(c)) continue
        const cost = dist(here, c) + penalty(c) + w.rng() * 0.5
        if (cost < bestCost) { bestCost = cost; best = c }
      }
    }
    return best
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
      if (w.boss.speed <= 0) {
        const reach = w.boss.size + 1.5
        return { x: w.boss.position.x + face.x * reach, y: w.boss.position.y + face.y * reach }
      }
      // Keep the boss roughly mid-arena (boss-frame mechanics need room), not pinned to the spot.
      // It stops a chase range short of whoever it follows, so drag it by walking past the spot,
      // one chase range beyond it; otherwise hold it where it is, facing the configured way.
      const spot = w.config.tankSpot
      const reach = Math.max(w.boss.size + 1, w.bossChaseRange - 0.3)
      const off = { x: spot.x - w.boss.position.x, y: spot.y - w.boss.position.y }
      const away = Math.hypot(off.x, off.y)
      this.openerUntil ??= w.now() + OPENER_MS
      const opener = w.now() < this.openerUntil
      if (away > (opener ? OPENER_TOLERANCE : PULL_START)) this.pulling = true
      else if (away < (opener ? OPENER_TOLERANCE * 0.5 : PULL_STOP)) this.pulling = false
      if (this.pulling) return { x: spot.x + (off.x / away) * reach, y: spot.y + (off.y / away) * reach }
      return { x: w.boss.position.x + face.x * reach, y: w.boss.position.y + face.y * reach }
    }
    const away = { x: e.position.x - target.position.x, y: e.position.y - target.position.y }
    const len = Math.hypot(away.x, away.y) || 1
    return { x: target.position.x + (away.x / len) * (target.size + 1.5), y: target.position.y + (away.y / len) * (target.size + 1.5) }
  }

  /**
   * Melee close in with a dash after dodging when the landing is where they were headed anyway.
   * The tank dashes back whenever its target is out of reach (pull, after a dodge): every second
   * spent walking lets the boss wander after it instead of being dragged back mid-arena.
   * Anyone may backstep away from danger.
   */
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
      if ((this.kit.style === 'tank' || dist(landing, dest) < 3) && pathIsSafe(here, landing, hazards, this.ground) && isSafe(landing, hazards, this.ground)) {
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
      if (along > 0.8 && dist(landing, dest) < dist(here, dest) && isSafe(landing, hazards, this.ground) && pathIsSafe(here, landing, [], this.ground)) {
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
      // On this tank, or fired from the boss aimed at it (a cleave at the top of the enmity list)
      if ((z.anchorEntityId !== e.id && z.targetId !== e.id) || !isBuster(damageEffects(z))) continue
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
    // Mitigation is spent ahead of raidwides and multi-target markers — or in a panic when the party
    // is low, which can leave it on cooldown for the next raidwide
    if (party.filter(m => m.alive && ratio(m) < PANIC_MIT_BELOW).length >= PANIC_MIT_COUNT
      && w.skills.getCharges(e.id, kit.partyMit!) > 0) w.skills.tryUse(e, kit.partyMit!)
    const markers = threats.filter(z => z.def.anchor.type === 'party' && !z.def.share && damageEffects(z).length > 0)
    const raidwide = threats.find(z => z.def.telegraph === false && !this.prepared.has(z.id) && damageEffects(z).length > 0)
      ?? (markers.length >= 2 && !this.prepared.has(markers[0]!.id) ? markers[0] : undefined)
    const healOf = (skill: typeof kit.heal) => {
      const effect = skill?.effects?.find(x => x.type === 'heal' || x.type === 'party_heal')
      return effect && 'potency' in effect ? effect.potency * e.attack : 0
    }
    const busterZone = threats.find(z => isBuster(damageEffects(z)))
    const busterOn = busterZone ? w.entities.get(busterZone.targetId ?? busterZone.anchorEntityId ?? '') : undefined
    const buster = busterZone && busterOn && isPartyMember(busterOn)
      ? { target: busterOn, inMs: busterZone.def.resolveDelay - busterZone.elapsed } : null
    const action = chooseHealerAction({
      party, self: e, player: w.player, raidwideComing: !!raidwide, buster,
      singleHeal: healOf(kit.heal), partyHeal: healOf(kit.aoeHeal), rng: w.rng,
    })
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
    // Every heal has a cast: none goes out on the move (instants keep flowing meanwhile)
    if (moving) return false
    switch (action.kind) {
      case 'heal':
        e.allyTarget = action.target.id
        w.skills.tryUse(e, kit.heal!)
        return true
      case 'aoe_heal':
        w.skills.tryUse(e, kit.aoeHeal!)
        return true
      case 'raise':
        e.allyTarget = action.target.id
        w.skills.tryUse(e, kit.raise!)
        return true
    }
  }

  private attack(target: Entity, moving: boolean): void {
    const w = this.world
    const e = this.entity
    if (e.casting || this.holdFire) return
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

  /** Natural HP regen, at the player's rates */
  private regenAcc = 0
  private regen(dt: number): void {
    const e = this.entity
    const maxHp = this.world.buffs.getMaxHp(e)
    if (!e.alive || e.hp >= maxHp) { this.regenAcc = 0; return }
    this.regenAcc += dt
    if (this.regenAcc < REGEN_INTERVAL) return
    this.regenAcc -= REGEN_INTERVAL
    e.hp = Math.min(maxHp, e.hp + Math.floor(maxHp * (e.inCombat ? REGEN_RATE_COMBAT : REGEN_RATE_IDLE)))
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
