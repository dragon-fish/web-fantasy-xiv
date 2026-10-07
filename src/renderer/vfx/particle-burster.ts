// src/renderer/vfx/particle-burster.ts
// One long-lived ParticleSystem per (preset, tint); bursts are queued positions
// consumed by startPositionFunction, so many bursts per frame share one draw call.
// Tint must be baked per system: Babylon assigns particle colour after the
// position callback runs, so a per-burst colour set there would be overwritten.
import { ParticleSystem, Vector3, Color4, type Color3, type Scene, type Texture } from '@babylonjs/core'

export interface BurstPreset {
  texture: Texture
  capacity: number
  size: [number, number]
  life: [number, number]
  speed: [number, number]
  /** World-space gravity Y (negative = falls) */
  gravity: number
  /** Random spin */
  spin?: boolean
  /** Shrink/grow to this fraction of start size over lifetime */
  endScale?: number
}

interface Pending { x: number; y: number; z: number; dirY: number; spread: number; jitter: number }

export class ParticleBurster {
  private ps: ParticleSystem
  private capacity: number
  private queue: Pending[] = []
  private current: Pending | null = null

  constructor(name: string, scene: Scene, p: BurstPreset, color: Color3, core: Color3) {
    this.capacity = p.capacity
    const ps = this.ps = new ParticleSystem(name, p.capacity, scene)
    ps.particleTexture = p.texture
    ps.blendMode = ParticleSystem.BLENDMODE_ADD
    ps.emitter = Vector3.Zero()
    ps.emitRate = 0
    ps.manualEmitCount = 0
    ps.minSize = p.size[0]
    ps.maxSize = p.size[1]
    ps.minLifeTime = p.life[0]
    ps.maxLifeTime = p.life[1]
    ps.minEmitPower = p.speed[0]
    ps.maxEmitPower = p.speed[1]
    ps.gravity = new Vector3(0, p.gravity, 0)
    ps.color1 = new Color4(core.r, core.g, core.b, 1)
    ps.color2 = new Color4(color.r, color.g, color.b, 1)
    ps.colorDead = new Color4(color.r * 0.6, color.g * 0.6, color.b * 0.6, 0)
    if (p.spin) {
      ps.minAngularSpeed = -4
      ps.maxAngularSpeed = 4
      ps.minInitialRotation = 0
      ps.maxInitialRotation = Math.PI * 2
    }
    if (p.endScale !== undefined) {
      ps.addSizeGradient(0, p.size[0], p.size[1])
      ps.addSizeGradient(1, p.size[0] * p.endScale, p.size[1] * p.endScale)
    }

    ps.startPositionFunction = (_world, pos) => {
      const q = this.queue.shift() ?? this.current
      if (!q) return
      this.current = q
      const j = q.jitter
      pos.set(q.x + (Math.random() - 0.5) * j, q.y + (Math.random() - 0.5) * j, q.z + (Math.random() - 0.5) * j)
    }
    ps.startDirectionFunction = (_world, dir) => {
      const q = this.current
      const spread = q?.spread ?? 1
      const a = Math.random() * Math.PI * 2
      const h = Math.random() * spread
      dir.set(Math.cos(a) * h, (q?.dirY ?? 1) * (0.6 + Math.random() * 0.4), Math.sin(a) * h)
    }
    ps.start()
  }

  /**
   * Queue `count` particles at a point. `dirY` biases the vertical direction (1 = fountain up,
   * 0 = flat spray, -1 = down); `spread` widens the horizontal component; `jitter` scatters spawn points.
   */
  emit(x: number, y: number, z: number, count: number, opts: { dirY?: number; spread?: number; jitter?: number } = {}): void {
    // Babylon zeroes manualEmitCount after emitting, even when capacity cut the batch short;
    // leftover queued positions would then be consumed by later bursts at the wrong spot.
    if (this.ps.manualEmitCount <= 0) this.queue.length = 0
    const free = this.capacity - this.ps.getActiveCount() - this.queue.length
    const n = Math.min(count, Math.max(0, free))
    if (n === 0) return
    const p: Pending = { x, y, z, dirY: opts.dirY ?? 1, spread: opts.spread ?? 1, jitter: opts.jitter ?? 0.2 }
    for (let i = 0; i < n; i++) this.queue.push(p)
    this.ps.manualEmitCount = this.queue.length
  }

  dispose(): void {
    this.ps.dispose(false)
  }
}
