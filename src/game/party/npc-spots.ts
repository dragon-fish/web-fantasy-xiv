// src/game/party/npc-spots.ts
// Preset mechanic spots (timeline `npc:` hints) handed out to the NPCs.
import type { Vec2 } from '@/core/types'
import type { NpcSpotHint } from '@/config/schema'
import { scatter } from './npc-nav'

export const DEFAULT_SPOT_TOLERANCE = 1.5

export interface SpotClaimant {
  id: string
  position: Vec2
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

/** The spot left for the player: the southernmost one (smallest y) */
export function playerSpotIndex(spots: Vec2[]): number {
  let best = 0
  spots.forEach((s, i) => { if (s.y < spots[best]!.y) best = i })
  return best
}

/**
 * Spot index per NPC. With a spot for everyone, the player's spot stays free and NPCs claim the
 * rest, closest pairs first; with fewer spots (stacks), each NPC takes the spot nearest to it.
 */
export function assignSpots(spots: Vec2[], npcs: SpotClaimant[]): Map<string, number> {
  const out = new Map<string, number>()
  if (spots.length < npcs.length + 1) {
    for (const n of npcs) {
      let best = 0
      spots.forEach((s, i) => { if (dist(n.position, s) < dist(n.position, spots[best]!)) best = i })
      out.set(n.id, best)
    }
    return out
  }
  const free = new Set(spots.map((_, i) => i))
  free.delete(playerSpotIndex(spots))
  const waiting = [...npcs]
  while (waiting.length > 0 && free.size > 0) {
    let pick: { n: number; s: number; d: number } | null = null
    waiting.forEach((n, ni) => {
      for (const s of free) {
        const d = dist(n.position, spots[s]!)
        if (!pick || d < pick.d) pick = { n: ni, s, d }
      }
    })
    const { n, s } = pick!
    out.set(waiting[n]!.id, s)
    free.delete(s)
    waiting.splice(n, 1)
  }
  return out
}

interface ActiveHint {
  hint: NpcSpotHint
  until: number
  claims: Map<string, number>
  /** Where each NPC actually stands (scattered inside the tolerance) */
  points: Map<string, Vec2>
  unique: boolean
}

/** Holds the current spot hint; NPCs ask it where to stand */
export class SpotCoordinator {
  private active: ActiveHint | null = null

  constructor(private rng: () => number, private mistakeRate: number) {}

  activate(hint: NpcSpotHint, npcs: SpotClaimant[], now: number, holdMs: number): void {
    const spots = hint.spots
    const claims = assignSpots(spots, npcs)
    const active: ActiveHint = { hint, until: now + holdMs, claims, points: new Map(), unique: spots.length >= npcs.length + 1 }
    for (const [id, i] of claims) active.points.set(id, this.standPoint(hint, i))
    this.active = active
  }

  /** Expire the hint; if the player walked onto an NPC's spot, that NPC moves to a free one */
  update(now: number, player: Vec2 | null): void {
    const a = this.active
    if (!a) return
    if (now >= a.until) { this.active = null; return }
    if (!a.unique || !player) return
    const spots = a.hint.spots
    for (const [id, i] of a.claims) {
      if (dist(player, spots[i]!) > this.tolerance(a.hint, i)) continue
      const taken = new Set(a.claims.values())
      const free = spots.map((_, k) => k).filter(k => !taken.has(k))
      if (free.length === 0) return
      const next = free.reduce((b, k) => (dist(spots[k]!, spots[i]!) < dist(spots[b]!, spots[i]!) ? k : b))
      a.claims.set(id, next)
      a.points.set(id, this.standPoint(a.hint, next))
      return
    }
  }

  pointFor(npcId: string): Vec2 | null {
    return this.active?.points.get(npcId) ?? null
  }

  private tolerance(hint: NpcSpotHint, i: number): number {
    return hint.spots[i]!.tolerance ?? hint.tolerance ?? DEFAULT_SPOT_TOLERANCE
  }

  private standPoint(hint: NpcSpotHint, i: number): Vec2 {
    const tol = this.tolerance(hint, i)
    const spot = hint.spots[i]!
    if (this.rng() >= this.mistakeRate) return scatter(spot, tol, this.rng)
    // A sloppy NPC ends up 2–3 tolerances off the spot
    const a = this.rng() * Math.PI * 2
    const r = tol * (2 + this.rng())
    return { x: spot.x + Math.sin(a) * r, y: spot.y + Math.cos(a) * r }
  }
}
