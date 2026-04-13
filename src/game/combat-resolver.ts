import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import type { Entity } from '@/entity/entity'
import type { SkillDef, SkillEffectDef, BuffDef } from '@/core/types'
import { calculateDamage } from '@/combat/damage'
import { calcDash, calcBackstep, calcKnockback, calcPull } from '@/combat/displacement'
import type { AoeZoneManager } from '@/skill/aoe-zone'
import type { DisplacementAnimator } from './displacement-animator'

/**
 * Generic combat effect resolver.
 * Listens to skill:cast_complete and aoe:zone_resolved,
 * applies damage, healing, displacement, and buff effects
 * for ANY caster/target combination.
 */
export class CombatResolver {
  private buffDefs = new Map<string, BuffDef>()

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
    private buffSystem: BuffSystem,
    private arena: Arena,
    private zoneMgr?: AoeZoneManager,
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

  registerBuffs(defs: Record<string, BuffDef>): void {
    for (const [id, def] of Object.entries(defs)) {
      this.buffDefs.set(id, def)
    }
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

        case 'apply_buff': {
          // Self-buff: apply to caster; AoE debuff: apply to target
          const buffDef = this.buffDefs.get(effect.buffId)
          if (!buffDef) break
          // Debuffs apply to target, buffs apply to caster (self)
          const buffTarget = buffDef.type === 'debuff' ? target : (caster ?? target)
          if (!buffTarget) break
          const stacks = effect.stacks ?? 1
          this.buffSystem.applyBuff(buffTarget, buffDef, (caster ?? buffTarget).id, stacks)
          break
        }

        case 'heal': {
          const healTarget = target ?? caster // self-heal if no target
          if (!healTarget) break
          const healAmount = Math.floor((caster?.attack ?? healTarget.attack) * effect.potency)
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + healAmount)
          this.bus.emit('damage:dealt', { source: caster ?? healTarget, target: healTarget, amount: -healAmount, skill: null })
          break
        }

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
    const vulnerability = this.buffSystem.getVulnerability(target)
    const dmg = calculateDamage({
      attack: caster.attack,
      potency,
      increases: [...this.buffSystem.getDamageIncreases(caster), vulnerability],
      mitigations: this.buffSystem.getMitigations(target),
    })
    target.hp = Math.max(0, target.hp - dmg)
    this.bus.emit('damage:dealt', { source: caster, target, amount: dmg, skill: null })
  }

  private applyDisplacement(entity: Entity, newPos: { x: number; y: number }): void {
    const clamped = this.arena.clampPosition(newPos)

    // Forced movement interrupts casting + cancels zones
    if (entity.casting) {
      const skillId = entity.casting.skillId
      this.zoneMgr?.cancelZones(entity.id, skillId)
      entity.casting = null
      entity.gcdTimer = 0
      this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'displacement' })
    }

    if (this.displacer) {
      this.displacer.start(entity, clamped.x, clamped.y)
    } else {
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
