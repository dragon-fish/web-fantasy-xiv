// src/renderer/vfx/revive-vfx.ts
// Resurrection sequence for the practice revive ladder, timed to the revive hard stun:
// the world drains to grey, a light pillar descends on the body as it floats up (CharacterRenderer),
// feathers burst as it stands, then colour floods back. Driven by the VFX clock, so it pauses with the game.
import { Color3, ColorCurves, DynamicTexture, Vector3, type Scene } from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { VfxRenderer } from './vfx-renderer'
import { ParticleBurster } from './particle-burster'

const GOLD = Color3.FromHexString('#ffe6a0')
const WHITE = new Color3(1, 1, 1)
/** Phase marks as fractions of the revive delay (the body starts floating at PILLAR) */
const PILLAR = 0.38
const BURST = 0.92
const PILLAR_HEIGHT = 16
/** Grey-out easing speed (per ms) */
const DESAT_IN = 1 / 250
const DESAT_OUT = 1 / 500

function featherTexture(scene: Scene): DynamicTexture {
  const tex = new DynamicTexture('revive-feather', { width: 64, height: 128 }, scene, true)
  tex.hasAlpha = true
  const c = tex.getContext() as CanvasRenderingContext2D
  c.clearRect(0, 0, 64, 128)
  // Vane: a soft leaf around the quill
  const g = c.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, 'rgba(255,255,255,0.15)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
  g.addColorStop(1, 'rgba(255,255,255,0.15)')
  c.fillStyle = g
  c.beginPath()
  c.moveTo(32, 6)
  c.bezierCurveTo(58, 34, 54, 92, 33, 118)
  c.bezierCurveTo(12, 92, 6, 34, 32, 6)
  c.fill()
  // Quill
  c.strokeStyle = 'rgba(255,255,255,1)'
  c.lineWidth = 2.5
  c.beginPath()
  c.moveTo(32, 10)
  c.lineTo(33, 124)
  c.stroke()
  tex.update()
  return tex
}

export class ReviveVfx {
  private desat = 0
  private desatTarget = 0
  private curves: ColorCurves | null = null
  private feathers: ParticleBurster

  constructor(private vfx: VfxRenderer, bus: EventBus) {
    const scene = vfx.sm.scene
    this.feathers = new ParticleBurster('revive-feathers', scene, {
      texture: featherTexture(scene), capacity: 160,
      size: [0.55, 1.0], life: [1.3, 2.2], speed: [3, 7], gravity: -1.4, spin: true, endScale: 0.7,
    }, GOLD, WHITE)
    bus.on('player:reviving', (p: { entity: Entity; delay: number }) => this.start(p.entity.id, p.delay))
    bus.on('player:revived', ({ entity }: { entity: Entity }) => this.end(entity.id))
  }

  private start(id: string, delay: number): void {
    this.desatTarget = 1
    const follow = (y: number) => {
      const e = this.vfx.entities.get(id)
      return e ? new Vector3(e.position.x, y, e.position.y) : null
    }
    this.vfx.later(delay * PILLAR, () => {
      const life = delay * (1 - PILLAR) + 450
      this.vfx.spawn('billboardY', 'lightPillar', GOLD, life, (f, t) => {
        // Tall enough to read as a beam from the sky under the overhead camera
        const grow = Math.min(1, t / 0.12)
        const p = follow(PILLAR_HEIGHT * grow / 2)
        if (p) f.mesh.position.copyFrom(p)
        // Drops in fast, holds, then thins out as the player stands
        f.mesh.scaling.set(2 * (t > 0.85 ? 1 - (t - 0.85) / 0.15 * 0.7 : 1), PILLAR_HEIGHT * grow, 1)
        f.mesh.visibility = t > 0.85 ? (1 - t) / 0.15 : 1
      })
      this.vfx.spawn('ground', 'glowDisc', GOLD, life, (f, t) => {
        const p = follow(0.05)
        if (p) f.mesh.position.copyFrom(p)
        const s = 3.6 + Math.sin(t * Math.PI * 6) * 0.2
        f.mesh.scaling.set(s, 1, s)
        f.mesh.visibility = Math.min(1, t / 0.1) * (t > 0.85 ? (1 - t) / 0.15 : 0.85)
      })
      const p = follow(0.1)
      if (p) this.vfx.flash(p, 'ringThick', GOLD, 6, 500, 'ground')
    })
    this.vfx.later(delay * BURST, () => {
      const p = follow(1.8)
      if (!p) return
      this.feathers.emit(p.x, p.y, p.z, 110, { dirY: 0.9, spread: 1.8, jitter: 0.8 })
      this.vfx.flash(p, 'lightBurst', GOLD, 6, 450)
      this.vfx.burster('mote', 'holy').emit(p.x, 0.3, p.z, 30, { dirY: 1, spread: 0.8, jitter: 1.4 })
    })
  }

  private end(id: string): void {
    this.desatTarget = 0
    const e = this.vfx.entities.get(id)
    if (e) this.vfx.flash(new Vector3(e.position.x, 0.08, e.position.y), 'ringThick', GOLD, 9, 600, 'ground')
  }

  update(dt: number): void {
    if (this.desat === this.desatTarget) return
    const step = dt * (this.desatTarget > this.desat ? DESAT_IN : DESAT_OUT)
    this.desat = this.desatTarget > this.desat
      ? Math.min(this.desatTarget, this.desat + step)
      : Math.max(this.desatTarget, this.desat - step)
    const ip = this.vfx.sm.pipeline.imageProcessing
    if (!this.curves) {
      this.curves = new ColorCurves()
      ip.colorCurves = this.curves
    }
    ip.colorCurvesEnabled = this.desat > 0
    this.curves.globalSaturation = -100 * this.desat
  }
}
