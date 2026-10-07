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
  /** Entity the zone is anchored on (target anchors); `target_live` zones follow it until resolve */
  anchorEntityId: string | null
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
    targetId: string | null = null,
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
      anchorEntityId: def.anchor.type === 'target' || def.anchor.type === 'target_live' ? targetId : null,
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
      if (!zone.resolved && zone.def.anchor.type === 'target_live' && zone.anchorEntityId) {
        const anchor = this.entityMgr.get(zone.anchorEntityId)
        if (anchor?.alive) zone.center = { x: anchor.position.x, y: anchor.position.y }
      }

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
    const caster = zone.casterId ? this.entityMgr.get(zone.casterId) : null

    const revives = zone.def.effects.some(e => e.type === 'revive')
    const dormantHits: Entity[] = []
    for (const entity of this.entityMgr.getAlive()) {
      if (zone.casterId !== null && entity.id === zone.casterId) continue
      if (entity.dormant) {
        // Dormant bodies ignore faction and targetability; only revive effects care about them
        if (revives && isPointInAoeShape({ x: entity.position.x, y: entity.position.y }, zone.center, zone.def.shape, zone.facing)) dormantHits.push(entity)
        continue
      }
      // Skip untargetable entities (invulnerable)
      if (!entity.targetable) continue
      // Skip friendly entities (same faction: player vs player, or boss/mob vs boss/mob)
      if (caster && !this.isHostile(caster, entity)) continue
      const point: Vec2 = { x: entity.position.x, y: entity.position.y }
      if (isPointInAoeShape(point, zone.center, zone.def.shape, zone.facing)) {
        hitEntities.push(entity)
      }
    }

    this.bus.emit('aoe:zone_resolved', { zone, hitEntities, dormantHits })
  }

  private isHostile(a: Entity, b: Entity): boolean {
    const playerTypes = new Set(['player'])
    const enemyTypes = new Set(['boss', 'mob'])
    const aIsPlayer = playerTypes.has(a.type)
    const bIsPlayer = playerTypes.has(b.type)
    return aIsPlayer !== bIsPlayer
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

  /** Remove all unresolved zones spawned by a specific cast (for cast interrupts) */
  cancelZones(casterId: string, skillId: string): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i]
      if (zone.casterId === casterId && zone.skillId === skillId && !zone.resolved) {
        this.zones.splice(i, 1)
        this.bus.emit('aoe:zone_removed', { zone })
      }
    }
  }

  /** Remove all zones (resolved or not) belonging to a caster (for entity death) */
  cancelAllByCaster(casterId: string): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const zone = this.zones[i]
      if (zone.casterId === casterId) {
        this.zones.splice(i, 1)
        this.bus.emit('aoe:zone_removed', { zone })
      }
    }
  }

  getActiveZones(): readonly ActiveAoeZone[] {
    return this.zones
  }
}
