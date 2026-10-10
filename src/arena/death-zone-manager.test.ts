import { EventBus } from '@/core/event-bus'
import { DeathZoneManager } from './death-zone-manager'

describe('DeathZoneManager', () => {
  it('damage zones are somewhere not to stand but never lethal; pits and walls are', () => {
    const zones = new DeathZoneManager(new EventBus())
    zones.add({ id: 'lava', center: { x: 0, y: 0 }, facing: 0, shape: { type: 'circle', radius: 3 }, behavior: 'damage', damage: { potency: 1000, interval: 1000 } })
    zones.add({ id: 'pit', center: { x: 10, y: 0 }, facing: 0, shape: { type: 'circle', radius: 3 }, behavior: 'lethal' })
    expect(zones.isInAnyZone({ x: 0, y: 0 })).toBe(true)
    expect(zones.isLethalAt({ x: 0, y: 0 })).toBe(false)
    expect(zones.damageZonesAt({ x: 0, y: 0 }).map(z => z.id)).toEqual(['lava'])
    expect(zones.isLethalAt({ x: 10, y: 0 })).toBe(true)
    expect(zones.damageZonesAt({ x: 10, y: 0 })).toEqual([])
  })
})
