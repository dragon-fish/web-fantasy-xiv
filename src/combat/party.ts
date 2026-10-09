// src/combat/party.ts
// Who counts as the player's party, and how friendly skills pick their target among it.
import type { Entity } from '@/entity/entity'

/** The player's party. NPC party members join here once they exist. */
export function isPartyMember(e: Entity): boolean {
  return e.type === 'player'
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
 * Friendly target for a skill with `allyTarget`:
 * - 'lowest-hp': living member in range with the lowest HP ratio; the caster when alone
 * - 'fallen': nearest fallen member in range; null when there is none
 */
export function pickAllyTarget(caster: Entity, entities: Iterable<Entity>, mode: 'lowest-hp' | 'fallen', range: number): Entity | null {
  let best: Entity | null = null
  let bestScore = Infinity
  for (const e of entities) {
    if (!isPartyMember(e) || distance(caster, e) > range) continue
    if (mode === 'fallen' ? e.alive : !e.alive) continue
    const score = mode === 'fallen' ? distance(caster, e) : e.hp / Math.max(1, e.maxHp)
    if (score < bestScore) { bestScore = score; best = e }
  }
  return mode === 'lowest-hp' ? (best ?? caster) : best
}
