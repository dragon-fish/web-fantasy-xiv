import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import type { Entity } from '@/entity/entity'
import type { SkillDef, SkillEffectDef, BuffDef } from '@/core/types'
import { calculateDamage } from '@/combat/damage'
import { calcDash, calcBackstep, calcKnockback, calcPull } from '@/combat/displacement'
import { EASING, type EasingFn } from './displacement-animator'
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
  private skillNames = new Map<string, string>()
  private skillDefsMap = new Map<string, SkillDef>()

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
      if (!skill) return
      this.skillNames.set(skill.id, skill.name)
      this.skillDefsMap.set(skill.id, skill)
      if (!skill.effects) return
      const caster = payload.caster
      const target = caster.target ? this.entityMgr.get(caster.target) : null

      const potencyBonus = this.resolvePotencyBonus(caster, skill)
      this.resolveEffects(skill.effects, caster, target, skill.name, potencyBonus)
    })

    // AoE zone resolved effects
    bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[] }) => {
      const casterId: string | null = payload.zone.casterId
      const caster = casterId ? this.entityMgr.get(casterId) : null
      const skillName: string | undefined = this.skillNames.get(payload.zone.skillId)
      const skillDef = this.skillDefsMap.get(payload.zone.skillId)
      const potencyBonus = caster && skillDef ? this.resolvePotencyBonus(caster, skillDef) : 0

      for (const hit of payload.hitEntities) {
        this.resolveEffects(payload.zone.def.effects, caster, hit, skillName, potencyBonus)
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
    skillName?: string,
    potencyBonus = 0,
  ): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'damage':
          if (!caster || !target) break
          this.applyDamage(caster, target, effect.potency + potencyBonus, skillName)
          break

        case 'apply_buff': {
          // Self-buff: apply to caster; AoE debuff: apply to target
          const buffDef = this.buffDefs.get(effect.buffId)
          if (!buffDef) break
          // Debuffs apply to target, buffs apply to caster (self)
          const buffTarget = buffDef.type === 'debuff' ? target : (caster ?? target)
          if (!buffTarget) break
          const stacks = effect.stacks ?? 1
          this.buffSystem.applyBuff(buffTarget, buffDef, (caster ?? buffTarget).id, stacks, effect.duration)
          break
        }

        case 'consume_buffs':
          if (!caster) break
          for (const buffId of effect.buffIds) {
            this.buffSystem.removeBuff(caster, buffId, 'consumed')
          }
          break

        case 'consume_all_buff_stacks':
          if (!caster) break
          this.buffSystem.removeBuff(caster, effect.buffId, 'consumed')
          break

        case 'consume_buff_stacks':
          if (!caster) break
          this.buffSystem.removeStacks(caster, effect.buffId, effect.stacks)
          break

        case 'restore_mp':
          if (!caster) break
          caster.mp = Math.min(caster.maxMp, caster.mp + Math.floor(caster.maxMp * effect.percent))
          break

        case 'heal': {
          // Heal only applies to friendly targets (same type as caster); otherwise fallback to caster
          const friendlyTarget = (target && caster && target.type === caster.type) ? target : caster
          if (!friendlyTarget) break
          const healAmount = Math.floor((caster?.attack ?? friendlyTarget.attack) * effect.potency)
          friendlyTarget.hp = Math.min(friendlyTarget.maxHp, friendlyTarget.hp + healAmount)
          this.bus.emit('damage:dealt', { source: caster ?? friendlyTarget, target: friendlyTarget, amount: -healAmount, skill: null })
          break
        }

        case 'dash_to_ley_lines': {
          if (!caster) break
          const llCenter = caster.customData.leyLinesCenter as { x: number; y: number } | undefined
          if (!llCenter) break
          this.applyDisplacement(caster, llCenter, 300, EASING.easeOut)
          break
        }

        case 'dash':
          if (!caster || !target) break
          this.applyDisplacement(caster, calcDash(
            { x: caster.position.x, y: caster.position.y },
            { x: target.position.x, y: target.position.y },
            effect.stopDistance ?? caster.autoAttackRange,
          ))
          break

        case 'dash_forward': {
          if (!caster) break
          const rad = (caster.facing * Math.PI) / 180
          this.applyDisplacement(caster, {
            x: caster.position.x + Math.sin(rad) * effect.distance,
            y: caster.position.y + Math.cos(rad) * effect.distance,
          })
          break
        }

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

  /** Calculate bonus potency from per-stack buff scaling */
  private resolvePotencyBonus(caster: Entity, skill: SkillDef): number {
    if (!skill.potencyPerStack) return 0
    const stacks = this.buffSystem.getStacks(caster, skill.potencyPerStack.buffId)
    return stacks * skill.potencyPerStack.bonus
  }

  private applyDamage(caster: Entity, target: Entity, potency: number, skillName?: string): void {
    const vulnerability = this.buffSystem.getVulnerability(target)
    let dmg = calculateDamage({
      attack: caster.attack,
      potency,
      increases: [...this.buffSystem.getDamageIncreases(caster), vulnerability],
      mitigations: this.buffSystem.getMitigations(target),
    })

    // Shield absorption
    dmg = this.buffSystem.absorbShield(target, dmg)

    // Apply damage with undying check
    if (this.buffSystem.isUndying(target)) {
      target.hp = Math.max(1, target.hp - dmg)
    } else {
      target.hp = Math.max(0, target.hp - dmg)
    }

    // MP on hit: restore MP when taking damage
    const mpOnHit = this.buffSystem.getMpOnHit(target)
    if (mpOnHit > 0 && dmg > 0) {
      target.mp = Math.min(target.maxMp, target.mp + mpOnHit)
    }

    this.bus.emit('damage:dealt', { source: caster, target, amount: dmg, skill: skillName ? { name: skillName } : null })

    // Lifesteal: heal caster for % of damage dealt
    const lifesteal = this.buffSystem.getLifesteal(caster)
    if (lifesteal > 0 && dmg > 0) {
      const heal = Math.floor(dmg * lifesteal)
      caster.hp = Math.min(caster.maxHp, caster.hp + heal)
      this.bus.emit('damage:dealt', { source: caster, target: caster, amount: -heal, skill: null })
    }
  }

  private applyDisplacement(entity: Entity, newPos: { x: number; y: number }, duration?: number, easing?: EasingFn): void {
    const clamped = this.arena.clampToWallZones(this.arena.clampPosition(newPos))

    // Forced movement interrupts casting + cancels zones
    if (entity.casting) {
      const skillId = entity.casting.skillId
      this.zoneMgr?.cancelZones(entity.id, skillId)
      entity.casting = null
      entity.gcdTimer = 0
      this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'displacement' })
    }

    if (this.displacer) {
      this.displacer.start(entity, clamped.x, clamped.y, duration, easing)
    } else {
      entity.position.x = clamped.x
      entity.position.y = clamped.y
    }
    this.bus.emit('entity:displaced', { entity, from: null, to: clamped })
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
