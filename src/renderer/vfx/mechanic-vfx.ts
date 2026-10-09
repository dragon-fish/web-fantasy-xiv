// src/renderer/vfx/mechanic-vfx.ts
// Visuals for encounter mechanics: overhead markers on pending zones and the
// blade-clash (拼刀) parry. Built on VfxRenderer's pooled quads and bursters.
import { Color3, Vector3 } from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'
import type { ClashGrade } from '@/game/parry-prompt'
import type { VfxRenderer } from './vfx-renderer'
import { TankbusterMarker } from './tankbuster-marker'
import { LockOnMarker } from './lockon-marker'
import { StackMarker, STACK_CIRCLE_CHEVRONS, STACK_LINE_CHEVRONS } from './stack-marker'

type Fx = ReturnType<VfxRenderer['spawn']>

interface DanceView {
  ring: Fx[]
  center: { x: number; y: number }
  radius: number
  /** Notes in flight: falling chevron + approach ring, keyed by note index */
  notes: Map<number, { dir: number; fx: Fx[] }>
  /** Floor arrow for the next note to be judged (only one at a time) */
  floor: { index: number; fx: Fx } | null
}

/** Distance a note chevron flies in from, and the peak of its arc */
const DANCE_FLY_FROM = 24
const DANCE_ARC = 3

const MARKER_COLORS = {
  spread: Color3.FromHexString('#ff6fd8'),
  stack: Color3.FromHexString('#ffd36b'),
  buster: Color3.FromHexString('#ff4a3a'),
  knockback: Color3.FromHexString('#ff9a3c'),
  pull: Color3.FromHexString('#7fb8ff'),
}
const DANCE_GOLD = Color3.FromHexString('#ffd27a')
const CLASH_GOLD = Color3.FromHexString('#ffe6a0')
const CLASH_RED = Color3.FromHexString('#ff3b2f')

export class MechanicVfx {
  private markers = new Map<string, Fx[]>()
  private clashes = new Map<string, Fx[]>()
  private dances = new Map<string, DanceView>()

  constructor(private vfx: VfxRenderer, bus: EventBus) {
    bus.on('aoe:zone_created', ({ zone }: { zone: ActiveAoeZone }) => this.onZoneCreated(zone))
    bus.on('aoe:zone_resolved', ({ zone }: { zone: ActiveAoeZone }) => this.endMarker(zone.id))
    bus.on('aoe:zone_removed', ({ zone }: { zone: ActiveAoeZone }) => this.endMarker(zone.id))
    bus.on('mechanic:clash_start', (p: { id: string; sourceId: string | null; targetId: string; windup: number }) => this.clashStart(p))
    bus.on('mechanic:clash_result', (p: { id: string; grade: ClashGrade; sourceId: string | null; targetId: string }) => this.clashResult(p))
    bus.on('mechanic:dance_start', (p: { id: string; center: { x: number; y: number }; radius: number }) => this.danceStart(p))
    bus.on('mechanic:dance_note', (p: { id: string; index: number; dir: number; lead: number }) => this.danceNote(p))
    bus.on('mechanic:dance_judge', (p: { id: string; index: number; success: boolean }) => this.danceJudge(p))
    bus.on('mechanic:dance_end', (p: { id: string }) => this.danceEnd(p.id))
    bus.on('arena:morphed', (p: { hole: number }) => this.floorBreak(p.hole))
  }

  // --- Overhead markers --------------------------------------------------------

