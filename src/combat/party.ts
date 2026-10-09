// src/combat/party.ts
// Factions, the player's party, and how skills pick party members.
import type { PartySelect } from '@/core/types'
import { NEUTRAL_TEAM, PARTY_TEAM, type Entity } from '@/entity/entity'

/** The player's party: the player plus NPC allies */
export function isPartyMember(e: Entity): boolean {
  return e.team === PARTY_TEAM
}

/** Can `a` attack `b` (and must not heal it)? */
export function isHostile(a: Entity, b: Entity): boolean {
  return a.team !== b.team && a.team !== NEUTRAL_TEAM && b.team !== NEUTRAL_TEAM
}

/** Can `a` heal / buff `b`? */
export function isAlly(a: Entity, b: Entity): boolean {
  return a.team === b.team
}

function distance(a: Entity, b: Entity): number {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
}

/** Living party members within `radius` of `center` (the center itself included when it is one) */
export function partyMembersNear(center: Entity, entities: Iterable<Entity>, radius: number): Entity[] {
  const out: Entity[] = []
  for (const e of entities) {
    if (isPartyMember(e) && e.alive && distance(center, e) <= radius) out.push(e)
  }
  return out
}

/**
 * Friendly target for a skill with `allyTarget`. The caster's own pick (`caster.allyTarget`) wins
 * when it fits the mode and is in range; otherwise:
 * - 'lowest-hp': living member in range with the lowest HP ratio; the caster when alone
 * - 'fallen': nearest fallen member in range; null when there is none
 */
export function pickAllyTarget(caster: Entity, entities: Iterable<Entity>, mode: 'lowest-hp' | 'fallen', range: number): Entity | null {
  const fits = (e: Entity) => isPartyMember(e) && distance(caster, e) <= range && (mode === 'fallen' ? !e.alive : e.alive)
  let best: Entity | null = null
  let bestScore = Infinity
  for (const e of entities) {
    if (e.id === caster.allyTarget && fits(e)) return e
    if (!fits(e)) continue
    const score = mode === 'fallen' ? distance(caster, e) : e.hp / Math.max(1, e.maxHp)
    if (score < bestScore) { bestScore = score; best = e }
  }
  return mode === 'lowest-hp' ? (best ?? caster) : best
}

/**
 * Party members picked by a marker (one entry per zone to spawn; a member may appear twice).
 * `members`: living party members; `enmity`: the caster's ranking, top first.
 */
export function selectPartyTargets(sel: PartySelect, members: Entity[], enmity: Entity[], rng: () => number = Math.random): Entity[] {
  if (members.length === 0) return []
  const pickRandom = () => members[Math.floor(rng() * members.length)]!
  switch (sel.select) {
    case 'each':
      return [...members]
    case 'count': {
      const pool = [...members]
      const out: Entity[] = []
      while (out.length < sel.count && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!)
      while (out.length < sel.count) out.push(pickRandom())
      return out
    }
    case 'role': {
      const matched = members.filter(m => m.role === sel.role)
      return matched.length > 0 ? matched : [pickRandom()]
    }
    case 'enmity': {
      const ranks = Array.isArray(sel.rank) ? sel.rank : [sel.rank]
      return ranks.map(r => enmity[r - 1]).filter((e): e is Entity => !!e)
    }
  }
}
