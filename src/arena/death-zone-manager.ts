// src/arena/death-zone-manager.ts
import type { DeathZoneDef, Vec2 } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import { isPointInAoeShape } from '@/skill/aoe-shape'

export class DeathZoneManager {
  private zones = new Map<string, DeathZoneDef>()

  constructor(private bus: EventBus) {}

  /** Load initial (static) death zones from arena config */
  loadInitial(zones: DeathZoneDef[]): void {
    for (const z of zones) {
      if (!z.behavior) (z as any).behavior = 'lethal'
      this.zones.set(z.id, z)
      this.bus.emit('deathzone:added', { zone: z })
    }
  }

  add(zone: DeathZoneDef): void {
    this.zones.set(zone.id, zone)
    this.bus.emit('deathzone:added', { zone })
  }

  remove(id: string): void {
    const zone = this.zones.get(id)
    if (zone) {
      this.zones.delete(id)
      this.bus.emit('deathzone:removed', { id })
    }
  }

  isInAnyZone(point: Vec2): boolean {
    for (const zone of this.zones.values()) {
      if (isPointInAoeShape(point, zone.center, zone.shape, zone.facing)) {
        return true
      }
    }
    return false
  }

  getAll(): DeathZoneDef[] {
    return [...this.zones.values()]
  }

  getWallZones(): DeathZoneDef[] {
    return [...this.zones.values()].filter(z => z.behavior === 'wall')
  }
}
