// src/renderer/vfx/hymn-vfx.ts
// Visuals for 朱红旋律 (鸳鸯锅) and 傀儡旋律: the four coloured kana quadrants on the ring floor,
// the icon columns the firebird flies through, floor eruptions, and the forced-march tether.
import {
  Color3, DynamicTexture, MeshBuilder, StandardMaterial, Texture, TransformNode, Vector3,
  type Mesh, type Scene,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'
import { sampleZonePoints } from './zone-sampling'
import type { VfxRenderer } from './vfx-renderer'

type Fx = ReturnType<VfxRenderer['spawn']>

/** NE 黑「り」, SE 黄「な」, SW 青「う」, NW 紫「ろ」 (quadrant index order) */
const QUADRANTS = [
  { kana: 'り', fill: '#1b1b22', glyph: '#f4f4f4' },
  { kana: 'な', fill: '#f2c94c', glyph: '#3a2a00' },
  { kana: 'う', fill: '#3d9bff', glyph: '#f4fbff' },
  { kana: 'ろ', fill: '#b05cff', glyph: '#fbf4ff' },
]
const ENRAGE = QUADRANTS[3]
const QUADRANT_FACING = [45, 135, 225, 315]
const FLOOR_RADIUS = 21
const RING_INNER = 5.5
const RING_OUTER = 20

/** Unlit alpha-blended material: shows dark colours too (additive VFX materials can't) */
function alphaMaterial(name: string, scene: Scene, tex: Texture): StandardMaterial {
  const m = new StandardMaterial(name, scene)
  m.disableLighting = true
  m.diffuseColor = Color3.Black()
  m.specularColor = Color3.Black()
  m.emissiveColor = Color3.Black()
  m.emissiveTexture = tex
  m.opacityTexture = tex
  m.backFaceCulling = false
  m.disableDepthWrite = true
  return m
}

export class HymnVfx {
  private scene: Scene
  private floor: Mesh | null = null
  private floorTex: DynamicTexture | null = null
  private iconMats: StandardMaterial[] = []
  private hymns = new Map<string, Mesh[]>()
  private marches = new Map<string, Fx[]>()

  constructor(private vfx: VfxRenderer, bus: EventBus) {
    this.scene = vfx.sm.scene
    bus.on('mechanic:hymn_start', (p: { id: string; icons: { x: number; y: number; quadrant: number }[]; enrage: boolean }) => this.hymnStart(p))
    bus.on('mechanic:hymn_burst', (p: { id: string; index: number; quadrant: number }) => this.hymnBurst(p))
    bus.on('mechanic:hymn_end', (p: { id: string }) => this.hymnEnd(p.id))
    bus.on('aoe:zone_resolved', ({ zone }: { zone: ActiveAoeZone }) => { if (zone.skillId.startsWith('hotspot')) this.erupt(zone) })
    bus.on('mechanic:march_start', (p: { id: string; dir: number; delay: number; targetId: string }) => this.marchStart(p))
    bus.on('mechanic:march_go', (p: { id: string }) => this.marchGo(p.id))
    bus.on('mechanic:march_end', (p: { id: string }) => this.marchEnd(p.id))
  }

  // --- Floor quadrants ---------------------------------------------------------------

  private drawFloor(enrage: boolean, strength: number): void {
    if (!this.floorTex) return
    const size = 1024, c = size / 2, k = c / FLOOR_RADIUS
    const ctx = this.floorTex.getContext() as CanvasRenderingContext2D
    ctx.clearRect(0, 0, size, size)
    for (let i = 0; i < 4; i++) {
      const q = enrage ? ENRAGE : QUADRANTS[i]
      // Canvas: up = north, right = east; compass facing f → canvas angle f - 90°
      const a0 = ((QUADRANT_FACING[i] - 45 - 90) * Math.PI) / 180
      const a1 = ((QUADRANT_FACING[i] + 45 - 90) * Math.PI) / 180
      ctx.beginPath()
      ctx.arc(c, c, RING_OUTER * k, a0, a1)
      ctx.arc(c, c, RING_INNER * k, a1, a0, true)
      ctx.closePath()
      ctx.globalAlpha = strength
      ctx.fillStyle = q.fill
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 6
      ctx.strokeStyle = 'rgba(255,240,220,0.55)'
      ctx.stroke()
      const am = ((QUADRANT_FACING[i] - 90) * Math.PI) / 180
      const r = ((RING_INNER + RING_OUTER) / 2) * k
      ctx.font = `bold ${Math.round(7 * k)}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.globalAlpha = Math.min(1, strength + 0.35)
      ctx.lineWidth = 10
      ctx.strokeStyle = q.fill === '#1b1b22' ? '#000' : 'rgba(0,0,0,0.55)'
      ctx.strokeText(q.kana, c + Math.cos(am) * r, c + Math.sin(am) * r)
      ctx.fillStyle = q.glyph
      ctx.fillText(q.kana, c + Math.cos(am) * r, c + Math.sin(am) * r)
      ctx.globalAlpha = 1
    }
    // invertY: canvas top must land on +Z (north) on the ground quad
    this.floorTex.update(true)
  }

  private ensureFloor(enrage: boolean): void {
    if (!this.floor) {
      this.floorTex = new DynamicTexture('hymn-floor', { width: 1024, height: 1024 }, this.scene, true)
      this.floorTex.hasAlpha = true
      this.floor = MeshBuilder.CreateGround('hymn-floor', { width: FLOOR_RADIUS * 2, height: FLOOR_RADIUS * 2 }, this.scene)
      this.floor.position.y = 0.025
      this.floor.isPickable = false
      this.floor.material = alphaMaterial('hymn-floor-mat', this.scene, this.floorTex)
    }
    this.drawFloor(enrage, enrage ? 0.6 : 0.32)
  }

  // --- Hymn ------------------------------------------------------------------------

  private iconMaterial(quadrant: number): StandardMaterial {
    if (!this.iconMats[quadrant]) {
      const q = QUADRANTS[quadrant]
      const tex = new DynamicTexture(`hymn-icon-${quadrant}`, { width: 128, height: 128 }, this.scene, true)
      const ctx = tex.getContext() as CanvasRenderingContext2D
      const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 62)
      g.addColorStop(0, q.fill)
      g.addColorStop(0.75, q.fill)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill()
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffe9c8'
      ctx.beginPath(); ctx.arc(64, 64, 50, 0, Math.PI * 2); ctx.stroke()
      ctx.font = 'bold 72px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillStyle = q.glyph
      ctx.fillText(q.kana, 64, 68)
      tex.hasAlpha = true
      tex.update(true)
      this.iconMats[quadrant] = alphaMaterial(`hymn-icon-mat-${quadrant}`, this.scene, tex)
    }
    return this.iconMats[quadrant]
  }

  private hymnStart(p: { id: string; icons: { x: number; y: number; quadrant: number }[]; enrage: boolean }): void {
    this.ensureFloor(p.enrage)
    const meshes = p.icons.map((icon, i) => {
      const m = MeshBuilder.CreatePlane(`hymn-icon-${p.id}-${i}`, { size: 2.4 }, this.scene)
      m.billboardMode = TransformNode.BILLBOARDMODE_ALL
      m.position.set(icon.x, 2.2, icon.y)
      m.material = this.iconMaterial(icon.quadrant)
      m.isPickable = false
      return m
    })
    this.hymns.set(p.id, meshes)
  }

  private hymnBurst(p: { id: string; index: number }): void {
    const icon = this.hymns.get(p.id)?.[p.index]
    if (!icon) return
    // The firebird has reached this icon: it shatters into sparks
    this.vfx.flash(icon.position.clone(), 'flashStar', Color3.FromHexString('#ffb066'), 4, 300)
    this.vfx.burster('spark', 'fire').emit(icon.position.x, icon.position.y, icon.position.z, 14, { dirY: 0.4, spread: 1.4, jitter: 0.3 })
    icon.setEnabled(false)
  }

  private hymnEnd(id: string): void {
    for (const m of this.hymns.get(id) ?? []) m.dispose()
    this.hymns.delete(id)
  }

  /** Floor fire: flame columns burst up across the erupting quadrant */
  private erupt(zone: ActiveAoeZone): void {
    const orange = Color3.FromHexString('#ff8a3a')
    for (const pt of sampleZonePoints(zone.def.shape, zone.center, zone.facing, 7)) {
      const h = 4 + Math.random() * 3
      this.vfx.spawn('billboardY', 'fireMask', orange, 650, (f, t) => {
        f.mesh.position.set(pt.x, h / 2 * (0.4 + 0.6 * Math.min(1, t * 4)), pt.y)
        f.mesh.scaling.set(2.6, h * Math.min(1, t * 4), 1)
        f.mesh.visibility = 1 - t * t
      })
    }
  }

  // --- Forced march -------------------------------------------------------------------

  private marchStart(p: { id: string; dir: number; delay: number; targetId: string }): void {
    const rad = (p.dir * Math.PI) / 180
    const ux = Math.sin(rad), uy = Math.cos(rad)
    const red = Color3.FromHexString('#ff5a3c')
    const fx: Fx[] = []
    const player = () => this.vfx.entities.get(p.targetId)
    // Fireball parked outside the arena in the march direction
    const orb = () => { const e = player(); return e ? new Vector3(e.position.x + ux * 22, 2.4, e.position.y + uy * 22) : Vector3.Zero() }
    fx.push(this.vfx.spawn('billboard', 'fireOrb', red, Infinity, (f) => {
      f.mesh.position.copyFrom(orb())
      f.mesh.scaling.setAll(3.2 + Math.sin(f.age / 120) * 0.3)
    }))
    // Tether: beads between the player and the fireball
    for (let i = 1; i <= 10; i++) {
      fx.push(this.vfx.spawn('billboard', 'glow', red, Infinity, (f) => {
        const e = player()
        if (!e) return
        const o = orb()
        const k = (i / 11 + f.age / 2400) % 1
        f.mesh.position.set(e.position.x + (o.x - e.position.x) * k, 1.2 + (o.y - 1.2) * k, e.position.y + (o.z - e.position.y) * k)
        f.mesh.scaling.setAll(0.55)
      }))
    }
    // Ground arrow under the player showing where they will be dragged
    fx.push(this.vfx.spawn('flat', 'arrowBlue', Color3.White(), Infinity, (f) => {
      const e = player()
      if (!e) return
      f.mesh.renderingGroupId = 1
      f.mesh.position.set(e.position.x + ux * 1.6, 0.1, e.position.y + uy * 1.6)
      f.mesh.rotation.y = rad
      f.mesh.scaling.set(2.6, 1, 2.6)
    }))
    this.marches.set(p.id, fx)
  }

  private marchGo(id: string): void {
    const fx = this.marches.get(id)
    if (!fx) return
    // Tether snaps: keep only the arrow
    for (const f of fx.slice(0, -1)) f.life = 0
    this.marches.set(id, fx.slice(-1))
  }

  private marchEnd(id: string): void {
    for (const f of this.marches.get(id) ?? []) f.life = 0
    this.marches.delete(id)
  }
}
