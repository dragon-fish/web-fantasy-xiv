import type { Vec2 } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { WeaponId } from './catalog'

export interface Effect { kind: 'burst' | 'line' | 'slash' | 'dash'; from: Vec2; to?: Vec2; radius: number; color: string; facing?: number }
export interface Projectile extends Vec2 { id: number; vx: number; vy: number; life: number; weapon: WeaponId; potency: number; pierce: number; hit: Set<string>; target?: string; secondary: boolean }
export interface Field extends Vec2 { id: number; radius: number; life: number; tick: number; potency: number }
export interface Orb extends Vec2 { id: number; radius: number }
export interface Gem extends Vec2 { id: number; value: number; expiresAt: number }
export interface WeaponContext {
  player: Entity
  elapsed: number
  area: number
  enemies(): Entity[]
  rank(id: string): number
  hit(target: Entity, potency: number, weapon: WeaponId, secondary?: boolean): void
  freeze(target: Entity): void
  shock(target: Entity): void
  effect(effect: Effect): void
}
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export function nearest(origin: Vec2, enemies: Entity[], range = Infinity): Entity | undefined {
  let found: Entity | undefined
  for (const e of enemies) {
    if (!e.alive) continue
    const d = distance(origin, e.position)
    if (d < range) { found = e; range = d }
  }
  return found
}
