// src/combat/enmity.ts
// Per-enemy enmity tables (FFXIV aggro). Fed by damage:dealt; enemies attack their top.
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { Entity } from '@/entity/entity'
import { isHostile, isPartyMember } from './party'

/** Tank stance: every source of enmity from a tank counts ×10 (heals included) */
export const TANK_ENMITY_MULTIPLIER = 10
/** Overheal draws more enmity than effective healing */
export const OVERHEAL_ENMITY = 1.5

interface DamageDealt {
  source?: Entity
  target: Entity
  amount: number
  /** Heals only: the part of `-amount` that went over max HP */
  overheal?: number
}

export class EnmitySystem {
  /** enemy id → member id → enmity */
  private tables = new Map<string, Map<string, number>>()

  constructor(bus: EventBus, private entities: EntityManager) {
    bus.on('damage:dealt', (p: DamageDealt) => this.onDamage(p))
    // A fallen member drops off every table; once raised it starts again from zero
    bus.on('entity:died', ({ entity }: { entity: Entity }) => {
      if (isPartyMember(entity)) for (const t of this.tables.values()) t.delete(entity.id)
      else this.tables.delete(entity.id)
    })
    bus.on('party:raised', ({ entity }: { entity: Entity }) => {
      for (const t of this.tables.values()) if (!t.has(entity.id)) t.set(entity.id, 0)
    })
  }

  /** Put the living party on `enemy`'s list (at zero) when it joins the fight */
  engage(enemy: Entity): void {
    let table = this.tables.get(enemy.id)
    if (!table) this.tables.set(enemy.id, table = new Map())
    for (const e of this.entities.getAll()) {
      if (isPartyMember(e) && e.alive && !table.has(e.id)) table.set(e.id, 0)
    }
  }

  add(enemy: Entity, member: Entity, amount: number): void {
    if (amount <= 0) return
    let table = this.tables.get(enemy.id)
    if (!table) this.tables.set(enemy.id, table = new Map())
    const scaled = amount * (member.role === 'tank' ? TANK_ENMITY_MULTIPLIER : 1)
    table.set(member.id, (table.get(member.id) ?? 0) + scaled)
  }

  get(enemy: Entity, member: Entity): number {
    return this.tables.get(enemy.id)?.get(member.id) ?? 0
  }

  /** Living party members by enmity on `enemy`, top first; ties go to tanks, then the human player */
  ranking(enemy: Entity): Entity[] {
    const table = this.tables.get(enemy.id)
    const members = this.entities.getAll().filter(e => isPartyMember(e) && e.alive)
    const tieBreak = (e: Entity) => (e.role === 'tank' ? 0 : e.npc ? 2 : 1)
    return members.sort((a, b) => (table?.get(b.id) ?? 0) - (table?.get(a.id) ?? 0) || tieBreak(a) - tieBreak(b))
  }

  top(enemy: Entity): Entity | null {
    return this.ranking(enemy)[0] ?? null
  }

  private onDamage({ source: raw, target, amount, overheal = 0 }: DamageDealt): void {
    // Periodic ticks carry only the caster's id
    const source = raw && (raw.team ? raw : this.entities.get(raw.id))
    if (!source || !isPartyMember(source)) return
    if (amount > 0) {
      if (isHostile(source, target)) this.add(target, source, amount)
      return
    }
    if (amount < 0 && isPartyMember(target)) {
      // Healing someone draws enmity from every enemy that has them on its list
      const effective = -amount - overheal
      const enmity = effective + overheal * OVERHEAL_ENMITY
      for (const [enemyId, table] of this.tables) {
        if (!table.has(target.id)) continue
        const enemy = this.entities.get(enemyId)
        if (enemy) this.add(enemy, source, enmity)
      }
    }
  }
}
