import { assignSpots, SpotCoordinator, worldSpots } from './npc-spots'

const square = [{ x: -6, y: 6 }, { x: 6, y: 6 }, { x: 6, y: -6 }, { x: -6, y: -6 }]

describe('npc spots', () => {
  it('leaves the southernmost spot to the player and gives each NPC its nearest free spot', () => {
    const spots = [{ x: 0, y: 8 }, { x: 8, y: 0 }, { x: 0, y: -8 }, { x: -8, y: 0 }]
    const claims = assignSpots(spots, [
      { id: 'a', position: { x: 1, y: -7 } }, // standing on the player's spot
      { id: 'b', position: { x: 7, y: 1 } },
      { id: 'c', position: { x: -1, y: 7 } },
    ])
    expect([...claims.values()]).not.toContain(2)
    expect(claims.get('b')).toBe(1)
    expect(claims.get('c')).toBe(0)
    expect(claims.get('a')).toBe(3)
  })

  it('with fewer spots than people (stack), NPCs share the nearest spot', () => {
    const claims = assignSpots([{ x: 0, y: 0 }], [{ id: 'a', position: { x: 5, y: 5 } }, { id: 'b', position: { x: -5, y: 0 } }])
    expect([...claims.values()]).toEqual([0, 0])
  })

  it('an NPC whose spot the player takes moves to the free one', () => {
    const spots = new SpotCoordinator(() => 0.5, 0)
    const npcs = [{ id: 'a', position: { x: -6, y: 6 } }, { id: 'b', position: { x: 6, y: 6 } }, { id: 'c', position: { x: 6, y: -6 } }]
    spots.activate({ spots: square, tolerance: 0 }, npcs, 0, 5000)
    expect(spots.pointFor('a')).toEqual({ x: -6, y: 6 })
    spots.update(100, { x: -6, y: 6 })
    expect(spots.pointFor('a')).toEqual({ x: 6, y: -6 }) // the player's reserved spot was the free one
    spots.update(5000, null)
    expect(spots.pointFor('a')).toBeNull()
  })

  it('stands inside the tolerance, and only a mistake puts an NPC further out', () => {
    const near = new SpotCoordinator(() => 0.99, 0)
    near.activate({ spots: [{ x: 0, y: 0 }], tolerance: 1 }, [{ id: 'a', position: { x: 0, y: 0 } }], 0, 1000)
    const p = near.pointFor('a')!
    expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(1)

    const sloppy = new SpotCoordinator(() => 0.99, 1)
    sloppy.activate({ spots: [{ x: 0, y: 0 }], tolerance: 1 }, [{ id: 'a', position: { x: 0, y: 0 } }], 0, 1000)
    const q = sloppy.pointFor('a')!
    expect(Math.hypot(q.x, q.y)).toBeGreaterThan(2)
  })
  it('boss-frame spots follow the caster, and the one behind it is left for the player', () => {
    // Boss at (10, 0) facing east: "behind" is west of it
    const hint = { frame: 'boss' as const, spots: [{ x: 0, y: 6 }, { x: 0, y: -6 }, { x: 6, y: 0 }, { x: -6, y: 0 }], tolerance: 0 }
    const world = worldSpots(hint, { x: 10, y: 0, facing: 90 })
    expect(world.map(p => [Math.round(p.x) + 0, Math.round(p.y) + 0])).toEqual([[16, 0], [4, 0], [10, -6], [10, 6]])
    const spots = new SpotCoordinator(() => 0.5, 0)
    const npcs = ['a', 'b', 'c'].map(id => ({ id, position: { x: 10, y: 0 } }))
    spots.activate(hint, npcs, 0, 1000, { x: 10, y: 0, facing: 90 })
    const taken = npcs.map(n => spots.pointFor(n.id)!).map(p => [Math.round(p.x) + 0, Math.round(p.y) + 0])
    expect(taken).not.toContainEqual([4, 0])
  })
})
