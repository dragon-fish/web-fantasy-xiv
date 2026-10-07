// src/renderer/vfx/mechanic-vfx.ts
// Visuals for encounter mechanics: overhead markers on pending zones and the
// blade-clash (拼刀) parry. Built on VfxRenderer's pooled quads and bursters.
import { Color3, Vector3 } from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'
import type { TimingGrade } from '@/game/mechanics/timed-input'
import type { VfxRenderer } from './vfx-renderer'

type Fx = ReturnType<VfxRenderer['spawn']>

const MARKER_COLORS = {
  spread: Color3.FromHexString('#ff6fd8'),
  stack: Color3.FromHexString('#ffd36b'),
  buster: Color3.FromHexString('#ff4a3a'),
}
const CLASH_GOLD = Color3.FromHexString('#ffe6a0')
const CLASH_RED = Color3.FromHexString('#ff3b2f')

export class MechanicVfx {
  private markers = new Map<string, Fx[]>()
  private clashes = new Map<string, Fx[]>()

  constructor(private vfx: VfxRenderer, bus: EventBus) {
    bus.on('aoe:zone_created', ({ zone }: { zone: ActiveAoeZone }) => this.onZoneCreated(zone))
    bus.on('aoe:zone_resolved', ({ zone }: { zone: ActiveAoeZone }) => this.endMarker(zone.id))
    bus.on('aoe:zone_removed', ({ zone }: { zone: ActiveAoeZone }) => this.endMarker(zone.id))
    bus.on('mechanic:clash_start', (p: { id: string; sourceId: string | null; targetId: string; windup: number }) => this.clashStart(p))
    bus.on('mechanic:clash_result', (p: { id: string; grade: TimingGrade; sourceId: string | null; targetId: string }) => this.clashResult(p))
  }

  // --- Overhead markers --------------------------------------------------------

