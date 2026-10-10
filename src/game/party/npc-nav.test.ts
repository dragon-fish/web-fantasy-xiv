import type { ActiveAoeZone } from '@/skill/aoe-zone'
import type { AoeShapeDef } from '@/core/types'
import { findSafeSpot, inHazard, isSafe, pathIsSafe, SAFE_MARGIN } from './npc-nav'

const zone = (shape: AoeShapeDef, x = 0, y = 0, facing = 0, trackTarget = false) =>
  ({ center: { x, y }, facing, def: { shape, trackTarget } }) as unknown as ActiveAoeZone
const arena = { standable: (p: { x: number; y: number }) => Math.hypot(p.x, p.y) <= 20 }
const fixed = () => 0

describe('npc-nav', () => {
  it('keeps a margin from AOE edges', () => {
    const hazards = [zone({ type: 'circle', radius: 5 })]
    expect(isSafe({ x: 5.5, y: 0 }, hazards, arena)).toBe(false)
    expect(isSafe({ x: 5 + SAFE_MARGIN + 0.1, y: 0 }, hazards, arena)).toBe(true)
  })

  it('stays put when the preferred spot is already safe', () => {
    const hazards = [zone({ type: 'circle', radius: 5 }, 10, 10)]
    expect(findSafeSpot({ x: 0, y: -5 }, { x: 0, y: -5 }, hazards, arena, fixed, 0)).toEqual({ x: 0, y: -5 })
  })

  it('steps out of a circle to the nearest safe ground around the preferred spot', () => {
    const hazards = [zone({ type: 'circle', radius: 6 })]
    const spot = findSafeSpot({ x: 0, y: -2 }, { x: 0, y: -2 }, hazards, arena, fixed, 0)
    expect(isSafe(spot, hazards, arena)).toBe(true)
    expect(Math.hypot(spot.x, spot.y)).toBeLessThan(6 + SAFE_MARGIN + 1.5)
  })

  it('a dash is unsafe when its path crosses a hazard or leaves the arena', () => {
    const hazards = [zone({ type: 'rect', length: 40, width: 2 }, 0, -20)]
    expect(pathIsSafe({ x: -5, y: 0 }, { x: 5, y: 0 }, hazards, arena)).toBe(false)
    expect(pathIsSafe({ x: -5, y: 0 }, { x: -5, y: 8 }, hazards, arena)).toBe(true)
    expect(pathIsSafe({ x: -15, y: 0 }, { x: -25, y: 0 }, [], arena)).toBe(false)
  })

  it('keeps clear of a little more than a fan that turns after its target', () => {
    const justOutside = { x: Math.sin((65 * Math.PI) / 180) * 8, y: Math.cos((65 * Math.PI) / 180) * 8 } // 65° off a 120° fan's axis
    expect(inHazard(justOutside, [zone({ type: 'fan', radius: 16, angle: 120 })])).toBe(false)
    expect(inHazard(justOutside, [zone({ type: 'fan', radius: 16, angle: 120 }, 0, 0, 0, true)])).toBe(true)
  })

  it('settles for a narrow gap between two AOEs when nothing roomier is left', () => {
    // Two broad lines leave a 2.2m strip along x = 0: too narrow for the comfortable margin
    const hazards = [zone({ type: 'rect', length: 40, width: 28 }, -15.1, -20), zone({ type: 'rect', length: 40, width: 28 }, 15.1, -20)]
    const spot = findSafeSpot({ x: 5, y: 0 }, { x: 5, y: 0 }, hazards, arena, fixed, 0)
    expect(Math.abs(spot.x)).toBeLessThan(1.1)
    expect(inHazard(spot, hazards)).toBe(false)
  })
})
