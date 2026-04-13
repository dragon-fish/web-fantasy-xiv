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
