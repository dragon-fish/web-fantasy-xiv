import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import type { Entity } from '@/entity/entity'
import type { AoeZoneDef, DamageType, FlurryGuard, SkillDef, SkillEffectDef, BuffDef, Vec2 } from '@/core/types'
import { calculateDamage } from '@/combat/damage'
import { isAlly, isPartyMember, partyMembersNear } from '@/combat/party'
import { applyPeriodicBuff, isPeriodicEffect } from '@/combat/buff-periodic'
import { calcDash, calcBackstep, calcKnockback, calcPull } from '@/combat/displacement'
import { EASING, type EasingFn } from './displacement-animator'
import { matchesCondition } from '@/combat/conditions'
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
  private lifestealRemainders = new WeakMap<Entity, number>()
  /** Attack an NPC's damage is computed from (the party director's budget); heals keep the real stat */
  private npcDamageAttack: ((caster: Entity) => number | null) | null = null

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
    private buffSystem: BuffSystem,
    private arena: Arena,
    private zoneMgr?: AoeZoneManager,
    private displacer?: DisplacementAnimator,
    private gameTimeGetter: () => number = () => 0,
  ) {
    // Zones of a cast can resolve before the cast completes: know the skill from its start
    bus.on('skill:cast_start', ({ skill }: { skill: SkillDef }) => {
      this.skillNames.set(skill.id, skill.name)
      this.skillDefsMap.set(skill.id, skill)
    })

    // Single-target skill effects
    bus.on('skill:cast_complete', (payload: { caster: Entity; skill: SkillDef | any; allyTargetId?: string | null }) => {
      const skill = payload.skill as SkillDef | undefined
      if (!skill) return
      this.skillNames.set(skill.id, skill.name)
      this.skillDefsMap.set(skill.id, skill)
      if (!skill.effects) return
      const caster = payload.caster
      // Friendly skills resolve on the ally locked at cast start, never on the enemy target
      const targetId = skill.allyTarget ? payload.allyTargetId : caster.target
      const target = targetId ? this.entityMgr.get(targetId) : null

      const potencyBonus = this.resolvePotencyBonus(caster, skill)
      const potencyWithBuffIncrease = this.resolvePotencyWithBuff(caster, skill)
      this.resolveEffects(skill.effects, caster, target, skill.name, potencyBonus, [potencyWithBuffIncrease])
    })

    // AoE zone resolved effects
    bus.on('aoe:zone_resolved', (payload: { zone: any; hitEntities: Entity[]; dormantHits?: Entity[] }) => {
      const casterId: string | null = payload.zone.casterId
      const caster = casterId ? this.entityMgr.get(casterId) : null
      const skillName: string | undefined = this.skillNames.get(payload.zone.skillId)
      const skillDef = this.skillDefsMap.get(payload.zone.skillId)
      const potencyBonus = caster && skillDef ? this.resolvePotencyBonus(caster, skillDef) : 0

      const shares = shareFactors(payload.zone.def.share, payload.hitEntities, payload.zone.center)
      payload.hitEntities.forEach((hit, i) => {
        this.resolveEffects(payload.zone.def.effects, caster, hit, skillName, potencyBonus, [], shares[i])
      })
      const revive = (payload.zone.def.effects as SkillEffectDef[]).find(e => e.type === 'revive')
      if (revive) for (const corpse of payload.dormantHits ?? []) this.revive(corpse, caster)
    })

    // Buff end hooks (e.g. a shield that heals when it breaks or runs out)
    bus.on('buff:removed', ({ target, buff }: { target: Entity; buff?: BuffDef }) => {
      if (buff?.onRemove && target.alive) this.resolveEffects(buff.onRemove, target, target, buff.name)
    })
  }

  setNpcDamageAttack(provider: (caster: Entity) => number | null): void {
    this.npcDamageAttack = provider
  }

  /** Restore HP (caster's attack × potency, attack modifiers included); returns the HP actually restored */
  private heal(caster: Entity, target: Entity, potency: number): number {
    const amount = Math.floor(this.buffSystem.getAttack(caster) * potency * (1 + this.buffSystem.getHealIncrease(caster)))
    const restored = Math.min(amount, Math.max(0, target.maxHp - target.hp))
    target.hp = Math.min(target.maxHp, target.hp + amount)
    this.bus.emit('damage:dealt', { source: caster, target, amount: -amount, overheal: amount - restored, skill: null })
    return restored
  }

  /** Apply a registered buff the way skills do (periodic effects get their tick schedule) */
  grantBuff(target: Entity, buffId: string, source: Entity = target, stacks = 1): void {
    const def = this.buffDefs.get(buffId)
    if (!def) {
      console.warn(`[combat] grantBuff: unknown buff def '${buffId}'`)
      return
    }
    if (def.effects.some(isPeriodicEffect)) applyPeriodicBuff(target, def, source, this.gameTimeGetter(), this.buffSystem)
    else this.buffSystem.applyBuff(target, def, source.id, stacks)
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
    extraIncreases: number[] = [],
    /** This target's portion of shared damage (`AoeZoneDef.share`) */
    damageShare = 1,
  ): void {
    for (const effect of effects) {
      if (!matchesCondition(effect.when, target ?? caster)) continue
      switch (effect.type) {
        case 'damage': {
          if (!caster || !target) break
          const potency = (effect.potency + potencyBonus) * damageShare
          if (normalizeDmgType(effect.dmgType).includes('tankbuster')) {
            this.resolveTankbuster(caster, target, effect, potency, skillName, extraIncreases)
            break
          }
          this.applyDamage(caster, target, potency, skillName, normalizeDmgType(effect.dmgType), extraIncreases, { noRevive: effect.noRevive, hits: effect.hits })
          break
        }

        case 'apply_buff': {
          const buffDef = this.buffDefs.get(effect.buffId)
          if (!buffDef) {
            console.warn(`[combat] apply_buff: unknown buff def '${effect.buffId}'`)
            break
          }
          // Explicit target routing takes priority; otherwise fall back to
          // type-based inference (debuff → target, buff → caster).
          let buffTarget: Entity | null | undefined
          if (effect.target === 'target') {
            buffTarget = target
          } else if (effect.target === 'caster') {
            buffTarget = caster
          } else {
            buffTarget = buffDef.type === 'debuff' ? target : (caster ?? target)
          }
          if (!buffTarget) break
          const sourceCaster = caster ?? buffTarget
          const hasPeriodic = buffDef.effects.some(isPeriodicEffect)
          if (hasPeriodic) {
            applyPeriodicBuff(buffTarget, buffDef, sourceCaster, this.gameTimeGetter(), this.buffSystem)
          } else {
            const stacks = effect.stacks ?? 1
            this.buffSystem.applyBuff(buffTarget, buffDef, sourceCaster.id, stacks, effect.duration)
          }
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
          // Heal only applies to allies; otherwise it falls back to the caster
          const friendlyTarget = (target && caster && isAlly(caster, target)) ? target : caster
          if (!friendlyTarget) break
          this.heal(caster ?? friendlyTarget, friendlyTarget, effect.potency)
          break
        }

        case 'party_heal': {
          if (!caster) break
          let effective = false
          for (const member of partyMembersNear(caster, this.entityMgr.getAll(), effect.radius)) {
            if (this.heal(caster, member, effect.potency) > 0) effective = true
          }
          if (effective && effect.onEffective) this.resolveEffects(effect.onEffective, caster, caster, skillName)
          break
        }

        case 'party_buff': {
          if (!caster) break
          for (const member of partyMembersNear(caster, this.entityMgr.getAll(), effect.radius)) this.grantBuff(member, effect.buffId, caster)
          break
        }

        case 'raise': {
          if (!target || target.alive || !isPartyMember(target)) break
          target.alive = true
          target.hp = Math.max(1, Math.floor(target.maxHp * effect.hpPercent))
          this.bus.emit('party:raised', { entity: target, by: caster })
          break
        }

        case 'dash_to_ley_lines': {
          if (!caster) break
          const llCenter = caster.customData.leyLinesCenter as { x: number; y: number } | undefined
          if (!llCenter) break
          this.applyDisplacement(caster, llCenter, 500, EASING.easeOut)
          break
        }

        case 'dash':
          if (!caster || !target) break
          // FFXIV gap closers land just inside the target ring (hitbox edge - 0.1m)
          this.applyDisplacement(caster, calcDash(
            { x: caster.position.x, y: caster.position.y },
            { x: target.position.x, y: target.position.y },
            // calcDash already stops 0.1m short of the given distance
            Math.max(0, (target.size ?? 0) + (effect.stopDistance ?? 0)),
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
          if (this.buffSystem.isInvulnerable(target)) break
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
          if (this.buffSystem.isInvulnerable(target)) break
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

  /** Display name for zones spawned directly by mechanics (no skill cast to learn it from). */
  nameSkill(skillId: string, name: string): void {
    this.skillNames.set(skillId, name)
  }

  /** Wake a dormant entity (corpse) — it becomes a live, targetable combatant. */
  revive(entity: Entity, by: Entity | null | undefined): void {
    if (!entity.dormant || !entity.alive) return
    entity.dormant = false
    entity.visible = true
    entity.targetable = true
    entity.hp = entity.maxHp
    this.bus.emit('entity:revived', { entity, by: by ?? null })
  }

  /** Calculate bonus potency from per-stack buff scaling */
  private resolvePotencyBonus(caster: Entity, skill: SkillDef): number {
    if (!skill.potencyPerStack) return 0
    const stacks = this.buffSystem.getStacks(caster, skill.potencyPerStack.buffId)
    return stacks * skill.potencyPerStack.bonus
  }

  /** Consume 1 buff stack for additive damage increase + optional MP restore */
  private resolvePotencyWithBuff(caster: Entity, skill: SkillDef): number {
    if (!skill.potencyWithBuff) return 0
    const { buffId, damageIncrease, consumeStack, restoreMp } = skill.potencyWithBuff
    const stacks = this.buffSystem.getStacks(caster, buffId)
    if (stacks <= 0) return 0
    if (consumeStack) {
      this.buffSystem.removeStacks(caster, buffId, 1)
    }
    if (restoreMp && restoreMp > 0) {
      caster.mp = Math.min(caster.maxMp, caster.mp + restoreMp)
    }
    return damageIncrease
  }

  /**
   * A tankbuster is spent on the target's parry stance when it holds one (the stance decides the
   * damage, guard and reward); otherwise it lands in full and the tankbuster's own `onUnparried` applies.
   */
  private resolveTankbuster(caster: Entity, target: Entity, effect: Extract<SkillEffectDef, { type: 'damage' }>, potency: number, skillName: string | undefined, extraIncreases: number[]): void {
    const dmgTypes = normalizeDmgType(effect.dmgType)
    const parry = this.buffSystem.getParry(target)
    if (!parry) {
      this.bus.emit('combat:parry', { sourceId: caster.id, targetId: target.id, guard: 'none' })
      this.applyDamage(caster, target, potency, skillName, dmgTypes, extraIncreases, { noRevive: effect.noRevive, hits: effect.hits })
      if (effect.onUnparried) this.resolveEffects(effect.onUnparried, caster, target, skillName)
      return
    }
    this.buffSystem.removeBuff(target, parry.defId, 'consumed')
    this.bus.emit('combat:parry', { sourceId: caster.id, targetId: target.id, guard: parry.guard })
    if (parry.damageTaken > 0) {
      this.applyDamage(caster, target, potency * parry.damageTaken, skillName, dmgTypes, extraIncreases, { noRevive: effect.noRevive, hits: effect.hits, guard: parry.guard })
    } else if ((effect.hits ?? 1) > 1) {
      this.bus.emit('combat:flurry', { sourceId: caster.id, targetId: target.id, hits: effect.hits, guard: parry.guard })
    }
    const reward = parry.grantBuff ? this.buffDefs.get(parry.grantBuff) : undefined
    if (reward) this.buffSystem.applyBuff(target, reward, caster.id)
  }

  /**
   * Shared damage entry point for timeline skills and simulated projectile hits.
   * `feedback.hits` > 1 also announces `combat:flurry` (presentation of a multi-hit attack); its guard
   * follows the target's defences unless `feedback.guard` overrides it.
   */
  applyDamage(caster: Entity, target: Entity, potency: number, skillName?: string, dmgTypes: DamageType[] = [], extraIncreases: number[] = [], feedback: { isCritical?: boolean; noRevive?: boolean; hits?: number; guard?: FlurryGuard } = {}): void {
    const flurry = (guard: FlurryGuard) => {
      if ((feedback.hits ?? 1) > 1) this.bus.emit('combat:flurry', { sourceId: caster.id, targetId: target.id, hits: feedback.hits, guard: feedback.guard ?? guard })
    }
    // Invulnerable / damage immunity: negate all non-special damage
    if (!dmgTypes.includes('special') && (this.buffSystem.isInvulnerable(target) || this.buffSystem.hasDamageImmunity(target))) {
      flurry('deflect')
      this.bus.emit('damage:invulnerable', { source: caster, target, skill: skillName ? { name: skillName } : null })
      return
    }
    // Mitigation or a shield up when the attack lands = a guarded flurry
    const guarded = !dmgTypes.includes('special')
      && (this.buffSystem.getMitigations(target).length > 0 || this.buffSystem.getShieldTotal(target) > 0)

    let dmg: number
    // Freeze caster's derived attack (base × attack_modifier) once per hit so
    // both branches reference the same value.
    const casterAttack = (caster.npc ? this.npcDamageAttack?.(caster) : null) ?? this.buffSystem.getAttack(caster)
    if (dmgTypes.includes('special')) {
      // Special damage: ignores mitigation, shields, and undying
      dmg = Math.floor(casterAttack * potency)
      target.hp = Math.max(0, target.hp - dmg)
    } else {
      const vulnerability = this.buffSystem.getVulnerability(target)
      dmg = calculateDamage({
        attack: casterAttack,
        potency,
        increases: [...this.buffSystem.getDamageIncreases(caster), vulnerability, ...extraIncreases],
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
    }

    // MP on hit: restore MP when taking damage
    const mpOnHit = this.buffSystem.getMpOnHit(target)
    if (mpOnHit > 0 && dmg > 0) {
      target.mp = Math.min(target.maxMp, target.mp + mpOnHit)
    }

    flurry(guarded ? 'block' : 'none')
    this.bus.emit('damage:dealt', { source: caster, target, amount: dmg, skill: skillName ? { name: skillName } : null, isCritical: feedback.isCritical ?? false, noRevive: feedback.noRevive ?? false, hits: feedback.hits })

    // Lifesteal: heal caster for % of damage dealt
    const lifesteal = this.buffSystem.getLifesteal(caster)
    if (lifesteal > 0 && dmg > 0) {
      if (caster.hp >= caster.maxHp) {
        this.lifestealRemainders.delete(caster)
        return
      }
      // Carry sub-HP healing across hits; normalize floating-point sums before flooring.
      const total = Math.round(((this.lifestealRemainders.get(caster) ?? 0) + dmg * lifesteal) * 1e9) / 1e9
      const whole = Math.floor(total)
      const heal = Math.min(whole, caster.maxHp - caster.hp)
      caster.hp += heal
      this.lifestealRemainders.set(caster, caster.hp >= caster.maxHp ? 0 : total - whole)
      if (heal > 0) this.bus.emit('damage:dealt', { source: caster, target: caster, amount: -heal, skill: null })
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

function normalizeDmgType(raw?: DamageType | DamageType[]): DamageType[] {
  if (!raw) return []
  return Array.isArray(raw) ? raw : [raw]
}

/**
 * Each hit entity's portion of shared damage. `even`: 1/n each. `{ front }`: the one nearest the
 * zone origin takes `front`, the rest split the remainder; a lone target takes it all.
 */
export function shareFactors(share: AoeZoneDef['share'], hits: Entity[], origin: Vec2): number[] {
  const n = hits.length
  if (!share || n <= 1) return hits.map(() => 1)
  if (share === 'even') return hits.map(() => 1 / n)
  let front = 0
  let best = Infinity
  hits.forEach((e, i) => {
    const d = Math.hypot(e.position.x - origin.x, e.position.y - origin.y)
    if (d < best) { best = d; front = i }
  })
  return hits.map((_, i) => (i === front ? share.front : (1 - share.front) / (n - 1)))
}
