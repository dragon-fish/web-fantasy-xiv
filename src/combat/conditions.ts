// src/combat/conditions.ts
import type { EffectCondition } from '@/core/types'
import type { Entity } from '@/entity/entity'

/** True when the entity satisfies every field of the condition (no condition = always). */
export function matchesCondition(cond: EffectCondition | undefined, entity: Entity | null | undefined): boolean {
  if (!cond) return true
  if (cond.role !== undefined) {
    const roles = Array.isArray(cond.role) ? cond.role : [cond.role]
    if (!entity?.role || !roles.includes(entity.role)) return false
  }
  if (cond.notBuff !== undefined && entity?.buffs.some(b => b.defId === cond.notBuff)) return false
  return true
}
