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
  /** All entities that have ever used a skill (need GCD/casting ticks) */
  private trackedEntities = new Map<string, Entity>()

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
    this.trackedEntities.set(caster.id, caster)

    // Dead: block everything
    if (!caster.alive) return false

    // Stunned: block everything
    if (this.buffSystem.isStunned(caster)) return false

    // Casting: block if still casting, but force-complete if within 1 logic tick
    // This handles frame alignment desync (e.g. 3000ms cast needs 188×16=3008ms)
    if (caster.casting) {
      const remaining = caster.casting.castTime - caster.casting.elapsed
      if (remaining <= 20) {
        this.completeCast(caster)
      } else {
        return false
      }
    }

    // Silence blocks weaponskills and spells
    if (skill.type !== 'ability' && this.buffSystem.isSilenced(caster)) return false

    // GCD check (only for skills with gcd flag)
    if (skill.gcd && caster.gcdTimer > 0) return false

    // Independent cooldown check
    if (skill.cooldown > 0 && this.getCooldown(caster.id, skill.id) > 0) return false

    // MP check (buff can absorb cost)
    const mpAbsorbed = skill.mpCost > 0
      && skill.mpCostAbsorbBuff
      && this.buffSystem.hasBuff(caster, skill.mpCostAbsorbBuff)
    if (skill.mpCost > 0 && !mpAbsorbed && caster.mp < skill.mpCost) return false

    // HP cost check (swap buff converts to MP cost, reverse buff makes it free)
    if (skill.hpCost && skill.hpCost > 0) {
      const reversed = skill.hpCostReverseBuff && this.buffSystem.hasBuff(caster, skill.hpCostReverseBuff)
      const swapped = !reversed && skill.hpCostSwapBuff && this.buffSystem.hasBuff(caster, skill.hpCostSwapBuff)
      if (reversed) {
        // Free — will heal instead
      } else if (swapped) {
        if (caster.mp < skill.hpCost) return false
      } else {
        if (caster.hp <= skill.hpCost) return false
      }
    }

    // Required buffs check
    if (skill.requiresBuffs && skill.requiresBuffs.length > 0) {
      for (const buffId of skill.requiresBuffs) {
        if (!this.buffSystem.hasBuff(caster, buffId)) return false
      }
    }

    // Required buff stacks check
    if (skill.requiresBuffStacks) {
      const { buffId, stacks } = skill.requiresBuffStacks
      if (this.buffSystem.getStacks(caster, buffId) < stacks) return false
    }

    // Target check
    if (skill.requiresTarget) {
      const target = caster.target ? this.entityMgr.get(caster.target) : null
      if (!target || !target.alive) return false
      if (skill.range > 0 && distance(caster.position, target.position) > skill.range) return false
    }

    // Resolve actual cast time (may be overridden by buff, then reduced by haste)
    let actualCastTime = skill.castTime
    // Cached next_cast_instant buff id to consume after the instant cast resolves.
    // Deferred consumption ensures an interrupted/failed apply keeps the buff.
    let consumeSwiftBuffId: string | null = null

    if (skill.castTimeWithBuff && this.buffSystem.hasBuff(caster, skill.castTimeWithBuff.buffId)) {
      actualCastTime = skill.castTimeWithBuff.castTime
      if (skill.castTimeWithBuff.consumeStack) {
        this.buffSystem.removeStacks(caster, skill.castTimeWithBuff.buffId, 1)
      }
    } else if (skill.type === 'spell') {
      // next_cast_instant: scan caster buffs for the effect (priority below castTimeWithBuff)
      const swiftInst = caster.buffs.find((b) => {
        const def = this.buffSystem.getDef(b.defId)
        return def?.effects.some((e) => e.type === 'next_cast_instant')
      })
      if (swiftInst) {
        const def = this.buffSystem.getDef(swiftInst.defId)!
        const effect = def.effects.find((e) => e.type === 'next_cast_instant') as {
          type: 'next_cast_instant'
          consumeOnCast: boolean
        }
        actualCastTime = 0
        if (effect.consumeOnCast) {
          consumeSwiftBuffId = swiftInst.defId
        }
      }
    }

    const haste = this.buffSystem.getHaste(caster)
    if (haste > 0 && actualCastTime > 0) {
      actualCastTime = Math.round(actualCastTime * (1 - haste))
    }

    // Execute
    if (skill.type === 'spell' && actualCastTime > 0) {
      return this.startCast(caster, skill, actualCastTime)
    }
    // Instant path: consume next_cast_instant buff right before resolveImmediate
    if (consumeSwiftBuffId) {
      this.buffSystem.removeBuff(caster, consumeSwiftBuffId, 'consumed')
    }
    return this.resolveImmediate(caster, skill)
  }

  private startCast(caster: Entity, skill: SkillDef, actualCastTime?: number): boolean {
    // Auto-face target when starting a cast
    if (caster.target && skill.requiresTarget) {
      const targetEntity = this.entityMgr.get(caster.target)
      if (targetEntity) {
        caster.facing = this.facingToward(caster, targetEntity)
      }
    }

    caster.casting = {
      skillId: skill.id,
      targetId: caster.target,
      elapsed: 0,
      castTime: actualCastTime ?? skill.castTime,
    }

    if (skill.gcd) {
      caster.gcdTimer = this.getHastedGcd(caster)
    }

    // Spawn AoE zones immediately at cast start (telegraph shows during cast)
    this.spawnZones(caster, skill)

    this.bus.emit('skill:cast_start', { caster, skill, target: caster.target })
    return true
  }

  private resolveImmediate(caster: Entity, skill: SkillDef): boolean {
    // Deduct costs
    this.deductMpCost(caster, skill)
    this.deductHpCost(caster, skill)

    if (skill.gcd) {
      caster.gcdTimer = this.getHastedGcd(caster)
    }

    if (skill.cooldown > 0) {
      this.setCooldown(caster.id, skill.id, skill.cooldown)
    }

    // Auto-face target when using a targeted skill
    const targetEntity = caster.target ? this.entityMgr.get(caster.target) : null
    if (targetEntity && skill.requiresTarget) {
      caster.facing = this.facingToward(caster, targetEntity)
    }

    this.spawnZones(caster, skill)
    this.bus.emit('skill:cast_complete', { caster, skill })
    return true
  }

  private spawnZones(caster: Entity, skill: SkillDef): void {
    if (!skill.zones || skill.zones.length === 0) return

    const targetEntity = caster.target ? this.entityMgr.get(caster.target) : null
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

  private facingToward(from: Entity, to: Entity): number {
    const dx = to.position.x - from.position.x
    const dy = to.position.y - from.position.y
    return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  }

  interruptCast(entity: Entity): void {
    if (!entity.casting) return
    const skillId = entity.casting.skillId
    // Cancel any zones spawned by this cast (telegraph only, not yet resolved)
    this.zoneMgr.cancelZones(entity.id, skillId)
    entity.casting = null
    entity.gcdTimer = 0
    this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'interrupted' })
  }

  /** Tick GCD, casting, and cooldowns for ALL tracked entities */
  updateAll(dt: number): void {
    for (const entity of this.trackedEntities.values()) {
      this.update(entity, dt)
      this.updateCooldowns(entity, dt)
    }
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
        this.zoneMgr.cancelZones(entity.id, skillId)
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'target_lost' })
        return
      }
      if (distance(entity.position, target.position) > skill.range) {
        this.zoneMgr.cancelZones(entity.id, skillId)
        this.bus.emit('skill:cast_interrupted', { caster: entity, skillId, reason: 'out_of_range' })
        return
      }
    }

    // Zones were already spawned at cast start (startCast),
    // so we only emit completion here.
    // Deduct costs on successful cast completion
    if (skill) {
      this.deductMpCost(entity, skill)
      this.deductHpCost(entity, skill)
    }

    this.bus.emit('skill:cast_complete', { caster: entity, skill })
  }

  private getHastedGcd(caster: Entity): number {
    const haste = this.buffSystem.getHaste(caster)
    return haste > 0 ? Math.round(caster.gcdDuration * (1 - haste)) : caster.gcdDuration
  }

  /** Deduct MP cost, or consume 1 stack of absorb buff instead */
  private deductMpCost(caster: Entity, skill: SkillDef): void {
    if (skill.mpCost <= 0) return
    if (skill.mpCostAbsorbBuff && this.buffSystem.hasBuff(caster, skill.mpCostAbsorbBuff)) {
      this.buffSystem.removeStacks(caster, skill.mpCostAbsorbBuff, 1)
    } else {
      caster.mp -= skill.mpCost
    }
  }

  /** Deduct HP cost, swap to MP, or reverse to heal */
  private deductHpCost(caster: Entity, skill: SkillDef): void {
    if (!skill.hpCost || skill.hpCost <= 0) return
    const reversed = skill.hpCostReverseBuff && this.buffSystem.hasBuff(caster, skill.hpCostReverseBuff)
    if (reversed) {
      caster.hp = Math.min(caster.maxHp, caster.hp + skill.hpCost)
      return
    }
    const swapped = skill.hpCostSwapBuff && this.buffSystem.hasBuff(caster, skill.hpCostSwapBuff)
    if (swapped) {
      caster.mp -= skill.hpCost
    } else {
      caster.hp -= skill.hpCost
    }
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
