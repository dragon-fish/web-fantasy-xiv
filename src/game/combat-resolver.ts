import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import type { Entity } from '@/entity/entity'
import type { SkillDef, SkillEffectDef } from '@/core/types'
import { calculateDamage } from '@/combat/damage'
import { calcDash, calcBackstep, calcKnockback, calcPull } from '@/combat/displacement'
import type { DisplacementAnimator } from './displacement-animator'

/**
 * Generic combat effect resolver.
 * Listens to skill:cast_complete and aoe:zone_resolved,
 * applies damage, healing, displacement, and buff effects
 * for ANY caster/target combination.
 */
export class CombatResolver {
  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
    private buffSystem: BuffSystem,
    private arena: Arena,
    private displacer?: DisplacementAnimator,
  ) {
    // Single-target skill effects
    bus.on('skill:cast_complete', (payload: { caster: Entity; skill: SkillDef | any }) => {
      const skill = payload.skill as SkillDef | undefined
      if (!skill?.effects) return
      const caster = payload.caster
      const target = caster.target ? this.entityMgr.get(caster.target) : null

      this.resolveEffects(skill.effects, caster, target)
    })

    // AoE zone resolved effects
    bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
      const casterId: string | null = payload.zone.casterId
      const caster = casterId ? this.entityMgr.get(casterId) : null

      for (const hit of payload.hitEntities) {
        this.resolveEffects(payload.zone.def.effects, caster, hit)
      }
    })
  }

  private resolveEffects(
    effects: SkillEffectDef[],
    caster: Entity | null | undefined,
    target: Entity | null | undefined,
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'damage':
          if (!caster || !target) break
          this.applyDamage(caster, target, effect.potency)
          break

        case 'heal':
          if (!target) break
          target.hp = Math.min(target.maxHp, target.hp + (caster?.attack ?? 0) * effect.potency)
          break

        case 'dash':
          if (!caster || !target) break
          this.applyDisplacement(caster, calcDash(
            { x: caster.position.x, y: caster.position.y },
            { x: target.position.x, y: target.position.y },
          ))
          break

        case 'backstep':
          if (!caster || !target) break
          this.applyDisplacement(caster, calcBackstep(
            { x: caster.position.x, y: caster.position.y },
            { x: target.position.x, y: target.position.y },
            effect.distance,
          ))
          break

        case 'knockback': {
          if (!target) break
          const kbSource = this.resolveDisplacementSource(effect.source, caster)
          if (!kbSource) break
          this.applyDisplacement(target, calcKnockback(
            { x: target.position.x, y: target.position.y },
            kbSource,
            effect.distance,
          ))
          break
        }

        case 'pull': {
          if (!target) break
          const pullSource = this.resolveDisplacementSource(effect.source, caster)
          if (!pullSource) break
          this.applyDisplacement(target, calcPull(
            { x: target.position.x, y: target.position.y },
            pullSource,
            effect.distance,
          ))
          break
        }
      }
    }
  }

  private applyDamage(caster: Entity, target: Entity, potency: number): void {
    const dmg = calculateDamage({
      attack: caster.attack,
      potency,
      increases: this.buffSystem.getDamageIncreases(caster),
      mitigations: this.buffSystem.getMitigations(target),
    })
    target.hp = Math.max(0, target.hp - dmg)
    this.bus.emit('damage:dealt', { source: caster, target, amount: dmg, skill: null })
  }

  private applyDisplacement(entity: Entity, newPos: { x: number; y: number }): void {
    const clamped = this.arena.clampPosition(newPos)
    if (this.displacer) {
      // Animate over time
      this.displacer.start(entity, clamped.x, clamped.y)
    } else {
      // Instant fallback
      entity.position.x = clamped.x
      entity.position.y = clamped.y
    }
    this.bus.emit('entity:moved', { entity, from: null, to: clamped })
  }

  private resolveDisplacementSource(
    source: { type: string; x?: number; y?: number } | undefined,
    caster: Entity | null | undefined,
  ): { x: number; y: number } | null {
    if (!source || source.type === 'caster') {
      return caster ? { x: caster.position.x, y: caster.position.y } : null
    }
    if (source.type === 'position') {
      return { x: source.x!, y: source.y! }
    }
    return null
  }
}
