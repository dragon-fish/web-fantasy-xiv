import { orbitPoints, pointAlong } from './move-along'

describe('move_along geometry', () => {
  it('walks a polyline by arc length and reports the travel heading', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]
    expect(pointAlong(pts, 0.25)).toEqual({ pos: { x: 0, y: 5 }, heading: 0 })
    expect(pointAlong(pts, 0.75)).toEqual({ pos: { x: 5, y: 10 }, heading: 90 })
    expect(pointAlong(pts, 1).pos).toEqual({ x: 10, y: 10 })
  })
  it('orbits clockwise from the given compass angle', () => {
    const pts = orbitPoints({ radius: 10, fromDeg: 180, sweepDeg: 90 })
    expect(pts[0].x).toBeCloseTo(0); expect(pts[0].y).toBeCloseTo(-10)
    const last = pts[pts.length - 1]
    expect(last.x).toBeCloseTo(-10); expect(last.y).toBeCloseTo(0)
  })
})
