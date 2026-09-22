// src/combat/buff.ts
import type { BuffDef, BuffEffectDef } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { Entity, BuffInstance } from '@/entity/entity'

export class BuffSystem {
  private defs = new Map<string, BuffDef>()

  constructor(private bus: EventBus) {}

  /** Access the event bus for external modules needing to emit buff-related events. */
  get eventBus(): EventBus {
    return this.bus
  }

  registerDef(def: BuffDef): void {
    this.defs.set(def.id, def)
  }

  getDef(id: string): BuffDef | undefined {
    return this.defs.get(id)
  }

  applyBuff(entity: Entity, def: BuffDef, sourceId: string, addStacks = 1, durationOverride?: number): void {
    this.registerDef(def)

    // Add 0.5s grace period to all timed buffs.
    // Without this, a 15s buff with 2.5s GCD requires frame-perfect input
    // to land the 6th GCD at exactly 15.0s. The extra 0.5s ensures the last
    // action within the intended window always goes through.
    const baseDuration = durationOverride ?? def.duration
    const effectiveDuration = baseDuration > 0 ? baseDuration + (def.durationGrace ?? 500) : 0

    const existing = entity.buffs.find((b) => b.defId === def.id)

    // Shield buffs: stacks = shield HP.
    // Permanent (duration=0): replace only if new shield has more stacks.
    // Timed: replace only if new shield has both more stacks AND more duration.
    if (def.shield) {
      if (existing) {
        const amountBetter = existing.stacks < addStacks
        const durationBetter = effectiveDuration === 0 || existing.remaining < effectiveDuration
        if (amountBetter && durationBetter) {
          existing.stacks = addStacks
          existing.remaining = effectiveDuration
          existing.sourceId = sourceId
        }
      } else {
        entity.buffs.push({ defId: def.id, sourceId, remaining: effectiveDuration, stacks: addStacks })
        this.bus.emit('buff:applied', { target: entity, buff: def, source: sourceId })
        this.syncModifiers(entity)
      }
      return
    }

    if (existing && !def.stackable) {
      // Non-stackable: just refresh duration (take longer)
      existing.remaining = Math.max(existing.remaining, effectiveDuration)
      existing.sourceId = sourceId
      return
    }
    if (existing && def.stackable) {
      // Stackable: add stacks (capped), refresh duration (take longer)
      existing.stacks = Math.min(existing.stacks + addStacks, def.maxStacks)
      existing.remaining = Math.max(existing.remaining, effectiveDuration)
      existing.sourceId = sourceId
      this.syncModifiers(entity)
      return
    }

    entity.buffs.push({
      defId: def.id,
      sourceId,
      remaining: effectiveDuration,
      stacks: Math.min(addStacks, def.maxStacks),
    })

    this.bus.emit('buff:applied', { target: entity, buff: def, source: sourceId })
    this.syncModifiers(entity)
  }

  hasBuff(entity: Entity, defId: string): boolean {
    return entity.buffs.some((b) => b.defId === defId)
  }

  getStacks(entity: Entity, defId: string): number {
    return entity.buffs.find((b) => b.defId === defId)?.stacks ?? 0
  }

  /** Remove up to `count` stacks. Returns number actually removed. Removes buff if stacks reach 0. */
  removeStacks(entity: Entity, defId: string, count: number): number {
    const inst = entity.buffs.find((b) => b.defId === defId)
    if (!inst) return 0
    const removed = Math.min(inst.stacks, count)
    inst.stacks -= removed
    if (inst.stacks <= 0) {
      this.removeBuff(entity, defId, 'consumed')
    }
    return removed
  }

  removeBuff(entity: Entity, defId: string, reason: string): void {
    const idx = entity.buffs.findIndex((b) => b.defId === defId)
    if (idx === -1) return
    entity.buffs.splice(idx, 1)
    this.syncModifiers(entity)
    this.bus.emit('buff:removed', { target: entity, buff: this.defs.get(defId), reason })
  }

  /**
   * Remove all buffs from entity where `preserveOnDeath !== true`.
   * Intended to be called on entity death (wired in from battle-runner's
   * death-window handling in a later task).
   *
   * Phase 5 has no visible consumer scenario: the echo buff is bound to scene
   * lifetime (destroyed on scene dispose) and retry re-spawns a fresh entity
   * with empty buffs. This hook exists as a contract reservation for future
   * raise / in-combat respawn systems, so the `preserveOnDeath` flag has a
   * single canonical enforcement site.
   */
  clearDeathBuffs(entity: Entity): void {
    entity.buffs = entity.buffs.filter((inst) => {
      const def = this.defs.get(inst.defId)
      return def?.preserveOnDeath === true
    })
    this.syncModifiers(entity)
  }

  update(entity: Entity, dt: number): void {
    let changed = false
    for (let i = entity.buffs.length - 1; i >= 0; i--) {
      const inst = entity.buffs[i]
      if (inst.remaining === 0) continue // permanent
      inst.remaining = Math.max(0, inst.remaining - dt)
      if (inst.remaining <= 0) {
        entity.buffs.splice(i, 1)
        changed = true
        this.bus.emit('buff:removed', {
          target: entity,
          buff: this.defs.get(inst.defId),
          reason: 'expired',
        })
      }
    }
    if (changed) this.syncModifiers(entity)
  }

  private collectEffects(entity: Entity): { def: BuffDef; inst: BuffInstance; effect: BuffEffectDef }[] {
    const result: { def: BuffDef; inst: BuffInstance; effect: BuffEffectDef }[] = []
    for (const inst of entity.buffs) {
      const def = this.defs.get(inst.defId)
      if (!def) continue
      for (const effect of def.effects) {
        result.push({ def, inst, effect })
      }
    }
    return result
  }

