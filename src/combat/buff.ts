// src/combat/buff.ts
import type { BuffDef, BuffEffectDef } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { Entity, BuffInstance } from '@/entity/entity'

export class BuffSystem {
  private defs = new Map<string, BuffDef>()

  constructor(private bus: EventBus) {}

  registerDef(def: BuffDef): void {
    this.defs.set(def.id, def)
  }

  applyBuff(entity: Entity, def: BuffDef, sourceId: string): void {
    this.registerDef(def)

    const existing = entity.buffs.find((b) => b.defId === def.id)
    if (existing && !def.stackable) {
      // Refresh duration
      existing.remaining = def.duration
      existing.sourceId = sourceId
      return
    }
    if (existing && def.stackable && existing.stacks < def.maxStacks) {
      existing.stacks++
      existing.remaining = def.duration
      return
    }

    entity.buffs.push({
      defId: def.id,
      sourceId,
      remaining: def.duration,
      stacks: 1,
    })

    this.bus.emit('buff:applied', { target: entity, buff: def, source: sourceId })
  }

  removeBuff(entity: Entity, defId: string, reason: string): void {
    const idx = entity.buffs.findIndex((b) => b.defId === defId)
    if (idx === -1) return
    entity.buffs.splice(idx, 1)
    this.bus.emit('buff:removed', { target: entity, buff: this.defs.get(defId), reason })
  }

  update(entity: Entity, dt: number): void {
    for (let i = entity.buffs.length - 1; i >= 0; i--) {
      const inst = entity.buffs[i]
      if (inst.remaining === 0) continue // permanent
      inst.remaining = Math.max(0, inst.remaining - dt)
      if (inst.remaining <= 0) {
        entity.buffs.splice(i, 1)
        this.bus.emit('buff:removed', {
          target: entity,
          buff: this.defs.get(inst.defId),
          reason: 'expired',
        })
      }
    }
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

  isSilenced(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'silence')
  }

  isStunned(entity: Entity): boolean {
    return this.collectEffects(entity).some((e) => e.effect.type === 'stun')
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