  private onZoneCreated(zone: ActiveAoeZone): void {
    if (zone.def.share) this.stackFloor(zone)
    const kind = zone.def.marker
    if (!kind || !zone.anchorEntityId) return
    const id = zone.anchorEntityId
    const color = MARKER_COLORS[kind]
    const follow = (f: Fx, y: number) => {
      const e = this.vfx.entities.get(id)
      if (e) f.mesh.position.set(e.position.x, this.vfx.heightOf(e) + y, e.position.y)
    }
    const fx: Fx[] = []
    if (kind === 'knockback' || kind === 'pull') {
      // Eight chevrons streaming outward (knockback) or inward (pull) around the source
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        for (const phase of [0, 0.5]) {
          fx.push(this.vfx.spawn('flat', 'chevronUp', color, Infinity, (f) => {
            const e = this.vfx.entities.get(id)
            if (!e) return
            const cyc = ((f.age / 1100) + phase) % 1
            const k = kind === 'knockback' ? cyc : 1 - cyc
            const r = 3 + k * 8
            f.mesh.position.set(e.position.x + Math.sin(a) * r, 0.08, e.position.y + Math.cos(a) * r)
            // The 'chevron_up' texture actually points +X (east) at rotation 0, hence the -90°;
            // then face outward (knockback) or inward (pull) along the radial angle `a`
            f.mesh.rotation.y = a - Math.PI / 2 + (kind === 'pull' ? Math.PI : 0)
            f.mesh.scaling.set(1.6, 1, 1.6)
            f.mesh.visibility = Math.sin(cyc * Math.PI) * 0.9
          }))
        }
      }
      this.markers.set(zone.id, fx)
      return
    }
    if (kind === 'buster') {
      // Self-built meshes; a soft red floor glow drives them on the VFX clock (pause-aware)
      const marker = new TankbusterMarker(this.vfx.sm.scene)
      const driver = this.vfx.spawn('ground', 'glowDisc', color, Infinity, (f) => {
        const e = this.vfx.entities.get(id)
        if (!e) return
        f.mesh.position.set(e.position.x, 0.05, e.position.y)
        const s = Math.max(1.3, e.size + 0.8) * 3
        f.mesh.scaling.set(s, 1, s)
        f.mesh.visibility = 0.35
        marker.update(e.position.x, e.position.y, this.vfx.heightOf(e), e.size, f.age)
      })
      driver.onDone = () => marker.dispose()
      this.markers.set(zone.id, [driver])
      return
    }
    if (kind === 'spread') {
      // FFXIV lock-on: red crystal sigil over the head, dark red ring at the feet
      const marker = new LockOnMarker(this.vfx.sm.scene)
      const driver = this.vfx.spawn('ground', 'glowDisc', color, Infinity, (f) => {
        f.mesh.visibility = 0
        const e = this.vfx.entities.get(id)
        if (e) marker.update(e.position.x, e.position.y, this.vfx.heightOf(e), e.size, f.age)
      })
      driver.onDone = () => marker.dispose()
      this.markers.set(zone.id, [driver])
      return
    }
    // Stack: glow + chevrons pointing in
    fx.push(this.vfx.spawn('billboard', 'shareGlow', color, Infinity, (f) => {
      follow(f, 1.1)
      f.mesh.rotation.z = f.age / 500
      const intro = Math.min(1, f.age / 200)
      f.mesh.scaling.setAll(1.7 * (1.4 - 0.4 * intro))
      f.mesh.visibility = intro
    }))
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

  /** Shared damage gets FFXIV's stack floor marker instead of a danger fill (see AoeRenderer) */
  private stackFloor(zone: ActiveAoeZone): void {
    const shape = zone.def.shape
    const line = shape.type === 'rect'
    const marker = new StackMarker(this.vfx.sm.scene, line ? STACK_LINE_CHEVRONS : STACK_CIRCLE_CHEVRONS)
    const color = Color3.FromHexString('#ffb040')
    const driver = this.vfx.spawn('ground', shape.type === 'circle' ? 'ringThin' : 'glowDisc', color, Infinity, (f) => {
      const intro = Math.min(1, f.age / 250)
      const { x, y } = zone.center
      if (shape.type === 'rect') {
        f.mesh.visibility = 0
        marker.updateLine(x, y, zone.facing, shape.length, shape.width, f.age, intro)
        return
      }
      const radius = shape.type === 'circle' ? shape.radius : 3
      f.mesh.position.set(x, 0.07, y)
      // ringThin peaks at ~0.78 of the quad's half-width
      const s = (radius * 2) / 0.78
      f.mesh.scaling.set(s, 1, s)
      f.mesh.visibility = 0.85 * intro
      marker.updateCircle(x, y, radius, f.age, intro)
    })
    driver.onDone = () => marker.dispose()
    this.markers.set(`${zone.id}:stack`, [driver])
  }

  private endMarker(zoneId: string): void {
    this.endFx(`${zoneId}:stack`)
    this.endFx(zoneId)
  }

  private endFx(key: string): void {
    const fx = this.markers.get(key)
    if (!fx) return
    this.markers.delete(key)
    for (const f of fx) f.life = 0
  }

  // --- Dance (Eternal Flame) -------------------------------------------------------

  private danceStart(p: { id: string; center: { x: number; y: number }; radius: number }): void {
    const { center, radius } = p
    const ring: Fx[] = [
      this.vfx.spawn('ground', 'ringBold', DANCE_GOLD, Infinity, (f) => {
        f.mesh.position.set(center.x, 0.07, center.y)
        const s = radius * 2.2 * (1 + Math.sin(f.age / 300) * 0.02)
        f.mesh.scaling.set(s, 1, s)
        f.mesh.visibility = Math.min(1, f.age / 400)
      }),
      this.vfx.spawn('ground', 'circleOrnate', DANCE_GOLD, Infinity, (f) => {
        f.mesh.position.set(center.x, 0.06, center.y)
        f.mesh.rotation.y = f.age / 4000
        f.mesh.scaling.set(radius * 2, 1, radius * 2)
        f.mesh.visibility = 0.45 * Math.min(1, f.age / 400)
      }),
    ]
    this.dances.set(p.id, { ring, center, radius, notes: new Map(), floor: null })
  }