  getMitigations(entity: Entity): number[] {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'mitigation')
      .map((e) => (e.effect as { type: 'mitigation'; value: number }).value)
  }

  getDamageIncreases(entity: Entity): number[] {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'damage_increase')
      .map((e) => (e.effect as { type: 'damage_increase'; value: number }).value)
  }

  getAttackModifier(entity: Entity): number {
    const raw = this.collectEffects(entity)
      .filter((e) => e.effect.type === 'attack_modifier')
      .reduce((sum, e) => sum + (e.effect as { type: 'attack_modifier'; value: number }).value * e.inst.stacks, 0)
    return Math.round(raw * 10000) / 10000
  }

  getMaxHpModifier(entity: Entity): number {
    const raw = this.collectEffects(entity)
      .filter((e) => e.effect.type === 'max_hp_modifier')
      .reduce((sum, e) => sum + (e.effect as { type: 'max_hp_modifier'; value: number }).value * e.inst.stacks, 0)
    return Math.round(raw * 10000) / 10000
  }

  /**
   * Derived attack = baseAttack × (1 + sum of attack_modifier effects).
   * Delegates to entity.attack getter which reads the synced `attackModifier` field.
   */
  getAttack(entity: Entity): number {
    return entity.attack
  }

  /**
   * Derived maxHp = baseMaxHp × (1 + sum of max_hp_modifier effects).
   * Delegates to entity.maxHp getter which reads the synced `maxHpModifier` field.
   */
  getMaxHp(entity: Entity): number {
    return entity.maxHp
  }

  private syncModifiers(entity: Entity): void {
    entity.attackModifier = this.getAttackModifier(entity)
    entity.maxHpModifier = this.getMaxHpModifier(entity)
    if (entity.hp > entity.maxHp) entity.hp = entity.maxHp
    if (entity.maxHp <= 0 && entity.alive) {
      entity.hp = 0
      entity.mp = 0
      entity.alive = false
      this.bus.emit('entity:died', { entity })
    }
  }

  /** Get total vulnerability on target (additive, per-stack × stacks) */
  getVulnerability(entity: Entity): number {
    let total = 0
    for (const { inst, effect } of this.collectEffects(entity)) {
      if (effect.type === 'vulnerability') {
        total += (effect as { type: 'vulnerability'; value: number }).value * inst.stacks
      }
    }
    return total
  }

  isSilenced(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'silence')
  }

  isStunned(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'stun')
  }

  /** Get total haste value (reduces cast time, GCD, AA interval). Takes highest single source. */
  getHaste(entity: Entity): number {
    const values = this.collectEffects(entity)
      .filter((e) => e.effect.type === 'haste')
      .map((e) => (e.effect as { type: 'haste'; value: number }).value)
    return values.length > 0 ? Math.max(...values) : 0
  }

  /** Check if entity has undying buff (HP cannot drop below 1) */
  isUndying(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'undying')
  }

  /** Check if entity has invulnerable buff (all non-special attacks negated) */
  isInvulnerable(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'invulnerable')
  }

  /** Check if entity has damage immunity (damage negated, displacement still applies) */
  hasDamageImmunity(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'damage_immunity')
  }

  /** Get total lifesteal value (sum of all sources) */
  getLifesteal(entity: Entity): number {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'lifesteal')
      .reduce((sum, e) => sum + (e.effect as { type: 'lifesteal'; value: number }).value, 0)
  }

  /** Get MP restored when taking damage (sum of all sources) */
  getMpOnHit(entity: Entity): number {
    return this.collectEffects(entity)
      .filter((e) => e.effect.type === 'mp_on_hit')
      .reduce((sum, e) => sum + (e.effect as { type: 'mp_on_hit'; value: number }).value, 0)
  }

  /** Absorb damage with shield buffs (stacks = shield HP). Returns damage remaining after absorption. */
  absorbShield(entity: Entity, damage: number): number {
    let remaining = damage
    let changed = false
    for (let i = entity.buffs.length - 1; i >= 0; i--) {
      if (remaining <= 0) break
      const inst = entity.buffs[i]
      const def = this.defs.get(inst.defId)
      if (!def?.shield) continue
      const absorbed = Math.min(inst.stacks, remaining)
      inst.stacks -= absorbed
      remaining -= absorbed
      if (inst.stacks <= 0) {
        entity.buffs.splice(i, 1)
        changed = true
        this.bus.emit('buff:removed', { target: entity, buff: def, reason: 'shield_broken' })
      }
    }
    if (changed) this.syncModifiers(entity)
    return remaining
  }

  /** Get total shield HP across all shield buffs on entity */
  getShieldTotal(entity: Entity): number {
    let total = 0
    for (const inst of entity.buffs) {
      const def = this.defs.get(inst.defId)
      if (def?.shield) total += inst.stacks
    }
    return total
  }

  getSpeedModifier(entity: Entity): number {
    const mods = this.collectEffects(entity)
      .filter((e) => e.effect.type === 'speed_modify')
      .map((e) => (e.effect as { type: 'speed_modify'; value: number }).value)

    const increases = mods.filter((v) => v > 0)
    const decreases = mods.filter((v) => v < 0)

    // Only take highest increase, sum all decreases
    const maxIncrease = increases.length > 0 ? Math.max(...increases) : 0
    const totalDecrease = decreases.reduce((sum, v) => sum + v, 0)

    return maxIncrease + totalDecrease
  }
}
