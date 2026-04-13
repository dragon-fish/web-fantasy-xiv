import type { Entity } from '@/entity/entity'
import type { Arena } from '@/arena/arena'

export type EasingFn = (t: number) => number

export const EASING = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 2),
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
} as const

interface ActiveAnimation {
  entity: Entity
  fromX: number
  fromY: number
  toX: number
  toY: number
  duration: number  // ms
  elapsed: number
  easing: EasingFn
}

/**
 * Animates entity displacement (dash, backstep, knockback, pull) over time
 * instead of instant teleport. Arena boundary clamping applied each frame.
 */
export class DisplacementAnimator {
  private animations: ActiveAnimation[] = []

  constructor(private arena: Arena) {}

  /**
   * Start a displacement animation.
   * During animation, the entity's position updates each frame.
   */
  start(
    entity: Entity,
    toX: number,
    toY: number,
    duration = 200,
    easing: EasingFn = EASING.linear,
  ): void {
    // Cancel any existing animation for this entity
    this.cancel(entity.id)

    this.animations.push({
      entity,
      fromX: entity.position.x,
      fromY: entity.position.y,
      toX,
      toY,
      duration,
      elapsed: 0,
      easing,
    })
  }

  /** Cancel active animation for an entity */
  cancel(entityId: string): void {
    const idx = this.animations.findIndex((a) => a.entity.id === entityId)
    if (idx !== -1) this.animations.splice(idx, 1)
  }

  /** Is entity currently being displaced? */
  isAnimating(entityId: string): boolean {
    return this.animations.some((a) => a.entity.id === entityId)
  }

  /** Call each logic tick */
  update(dt: number): void {
    for (let i = this.animations.length - 1; i >= 0; i--) {
      const anim = this.animations[i]
      anim.elapsed += dt

      const t = Math.min(anim.elapsed / anim.duration, 1)
      const eased = anim.easing(t)

      const x = anim.fromX + (anim.toX - anim.fromX) * eased
      const y = anim.fromY + (anim.toY - anim.fromY) * eased

      const clamped = this.arena.clampPosition({ x, y })
      anim.entity.position.x = clamped.x
      anim.entity.position.y = clamped.y

      if (t >= 1) {
        this.animations.splice(i, 1)
      }
    }
  }
}
