// src/game/party/npc-nav.ts
// Where an NPC may stand: outside pending enemy AOEs (with a margin), inside the arena, off death zones.
import type { AoeShapeDef, Vec2 } from '@/core/types'
import type { ActiveAoeZone } from '@/skill/aoe-zone'
import { isPointInAoeShape } from '@/skill/aoe-shape'

/** NPCs keep this far from the edge of an AOE instead of hugging it */
export const SAFE_MARGIN = 1.5

export interface Ground {
  /** Standable: in bounds and not in a death zone */
  standable(p: Vec2): boolean
}

const RING = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)

/** Extra sweep kept clear of a zone that turns after its target (a fan's degrees, a line's width) */
const TRACKING_SLACK = { angle: 40, width: 4 }

/** Shape to keep out of: a zone that turns after its target is widened, so a spot stays clear while it swings a little */
function avoidShape(z: ActiveAoeZone): AoeShapeDef {
  const s = z.def.shape
  if (!z.def.trackTarget) return s
  if (s.type === 'fan') return { ...s, angle: Math.min(360, s.angle + TRACKING_SLACK.angle) }
  if (s.type === 'rect') return { ...s, width: s.width + TRACKING_SLACK.width }
  return s
}

export function inHazard(p: Vec2, hazards: readonly ActiveAoeZone[]): boolean {
  return hazards.some(z => isPointInAoeShape(p, z.center, avoidShape(z), z.facing))
}

/** `p` and a ring of `margin` around it are clear of every hazard, and `p` is standable */
export function isSafe(p: Vec2, hazards: readonly ActiveAoeZone[], ground: Ground, margin = SAFE_MARGIN): boolean {
  if (!ground.standable(p) || inHazard(p, hazards)) return false
  return RING.every(a => !inHazard({ x: p.x + Math.sin(a) * margin, y: p.y + Math.cos(a) * margin }, hazards))
}

/** Every point along a→b is standable and clear of hazards (for dashes and backsteps) */
export function pathIsSafe(a: Vec2, b: Vec2, hazards: readonly ActiveAoeZone[], ground: Ground): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5))
  for (let i = 0; i <= steps; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }
    if (!ground.standable(p) || inHazard(p, hazards)) return false
  }
  return true
}

/**
 * Safe point closest to `preferred` (where the NPC wants to fight from), mildly favouring short
 * walks from `from`; `jitter` scatters the result so NPCs don't line up on the same edge.
 * Falls back to `from` when nothing nearby is safe.
 */
export function findSafeSpot(from: Vec2, preferred: Vec2, hazards: readonly ActiveAoeZone[], ground: Ground, rng: () => number = Math.random, jitter = 1): Vec2 {
  let best: Vec2 | null = null
  let bestScore = Infinity
  const consider = (c: Vec2) => {
    const score = Math.hypot(c.x - preferred.x, c.y - preferred.y) + 0.5 * Math.hypot(c.x - from.x, c.y - from.y)
    if (score < bestScore && isSafe(c, hazards, ground)) { bestScore = score; best = c }
  }
  consider(preferred)
  if (!best) {
    for (const center of [preferred, from]) {
      for (let r = 1; r <= 30; r += 1) {
        for (let i = 0; i < 24; i++) {
          const a = (i * Math.PI * 2) / 24
          consider({ x: center.x + Math.sin(a) * r, y: center.y + Math.cos(a) * r })
        }
        if (best && r > bestScore) break
      }
    }
  }
  if (!best) return { ...from }
  const base: Vec2 = best
  for (let tries = 0; tries < 6; tries++) {
    const a = rng() * Math.PI * 2
    const r = rng() * jitter
    const c = { x: base.x + Math.sin(a) * r, y: base.y + Math.cos(a) * r }
    if (isSafe(c, hazards, ground)) return c
  }
  return base
}

/** Random point within `radius` of `center` (uniform over the disc) */
export function scatter(center: Vec2, radius: number, rng: () => number = Math.random): Vec2 {
  const a = rng() * Math.PI * 2
  const r = Math.sqrt(rng()) * radius
  return { x: center.x + Math.sin(a) * r, y: center.y + Math.cos(a) * r }
}
