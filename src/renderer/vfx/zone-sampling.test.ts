import type { AoeShapeDef } from '@/core/types'
import { isPointInAoeShape } from '@/skill/aoe-shape'
import { sampleZonePoints } from './zone-sampling'

const shapes: AoeShapeDef[] = [
  { type: 'circle', radius: 6 },
  { type: 'fan', radius: 10, angle: 90 },
  { type: 'ring', innerRadius: 5, outerRadius: 12 },
  { type: 'rect', length: 20, width: 4 },
]

describe('sampleZonePoints', () => {
  for (const shape of shapes) {
    it(`keeps every ${shape.type} sample inside the damage area`, () => {
      for (const facing of [0, 37, 90, 225]) {
        const center = { x: 3, y: -2 }
        for (const p of sampleZonePoints(shape, center, facing, 200)) {
          expect(isPointInAoeShape(p, center, shape, facing)).toBe(true)
        }
      }
    })
  }
})