  private danceNote(p: { id: string; index: number; dir: number; lead: number }): void {
    const d = this.dances.get(p.id)
    if (!d) return
    const { center, radius } = d
    const rad = (p.dir * Math.PI) / 180
    const lead = Math.max(1, p.lead)
    // Chevron pointing the note's way flies in from a random side and lands in the ring exactly
    // on the beat; separate approach paths keep queued notes apart. Group 1 so the player
    // standing in the ring never hides it.
    const from = Math.random() * Math.PI * 2
    const start = { x: center.x + Math.sin(from) * DANCE_FLY_FROM, y: center.y + Math.cos(from) * DANCE_FLY_FROM }
    const chevron = this.vfx.spawn('flat', 'chevronUp', DANCE_GOLD, Infinity, (f) => {
      f.mesh.renderingGroupId = 1
      const k = Math.min(1, f.age / lead)
      f.mesh.position.set(
        start.x + (center.x - start.x) * k,
        0.15 + Math.sin(k * Math.PI) * DANCE_ARC,
        start.y + (center.y - start.y) * k,
      )
      // 'chevron_up' points +X at rotation 0
      f.mesh.rotation.y = rad - Math.PI / 2
      const s = radius * 1.1
      f.mesh.scaling.set(s, 1, s)
      f.mesh.visibility = Math.min(1, f.age / 200)
    })
    // Approach ring closing onto the dance ring at the beat
    const approach = this.vfx.spawn('ground', 'ringThin', DANCE_GOLD, Infinity, (f) => {
      const k = Math.min(1, f.age / lead)
      f.mesh.position.set(center.x, 0.08, center.y)
      const s = radius * 2.2 * (1.8 - 0.8 * k)
      f.mesh.scaling.set(s, 1, s)
      f.mesh.visibility = 0.15 + 0.55 * k
    })
    d.notes.set(p.index, { dir: p.dir, fx: [chevron, approach] })
    this.refreshDanceFloor(d)
  }

  /** The floor shows only the next note's direction, never the queue behind it. */
  private refreshDanceFloor(d: DanceView): void {
    const next = d.notes.size ? Math.min(...d.notes.keys()) : null
    if (d.floor && d.floor.index === next) return
    if (d.floor) d.floor.fx.life = 0
    d.floor = null
    if (next === null) return
    const { center, radius } = d
    const rad = (d.notes.get(next)!.dir * Math.PI) / 180
    const fx = this.vfx.spawn('flat', 'arrowRed', Color3.White(), Infinity, (f) => {
      f.mesh.renderingGroupId = 1
      f.mesh.position.set(center.x, 0.1, center.y)
      f.mesh.rotation.y = rad
      const s = radius * 1.45 * Math.min(1, f.age / 150)
      f.mesh.scaling.set(s, 1, s)
    })
    d.floor = { index: next, fx }
  }

  private danceJudge(p: { id: string; index: number; success: boolean }): void {
    const d = this.dances.get(p.id)
    if (!d) return
    for (const f of d.notes.get(p.index)?.fx ?? []) f.life = 0
    d.notes.delete(p.index)
    this.refreshDanceFloor(d)
    const pos = new Vector3(d.center.x, 1.2, d.center.y)
    if (p.success) {
      this.vfx.flash(pos, 'flashStar', DANCE_GOLD, 4, 320)
      this.vfx.flash(new Vector3(d.center.x, 0.08, d.center.y), 'ringThick', DANCE_GOLD, d.radius * 3, 360, 'ground')
      this.vfx.burster('mote', 'holy').emit(pos.x, 0.3, pos.z, 18, { dirY: 1, spread: 0.5, jitter: 1 })
    } else {
      this.vfx.flash(pos, 'crescent', CLASH_RED, 4, 320)
      this.vfx.burster('spark', 'fire').emit(pos.x, pos.y, pos.z, 16, { dirY: 0.5, spread: 1.4, jitter: 0.3 })
      const boss = this.vfx.entities.get('boss')
      if (boss) this.vfx.flash(this.vfx.chest(boss), 'flashGold', CLASH_RED, 6, 400)
      this.vfx.sm.shake(0.2, 160)
    }
  }

  private danceEnd(id: string): void {
    const d = this.dances.get(id)
    if (!d) return
    for (const f of d.ring) f.life = 0
    for (const n of d.notes.values()) for (const f of n.fx) f.life = 0
    if (d.floor) d.floor.fx.life = 0
    this.dances.delete(id)
  }

  // --- Floor break ---------------------------------------------------------------

  private floorBreak(hole: number): void {
    const color = Color3.FromHexString('#ff7a3a')
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      for (const r of [hole, 20]) {
        this.vfx.burster('debris', 'earth').emit(Math.sin(a) * r, 0.3, Math.cos(a) * r, 3, { dirY: 1, spread: 0.8, jitter: 0.6 })
      }
      if (i % 3 === 0) this.vfx.flash(new Vector3(Math.sin(a) * hole, 0.6, Math.cos(a) * hole), 'flashGold', color, 3, 420)
    }
    this.vfx.flash(new Vector3(0, 0.1, 0), 'ringThick', color, hole * 2.6, 600, 'ground')
    this.vfx.sm.shake(0.8, 700)
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

  private clashResult(p: { id: string; grade: ClashGrade; sourceId: string | null; targetId: string }): void {
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
