import type { Entity } from '@/entity/entity'

export interface CameraFollowConfig {
  /** Smoothing factor (0-1). Higher = faster catch-up. Default: 0.08 */
  smoothing: number
  /** Distance beyond which camera snaps harder. Default: 8 */
  maxLag: number
  /** Minimum speed (units/s) to avoid float stall. Default: 0.5 */
  minSpeed: number
}

const DEFAULT_CONFIG: CameraFollowConfig = {
  smoothing: 0.08,
  maxLag: 8,
  minSpeed: 0.5,
}

export class CameraController {
  private pos = { x: 0, y: 0 }
  private target: Entity | null = null
  readonly config: CameraFollowConfig

  constructor(config?: Partial<CameraFollowConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Bind camera to follow this entity */
  follow(entity: Entity): void {
    this.target = entity
    this.snapToTarget()
  }

  /** Instantly snap to current target position */
  snapToTarget(): void {
    if (!this.target) return
    this.pos.x = this.target.position.x
    this.pos.y = this.target.position.y
  }

  /** Call each render frame. Returns the smoothed camera world position. */
  update(deltaMs: number): { x: number; y: number } {
    if (!this.target) return { ...this.pos }

    const tx = this.target.position.x
    const ty = this.target.position.y
    const dx = tx - this.pos.x
    const dy = ty - this.pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 0.001) {
      this.pos.x = tx
      this.pos.y = ty
    } else {
      const { smoothing, maxLag, minSpeed } = this.config
      const dtFactor = deltaMs / 16

      let t = 1 - Math.pow(1 - smoothing, dtFactor)

      if (dist > maxLag) {
        const excess = (dist - maxLag) / maxLag
        t = Math.min(1, t + excess * 0.3)
      }

      const lerpDist = dist * t
      const minDist = minSpeed * (deltaMs / 1000)
      const moveDist = Math.max(lerpDist, Math.min(minDist, dist))

      const ratio = moveDist / dist
      this.pos.x += dx * ratio
      this.pos.y += dy * ratio
    }

    return { ...this.pos }
  }
}
