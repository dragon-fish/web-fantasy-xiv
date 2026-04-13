// src/skill/aoe-zone.ts
import type { AoeZoneDef, Vec2 } from '@/core/types'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { Entity } from '@/entity/entity'
import { isPointInAoeShape } from './aoe-shape'

export interface ActiveAoeZone {
  id: string
  def: AoeZoneDef
  skillId: string
  casterId: string | null
  center: Vec2
  facing: number
  elapsed: number
  /** Time (ms from creation) when telegraph appears */
  telegraphAt: number
  telegraphVisible: boolean
  resolved: boolean
}

let nextZoneId = 0

export class AoeZoneManager {
  private zones: ActiveAoeZone[] = []

  constructor(
    private bus: EventBus,
    private entityMgr: EntityManager,
  ) {}

  spawn(
    def: AoeZoneDef,
    skillId: string,
    casterPos: Vec2,
    casterFacing: number,
    targetPos: Vec2 | null,
    casterId: string | null = null,
  ): ActiveAoeZone {
    const center = this.resolveAnchor(def.anchor, casterPos, targetPos)
    const facing = this.resolveDirection(def.direction, casterFacing, center, targetPos)

    // telegraphBefore defaults to resolveDelay (show immediately on creation)
    const telegraphBefore = def.telegraphBefore ?? def.resolveDelay
    const telegraphAt = Math.max(0, def.resolveDelay - telegraphBefore)

    const zone: ActiveAoeZone = {
      id: `zone_${nextZoneId++}`,
      def,
      skillId,
      casterId,
      center,
      facing,
      elapsed: 0,
      telegraphAt,
      telegraphVisible: false,
      resolved: false,
    }

    this.zones.push(zone)

    // Show immediately if telegraphAt is 0
    if (telegraphAt <= 0) {
      zone.telegraphVisible = true
      this.bus.emit('aoe:zone_created', { zone, skill: skillId })
    }

    return zone
  }

  update(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i]
      zone.elapsed += dt

      // Deferred telegraph appearance
      if (!zone.telegraphVisible && zone.elapsed >= zone.telegraphAt) {
        zone.telegraphVisible = true
        this.bus.emit('aoe:zone_created', { zone, skill: zone.skillId })
      }

      if (!zone.resolved && zone.elapsed >= zone.def.resolveDelay) {
        this.resolve(zone)
      }

      if (zone.resolved && zone.elapsed >= zone.def.resolveDelay + zone.def.hitEffectDuration) {
        this.zones.splice(i, 1)
        this.bus.emit('aoe:zone_removed', { zone })
      }
    }
  }

  private resolve(zone: ActiveAoeZone): void {
    zone.resolved = true
    const hitEntities: Entity[] = []

    for (const entity of this.entityMgr.getAlive()) {
      if (zone.casterId !== null && entity.id === zone.casterId) continue
      const point: Vec2 = { x: entity.position.x, y: entity.position.y }
      if (isPointInAoeShape(point, zone.center, zone.def.shape, zone.facing)) {
        hitEntities.push(entity)
      }
    }

    this.bus.emit('aoe:zone_resolved', { zone, hitEntities })
  }

  private resolveAnchor(anchor: AoeZoneDef['anchor'], casterPos: Vec2, targetPos: Vec2 | null): Vec2 {
    switch (anchor.type) {
      case 'caster':
        return { ...casterPos }
      case 'target':
      case 'target_live':
        return targetPos ? { ...targetPos } : { ...casterPos }
      case 'position':
        return { x: anchor.x, y: anchor.y }
    }
  }

  private resolveDirection(
    dir: AoeZoneDef['direction'],
    casterFacing: number,
    center: Vec2,
    targetPos: Vec2 | null,
  ): number {
    switch (dir.type) {
      case 'caster_facing':
        return casterFacing
      case 'toward_target': {
        if (!targetPos) return casterFacing
        const dx = targetPos.x - center.x
        const dy = targetPos.y - center.y
        return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
      }
      case 'fixed':
        return dir.angle
      case 'none':
        return 0
    }
  }

  getActiveZones(): readonly ActiveAoeZone[] {
    return this.zones
  }
}
