// src/skill/aoe-zone.test.ts
import { describe, it, expect, vi } from 'vitest'
import { AoeZoneManager, type ActiveAoeZone } from '@/skill/aoe-zone'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import type { AoeZoneDef } from '@/core/types'

function makeCircleZone(overrides?: Partial<AoeZoneDef>): AoeZoneDef {
  return {
    anchor: { type: 'position', x: 0, y: 0 },
    direction: { type: 'none' },
    shape: { type: 'circle', radius: 5 },
    resolveDelay: 3000,
    hitEffectDuration: 500,
    effects: [{ type: 'damage', potency: 1000 }],
    ...overrides,
  }
}

describe('AoeZoneManager', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const zoneMgr = new AoeZoneManager(bus, entityMgr)
    return { bus, entityMgr, zoneMgr }
  }

  it('should create zone and emit aoe:zone_created', () => {
    const { bus, zoneMgr } = setup()
    const handler = vi.fn()
    bus.on('aoe:zone_created', handler)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('should resolve zone after resolveDelay and emit aoe:zone_resolved', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 2, y: 0, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)

    // Not yet resolved
    zoneMgr.update(2000)
    expect(resolved).not.toHaveBeenCalled()

    // Resolve at 3000ms
    zoneMgr.update(1000)
    expect(resolved).toHaveBeenCalledOnce()
    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(1)
    expect(resolved.mock.calls[0][0].hitEntities[0].id).toBe('p1')
  })

  it('should not hit entities outside the zone', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 20, y: 0, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    zoneMgr.update(3000)

    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(0)
  })

  it('should remove zone after resolve + hitEffectDuration and emit aoe:zone_removed', () => {
    const { bus, zoneMgr } = setup()
    const removed = vi.fn()
    bus.on('aoe:zone_removed', removed)

    zoneMgr.spawn(makeCircleZone(), 'skill1', { x: 0, y: 0 }, 0, null)
    zoneMgr.update(3000) // resolve
    zoneMgr.update(500)  // hitEffect done
    expect(removed).toHaveBeenCalledOnce()
  })

  it('should resolve anchor type "caster" at caster position', () => {
    const { bus, entityMgr, zoneMgr } = setup()
    const caster = entityMgr.create({ id: 'boss', type: 'boss', position: { x: 5, y: 5, z: 0 } })
    entityMgr.create({ id: 'p1', type: 'player', position: { x: 6, y: 5, z: 0 } })

    const resolved = vi.fn()
    bus.on('aoe:zone_resolved', resolved)

    const zone = makeCircleZone({
      anchor: { type: 'caster' },
      shape: { type: 'circle', radius: 3 },
    })

    zoneMgr.spawn(zone, 'skill1', caster.position, caster.facing, null, caster.id)
    zoneMgr.update(3000)

    expect(resolved.mock.calls[0][0].hitEntities).toHaveLength(1)
    expect(resolved.mock.calls[0][0].hitEntities[0].id).toBe('p1')
  })
})

describe('caster offsets', () => {
  it('shift a caster-anchored zone in the caster frame (y ahead, x to the right)', () => {
    const zoneMgr = new AoeZoneManager(new EventBus(), new EntityManager(new EventBus()))
    const at = (facing: number) => zoneMgr.spawn(makeCircleZone({ anchor: { type: 'caster' }, offset: { x: 2, y: 5 } }), 's', { x: 10, y: 0 }, facing, null).center
    const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })
    expect(round(at(0))).toEqual({ x: 12, y: 5 })
    // Facing east: ahead is +x, the right hand points south
    expect(round(at(90))).toEqual({ x: 15, y: -2 })
  })
})

describe('caster-facing offsets', () => {
  it('turn a zone from where the caster faces, clockwise', () => {
    const zoneMgr = new AoeZoneManager(new EventBus(), new EntityManager(new EventBus()))
    const facing = (offset: number) => zoneMgr.spawn(makeCircleZone({ anchor: { type: 'caster' }, direction: { type: 'caster_facing', offset } }), 's', { x: 0, y: 0 }, 350, null).facing
    expect(facing(30)).toBe(20)
    expect(facing(-30)).toBe(320)
  })
})

describe('target_live anchoring', () => {
  it('follows the anchored entity until it resolves, then stays put', async () => {
    const { EventBus } = await import('@/core/event-bus')
    const { EntityManager } = await import('@/entity/entity-manager')
    const { AoeZoneManager } = await import('./aoe-zone')
    const bus = new EventBus()
    const entities = new EntityManager(bus)
    const zones = new AoeZoneManager(bus, entities)
    const player = entities.create({ id: 'p', type: 'player', hp: 100, position: { x: 0, y: 0, z: 0 } })
    const zone = zones.spawn({ anchor: { type: 'target_live' }, direction: { type: 'none' }, shape: { type: 'circle', radius: 6 }, resolveDelay: 1000, hitEffectDuration: 500, effects: [] }, 'spread', { x: 9, y: 9 }, 0, { x: 0, y: 0 }, null, player.id)
    player.position.x = 5
    zones.update(500)
    expect(zone.center).toEqual({ x: 5, y: 0 })
    zones.update(600) // resolves
    player.position.x = -5
    zones.update(100)
    expect(zone.center).toEqual({ x: 5, y: 0 })
  })

  it('collects dormant entities only for zones with a revive effect', async () => {
    const { EventBus } = await import('@/core/event-bus')
    const { EntityManager } = await import('@/entity/entity-manager')
    const { AoeZoneManager } = await import('./aoe-zone')
    const bus = new EventBus()
    const entities = new EntityManager(bus)
    const zones = new AoeZoneManager(bus, entities)
    const feather = entities.create({ id: 'f', type: 'mob', hp: 100 })
    entities.create({ id: 'bird', type: 'mob', hp: 100, dormant: true, targetable: false, position: { x: 2, y: 0, z: 0 } })
    const seen: Record<string, string[]> = {}
    bus.on('aoe:zone_resolved', (p: any) => { seen[p.zone.skillId] = p.dormantHits.map((e: any) => e.id) })
    const def = (effects: any[]) => ({ anchor: { type: 'caster' as const }, direction: { type: 'none' as const }, shape: { type: 'circle' as const, radius: 9 }, resolveDelay: 0, hitEffectDuration: 0, effects })
    zones.spawn(def([{ type: 'damage', potency: 1 }]), 'a', { x: 0, y: 0 }, 0, null, feather.id)
    zones.spawn(def([{ type: 'revive' }]), 'b', { x: 0, y: 0 }, 0, null, feather.id)
    zones.update(16)
    expect(seen).toEqual({ a: [], b: ['bird'] })
  })
})
