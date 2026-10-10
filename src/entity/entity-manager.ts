// src/entity/entity-manager.ts
import type { EntityType } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import { createEntity, type CreateEntityOptions, type Entity } from './entity'

function distanceSq(a: Entity, b: Entity): number {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  return dx * dx + dy * dy
}

export class EntityManager {
  private entities = new Map<string, Entity>()

  constructor(private bus: EventBus) {}

  create(opts: CreateEntityOptions): Entity {
    const entity = createEntity(opts)
    this.entities.set(entity.id, entity)
    this.bus.emit('entity:created', { entity })
    return entity
  }

  get(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  destroy(id: string): void {
    const entity = this.entities.get(id)
    if (!entity) return
    entity.alive = false
    this.entities.delete(id)
    this.bus.emit('entity:died', { entity })
    // Off the active list: this is what dying means (players are only ever incapacitated)
    this.bus.emit('entity:removed', { entity })
  }

  getAll(): Entity[] {
    return [...this.entities.values()]
  }

  getAlive(): Entity[] {
    return this.getAll().filter((e) => e.alive)
  }

  getByType(type: EntityType): Entity[] {
    return this.getAll().filter((e) => e.type === type)
  }

  findNearest(fromId: string, filter: (e: Entity) => boolean): Entity | null {
    const from = this.entities.get(fromId)
    if (!from) return null

    let nearest: Entity | null = null
    let nearestDistSq = Infinity

    for (const entity of this.entities.values()) {
      if (entity.id === fromId) continue
      if (!filter(entity)) continue
      const dSq = distanceSq(from, entity)
      if (dSq < nearestDistSq) {
        nearestDistSq = dSq
        nearest = entity
      }
    }
    return nearest
  }
}
