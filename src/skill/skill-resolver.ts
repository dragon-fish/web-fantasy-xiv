// src/skill/skill-resolver.ts
import type { SkillDef, Vec2 } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { AoeZoneManager } from '@/skill/aoe-zone'
import type { Entity } from '@/entity/entity'

export const GCD_DURATION = 2500 // ms

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

export class SkillResolver {
  /** entity id → skill id → remaining cooldown ms */
  private cooldowns = new Map<string, Map<string, number>>()
  private skillDefs = new Map<string, SkillDef>()

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
    private buffSystem: BuffSystem,
    private zoneMgr: AoeZoneManager,
  ) {}

  registerSkill(def: SkillDef): void {
    this.skillDefs.set(def.id, def)
  }

  tryUse(caster: Entity, skill: SkillDef): boolean {
    this.registerSkill(skill)

    // Stunned: block everything
    if (this.buffSystem.isStunned(caster)) return false

    // Casting: block everything
    if (caster.casting) return false

    // Silence blocks weaponskills and spells
    if (skill.type !== 'ability' && this.buffSystem.isSilenced(caster)) return false

    // GCD check (only for skills with gcd flag)
    if (skill.gcd && caster.gcdTimer > 0) return false

    // Independent cooldown check
    if (skill.cooldown > 0 && this.getCooldown(caster.id, skill.id) > 0) return false

    // Range check for skills that require a target (single or AoE with range > 0)
    if (skill.range > 0) {
      const target = caster.target ? this.entityMgr.get(caster.target) : null
      if (!target || !target.alive) return false
      if (distance(caster.position, target.position) > skill.range) return false
    }

    // Execute
    if (skill.type === 'spell' && skill.castTime > 0) {
      return this.startCast(caster, skill)
    }
    return this.resolveImmediate(caster, skill)
  }

  private startCast(caster: Entity, skill: SkillDef): boolean {
    // Auto-face target when starting a cast
    if (caster.target && skill.range > 0) {
      const targetEntity = this.entityMgr.get(caster.target)
      if (targetEntity) {
        caster.facing = this.facingToward(caster, targetEntity)
      }
    }

    caster.casting = {
      skillId: skill.id,
      targetId: caster.target,
      elapsed: 0,
      castTime: skill.castTime,
    }

    if (skill.gcd) {
      caster.gcdTimer = GCD_DURATION
    }

    this.bus.emit('skill:cast_start', { caster, skill, target: caster.target })
    return true
  }

  private resolveImmediate(caster: Entity, skill: SkillDef): boolean {
    if (skill.gcd) {
      caster.gcdTimer = GCD_DURATION
    }

    if (skill.cooldown > 0) {
      this.setCooldown(caster.id, skill.id, skill.cooldown)
    }

    // Auto-face target when using a targeted skill
    const targetEntity = caster.target ? this.entityMgr.get(caster.target) : null
    if (targetEntity && skill.range > 0) {
      caster.facing = this.facingToward(caster, targetEntity)
    }

    // Spawn AoE zones
    if (skill.zones && skill.zones.length > 0) {
      const targetPos: Vec2 | null = targetEntity
        ? { x: targetEntity.position.x, y: targetEntity.position.y }
        : null

      for (const zoneDef of skill.zones) {
        this.zoneMgr.spawn(
          zoneDef,
          skill.id,
          { x: caster.position.x, y: caster.position.y },
          caster.facing,
          targetPos,
          caster.id,
        )
      }
    }

    this.bus.emit('skill:cast_complete', { caster, skill })
    return true
  }

  private facingToward(from: Entity, to: Entity): number {
    const dx = to.position.x - from.position.x
    const dy = to.position.y - from.position.y
    return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  }

  interruptCast(entity: Entity): void {
    if (!entity.casting) return
    const skillId = entity.casting.skillId
    entity.casting = null
    entity.gcdTimer = 0
    this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'interrupted' })
  }

  update(entity: Entity, dt: number): void {
    // Tick GCD
    if (entity.gcdTimer > 0) {
      entity.gcdTimer = Math.max(0, entity.gcdTimer - dt)
    }

    // Tick casting
    if (entity.casting) {
      entity.casting.elapsed += dt
      if (entity.casting.elapsed >= entity.casting.castTime) {
        this.completeCast(entity)
      }
    }
  }

  updateCooldowns(entity: Entity, dt: number): void {
    const cds = this.cooldowns.get(entity.id)
    if (!cds) return
    const expired: string[] = []
    for (const [skillId, remaining] of cds) {
      const next = remaining - dt
      if (next <= 0) {
        expired.push(skillId)
      } else {
        cds.set(skillId, next)
      }
    }
    for (const id of expired) {
      cds.delete(id)
    }
  }

  private completeCast(entity: Entity): void {
    if (!entity.casting) return

    const { skillId, targetId } = entity.casting
    entity.casting = null

    const skill = this.skillDefs.get(skillId)

    // Second validation: target still alive and in range?
    if (targetId && skill && skill.range > 0) {
      const target = this.entityMgr.get(targetId)
      if (!target || !target.alive) {
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'target_lost' })
        return
      }
      if (distance(entity.position, target.position) > skill.range) {
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'out_of_range' })
        return
      }
    }

    // Spawn AoE zones if any
    if (skill?.zones && skill.zones.length > 0) {
      const targetEntity = targetId ? this.entityMgr.get(targetId) : null
      const targetPos: Vec2 | null = targetEntity
        ? { x: targetEntity.position.x, y: targetEntity.position.y }
        : null

      for (const zoneDef of skill.zones) {
        this.zoneMgr.spawn(
          zoneDef,
          skillId,
          { x: entity.position.x, y: entity.position.y },
          entity.facing,
          targetPos,
          entity.id,
        )
      }
    }

    this.bus.emit('skill:cast_complete', { caster: entity, skill })
  }

  getCooldown(entityId: string, skillId: string): number {
    return this.cooldowns.get(entityId)?.get(skillId) ?? 0
  }

  private setCooldown(entityId: string, skillId: string, duration: number): void {
    if (!this.cooldowns.has(entityId)) {
      this.cooldowns.set(entityId, new Map())
    }
    this.cooldowns.get(entityId)!.set(skillId, duration)
  }
}
