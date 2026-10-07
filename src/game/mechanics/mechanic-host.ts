// src/game/mechanics/mechanic-host.ts
// Runs encounter mechanics on the logic clock (ticked only while the battle is live,
// so pauses freeze them). Timeline `mechanic:` actions start them by name.
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffSystem } from '@/combat/buff'
import type { BuffDef } from '@/core/types'
import type { CombatResolver } from '../combat-resolver'
import type { InputManager } from '@/input/input-manager'
import type { Arena } from '@/arena/arena'
import type { DeathZoneManager } from '@/arena/death-zone-manager'

export interface MechanicContext {
  bus: EventBus
  entities: EntityManager
  buffs: BuffSystem
  combat: CombatResolver
  input: InputManager
  arena: Arena
  deathZones: DeathZoneManager
  player: Entity
  buffDef(id: string): BuffDef | undefined
  announce(text: string, ms: number): void
}

export interface Mechanic {
  /** Advance by `dt` ms; return true when finished. */
  update(dt: number): boolean
}

export type MechanicFactory = (ctx: MechanicContext, params: Record<string, any>, id: string) => Mechanic

interface Delayed { at: number; fn: () => void }

export class MechanicHost {
  private running: Mechanic[] = []
  private delayed: Delayed[] = []
  private now = 0
  private serial = 0

  constructor(private ctx: MechanicContext, private registry: Record<string, MechanicFactory>) {}

  start(name: string, params: Record<string, any> = {}): void {
    const factory = this.registry[name]
    if (!factory) throw new Error(`[mechanics] unknown mechanic '${name}'`)
    this.running.push(factory(this.ctx, params, `${name}#${++this.serial}`))
  }

  /** Run `fn` after `ms` of live battle time. */
  after(ms: number, fn: () => void): void {
    this.delayed.push({ at: this.now + ms, fn })
  }

  update(dt: number): void {
    this.now += dt
    this.running = this.running.filter(m => !m.update(dt))
    if (this.delayed.length) {
      const due = this.delayed.filter(d => d.at <= this.now)
      this.delayed = this.delayed.filter(d => d.at > this.now)
      for (const d of due) d.fn()
    }
  }
}
