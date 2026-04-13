// src/demo/player-controller.test.ts
import { describe, it, expect } from 'vitest'
import { applyMovement } from '@/demo/player-controller'
import { createEntity } from '@/entity/entity'

describe('applyMovement', () => {
  it('should move entity by direction * speed * dt', () => {
    const entity = createEntity({
      id: 'p1', type: 'player',
      position: { x: 0, y: 0, z: 0 },
      speed: 6,
    })
    applyMovement(entity, { x: 1, y: 0 }, 16) // 6 m/s * 0.016s = 0.096m
    expect(entity.position.x).toBeCloseTo(0.096)
    expect(entity.position.y).toBeCloseTo(0)
  })

  it('should not move when direction is zero', () => {
    const entity = createEntity({
      id: 'p1', type: 'player',
      position: { x: 5, y: 3, z: 0 },
      speed: 6,
    })
    applyMovement(entity, { x: 0, y: 0 }, 16)
    expect(entity.position.x).toBe(5)
    expect(entity.position.y).toBe(3)
  })
})