  private onZoneCreated(zone: ActiveAoeZone): void {
    const kind = zone.def.marker
    if (!kind || !zone.anchorEntityId) return
    const id = zone.anchorEntityId
    const color = MARKER_COLORS[kind]
    const follow = (f: Fx, y: number) => {
      const e = this.vfx.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, this.vfx.heightOf(e) + y, e.position.y)
    }
    const fx: Fx[] = []
    if (kind === 'buster') {
      fx.push(this.vfx.spawn('billboard', 'tankCrest', color, Infinity, (f) => {
        follow(f, 1.3)
        const pulse = 1 + Math.sin(f.age / 90) * 0.06
        f.mesh.scaling.set(1.1 * pulse, 2.2 * pulse, 1)
      }))
    } else {
      // Spread: four rotating arcs; stack: glow + chevrons pointing in
      fx.push(this.vfx.spawn('billboard', kind === 'spread' ? 'spreadArcs' : 'shareGlow', color, Infinity, (f) => {
        follow(f, 1.1)
        f.mesh.rotation.z = f.age / 500
        const intro = Math.min(1, f.age / 200)
        f.mesh.scaling.setAll(1.7 * (1.4 - 0.4 * intro))
        f.mesh.visibility = intro
      }))
    }
    // Ground ring under the marked entity so the marker reads from a top-down camera
    fx.push(this.vfx.spawn('ground', 'ringAll', color, Infinity, (f) => {
      const e = this.vfx.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, 0.06, e.position.y)
      const s = 2.6 + Math.sin(f.age / 160) * 0.15
      f.mesh.scaling.set(s, 1, s)
      f.mesh.visibility = 0.7
    }))
    this.markers.set(zone.id, fx)
  }

  private endMarker(zoneId: string): void {
    const fx = this.markers.get(zoneId)
    if (!fx) return
    this.markers.delete(zoneId)
    for (const f of fx) f.life = 0
  }

  // --- Blade clash ---------------------------------------------------------------

  private clashStart(p: { id: string; targetId: string; windup: number }): void {
    const id = p.targetId
    const at = (f: Fx, y = 0.07) => {
      const e = this.vfx.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, y, e.position.y)
    }
    const fx: Fx[] = []
    // Shrinking approach ring: meets the target ring exactly when the strike lands
    fx.push(this.vfx.spawn('ground', 'ringBold', CLASH_GOLD, Infinity, (f) => {
      at(f, 0.08)
      const k = Math.min(1, f.age / p.windup)
      const s = 9 - 6.6 * k
      f.mesh.scaling.set(s, 1, s)
      f.mesh.visibility = 0.35 + 0.65 * k
    }))
    fx.push(this.vfx.spawn('ground', 'ringAll', Color3.White(), Infinity, (f) => {
      at(f)
      f.mesh.scaling.set(2.4, 1, 2.4)
      f.mesh.visibility = 0.6 + Math.sin(f.age / 70) * 0.25
    }))
    fx.push(this.vfx.spawn('billboard', 'exclamation', CLASH_RED, Infinity, (f) => {
      const e = this.vfx.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, this.vfx.heightOf(e) + 1.2, e.position.y)
      f.mesh.scaling.setAll(1.2 + Math.sin(f.age / 80) * 0.1)
    }))
    this.clashes.set(p.id, fx)
  }

  private clashResult(p: { id: string; grade: TimingGrade; sourceId: string | null; targetId: string }): void {
    for (const f of this.clashes.get(p.id) ?? []) f.life = 0
    this.clashes.delete(p.id)
    const target = this.vfx.entities.get(p.targetId)
    const source = p.sourceId ? this.vfx.entities.get(p.sourceId) : undefined
    if (!target) return
    const tp = this.vfx.chest(target)
    const sp = source ? this.vfx.chest(source) : tp
    // The clash point sits between the two blades, closer to the player
    const mid = Vector3.Lerp(tp, sp, 0.3)

    switch (p.grade) {
      case 'just':
        this.vfx.flash(mid, 'flashStar', CLASH_GOLD, 7, 520)
        this.vfx.flash(mid, 'swordCross', Color3.White(), 4.5, 380)
        this.vfx.flash(new Vector3(target.position.x, 0.08, target.position.y), 'ringThick', CLASH_GOLD, 9, 520, 'ground')
        this.vfx.burster('spark', 'holy').emit(mid.x, mid.y, mid.z, 60, { dirY: 0.5, spread: 2, jitter: 0.3 })
        this.vfx.burster('debris', 'holy').emit(mid.x, mid.y, mid.z, 18, { dirY: 0.8, spread: 1.5, jitter: 0.4 })
        this.vfx.sm.shake(0.45, 320)
        break
      case 'perfect':
        this.vfx.flash(mid, 'flashStar', Color3.White(), 5, 420)
        this.vfx.flash(mid, 'swordCross', CLASH_GOLD, 3.2, 300)
        this.vfx.burster('spark', 'physical').emit(mid.x, mid.y, mid.z, 36, { dirY: 0.5, spread: 1.8, jitter: 0.3 })
        this.vfx.sm.shake(0.3, 260)
        break
      case 'good':
        this.vfx.flash(mid, 'spark', Color3.White(), 3, 260)
        this.vfx.burster('spark', 'physical').emit(mid.x, mid.y, mid.z, 18, { dirY: 0.4, spread: 1.4, jitter: 0.3 })
        this.vfx.impact(tp, 'physical', 0.8)
        this.vfx.sm.shake(0.25, 220)
        break
      default:
        // Missed: the flurry connects
        for (let i = 0; i < 4; i++) {
          this.vfx.later(i * 70, () => this.vfx.flash(tp, i % 2 ? 'crescent' : 'zan', CLASH_RED, 3.4, 220))
        }
        this.vfx.impact(tp, 'physical', 1.4)
        this.vfx.sm.shake(0.6, 420)
    }
  }
}
