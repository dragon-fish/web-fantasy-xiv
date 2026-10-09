// src/renderer/entity-visuals.ts
import type { Entity } from '@/entity/entity'

/** Contract every entity renderer (default characters, survivors visuals) fulfils for GameScene. */
export interface EntityVisuals {
  updateAll(entities: Entity[], dt: number, lockedTargetId?: string | null, allyTargetId?: string | null): void
  flashHit(entityId: string): void
  getHeight?(entity: Entity): number
}
