import type { Vec2 } from '@/core/types'

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function normalize(dx: number, dy: number): Vec2 {
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.0001) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

/**
 * Dash: move entity to 1m from target.
 * If already within 1m, returns original position (skill still counts as used).
 */
export function calcDash(entityPos: Vec2, targetPos: Vec2): Vec2 {
  const d = dist(entityPos, targetPos)
  if (d <= 1) return { ...entityPos }

  const dir = normalize(targetPos.x - entityPos.x, targetPos.y - entityPos.y)
  const moveDist = d - 1
  return {
    x: entityPos.x + dir.x * moveDist,
    y: entityPos.y + dir.y * moveDist,
  }
}

/**
 * Backstep: move entity backward (away from target) by distance.
 * "Backward" = opposite direction of target from entity.
 */
export function calcBackstep(entityPos: Vec2, targetPos: Vec2, distance: number): Vec2 {
  const dir = normalize(entityPos.x - targetPos.x, entityPos.y - targetPos.y)
  return {
    x: entityPos.x + dir.x * distance,
    y: entityPos.y + dir.y * distance,
  }
}

/**
 * Knockback: push entity away from source by distance.
 * Direction = source → entity (push outward).
 * If entity is on top of source, no movement.
 */
export function calcKnockback(entityPos: Vec2, sourcePos: Vec2, distance: number): Vec2 {
  const dir = normalize(entityPos.x - sourcePos.x, entityPos.y - sourcePos.y)
  if (dir.x === 0 && dir.y === 0) return { ...entityPos }
  return {
    x: entityPos.x + dir.x * distance,
    y: entityPos.y + dir.y * distance,
  }
}

/**
 * Pull: pull entity toward source by distance.
 * Capped at source position — won't pull past the source.
 */
export function calcPull(entityPos: Vec2, sourcePos: Vec2, distance: number): Vec2 {
  const d = dist(entityPos, sourcePos)
  if (d < 0.0001) return { ...entityPos }

  const actualDist = Math.min(distance, d) // cap at source position
  const dir = normalize(sourcePos.x - entityPos.x, sourcePos.y - entityPos.y)
  return {
    x: entityPos.x + dir.x * actualDist,
    y: entityPos.y + dir.y * actualDist,
  }
}
