// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  type Scene, type Mesh, type ShaderMaterial,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import { followsAnchor, type ActiveAoeZone } from '@/skill/aoe-zone'
import { createTelegraphMaterial, telegraphGeometry } from './aoe-shader'

interface AoeMesh {
  /** zone_removed arrived before the resolve flash finished */
  removed: boolean
  mesh: Mesh
  material: ShaderMaterial
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
  resolvedAt: number
  waveRing?: Mesh
  isPlayerZone: boolean
}

const ENEMY_FILL = new Color3(1.0, 0.42, 0.06)
const ENEMY_RIM = new Color3(1.0, 0.8, 0.4)
const PLAYER_FILL = new Color3(0.2, 0.5, 1.0)
const PLAYER_RIM = new Color3(0.65, 0.88, 1.0)
/** Markers riding on a party member (spread): FFXIV's purple circle */
const SPREAD_FILL = new Color3(0.7, 0.25, 1.0)
const SPREAD_RIM = new Color3(0.92, 0.75, 1.0)
const MIN_FLASH_MS = 260

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()
  private now = 0

  constructor(private scene: Scene, bus: EventBus, private entityMgr: EntityManager) {
    bus.on('aoe:zone_created', (payload: { zone: ActiveAoeZone }) => {
      this.createMesh(payload.zone)
    })

    bus.on('aoe:zone_resolved', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      if (entry) {
        entry.phase = 'resolve'
        entry.resolvedAt = this.now
        entry.material.setFloat('progress', 1)
        if (entry.waveRing) {
          entry.waveRing.material?.dispose()
          entry.waveRing.dispose()
          entry.waveRing = undefined
        }
      }
    })

    bus.on('aoe:zone_removed', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      // Short hitEffectDuration removes the zone before the minimum flash has played out
      if (entry?.phase === 'resolve') entry.removed = true
      else this.removeMesh(payload.zone.id)
    })
  }

  update(time: number): void {
    this.now = time
    const pulse = 0.92 + Math.sin(time * 0.005) * 0.08

    for (const entry of this.meshes.values()) {
      const { zone, material } = entry
      material.setFloat('time', time / 1000)
      // Following zones (target_live, party markers) move with their anchor until they resolve
      if (entry.phase === 'telegraph' && followsAnchor(zone.def.anchor)) this.place(entry.mesh, zone)
      if (entry.phase === 'telegraph') {
        const span = Math.max(1, zone.def.resolveDelay - zone.telegraphAt)
        material.setFloat('progress', Math.min(1, Math.max(0, (zone.elapsed - zone.telegraphAt) / span)))
        material.setFloat('opacity', (zone.def.displacementHint && !entry.isPlayerZone ? 0.6 : 1) * pulse)
      } else {
        const duration = Math.max(MIN_FLASH_MS, zone.def.hitEffectDuration)
        const t = Math.min(1, (time - entry.resolvedAt) / duration)
        material.setFloat('flash', 1 - t)
        material.setFloat('opacity', 1 - t * t)
        if (t >= 1 && entry.removed) this.removeMesh(zone.id)
      }
    }

    // Animate displacement waves
    for (const entry of this.meshes.values()) {
      if (!entry.waveRing || entry.phase !== 'telegraph') continue
      const hint = entry.zone.def.displacementHint
      if (!hint) continue
      const shape = entry.zone.def.shape

      const cycle = (time * 0.0007) % 1

      if (shape.type === 'rect') {
        // Linear wave: translate bar along facing direction
        const facingRad = (entry.zone.facing * Math.PI) / 180
        const halfLen = shape.length / 2
        // knockback: bar moves outward (along facing), pull: bar moves inward
        const t = hint === 'knockback' ? cycle : 1 - cycle
        const offset = -halfLen + t * shape.length
        const cx = entry.zone.center.x + Math.sin(facingRad) * (halfLen + offset)
        const cz = entry.zone.center.y + Math.cos(facingRad) * (halfLen + offset)
        entry.waveRing.position.set(cx, 0.04, cz)
        ;(entry.waveRing.material as StandardMaterial).alpha = (hint === 'knockback' ? 1 - cycle : cycle) * 0.45
      } else {
        // Circular wave: scale ring in/out
        if (hint === 'knockback') {
          const scale = 0.2 + cycle * 0.8
          entry.waveRing.scaling.set(scale, 1, scale)
          ;(entry.waveRing.material as StandardMaterial).alpha = (1 - cycle) * 0.45
        } else {
          const scale = 1.0 - cycle * 0.8
          entry.waveRing.scaling.set(scale, 1, scale)
          ;(entry.waveRing.material as StandardMaterial).alpha = cycle * 0.45
        }
      }
    }
  }

  private isPlayerCaster(zone: ActiveAoeZone): boolean {
    if (!zone.casterId) return false
    const entity = this.entityMgr.get(zone.casterId)
    return entity?.type === 'player'
  }

  private createMesh(zone: ActiveAoeZone): void {
    // Shared damage shows FFXIV's stack chevrons instead (MechanicVfx), never a danger fill
    if (zone.def.telegraph === false || zone.def.share || zone.def.targeted) return
    const isPlayer = this.isPlayerCaster(zone)
    const geo = telegraphGeometry(zone.def.shape)
    if (!geo) return

    const mesh = MeshBuilder.CreateGround(`aoe-${zone.id}`, { width: geo.quadWidth, height: geo.quadLength }, this.scene)
    const [fill, rim] = isPlayer ? [PLAYER_FILL, PLAYER_RIM]
      : zone.def.anchor.type === 'party' && zone.def.marker !== 'buster' ? [SPREAD_FILL, SPREAD_RIM]
        : [ENEMY_FILL, ENEMY_RIM]
    const material = createTelegraphMaterial(this.scene, `aoe-mat-${zone.id}`, geo, fill, rim)
    mesh.material = material
    mesh.isPickable = false

    this.place(mesh, zone)

    const waveRing = zone.def.displacementHint ? this.createWaveRing(zone) : undefined
    this.meshes.set(zone.id, { mesh, material, zone, phase: 'telegraph', resolvedAt: 0, waveRing, isPlayerZone: isPlayer, removed: false })
  }

  private place(mesh: Mesh, zone: ActiveAoeZone): void {
    const geo = telegraphGeometry(zone.def.shape)
    const facingRad = (zone.facing * Math.PI) / 180
    mesh.rotation.y = facingRad
    mesh.position.set(
      zone.center.x + Math.sin(facingRad) * geo.forwardOffset,
      0.03,
      zone.center.y + Math.cos(facingRad) * geo.forwardOffset,
    )
  }

  /** Create wave mesh: torus for circle/ring, plane bar for rect */
  private createWaveRing(zone: ActiveAoeZone): Mesh {
    const shape = zone.def.shape
    const mat = new StandardMaterial(`wave-mat-${zone.id}`, this.scene)
    mat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    mat.emissiveColor = new Color3(0.6, 0.3, 0.0)
    mat.alpha = 0.3

    if (shape.type === 'rect') {
      // Linear wave bar: a thin plane perpendicular to the push direction
      const barWidth = shape.width
      const wave = MeshBuilder.CreatePlane(`wave-${zone.id}`, {
        width: barWidth,
        height: 0.5,
      }, this.scene)
      wave.rotation.x = Math.PI / 2 // lay flat
      wave.rotation.y = (zone.facing * Math.PI) / 180
      wave.position.set(zone.center.x, 0.04, zone.center.y)
      wave.material = mat
      return wave
    }

    // Circle/ring: torus wave
    let radius = 0
    if (shape.type === 'circle') radius = shape.radius
    else if (shape.type === 'ring') radius = (shape.innerRadius + shape.outerRadius) / 2
    else radius = 5

    const ring = MeshBuilder.CreateTorus(`wave-${zone.id}`, {
      diameter: radius * 2,
      thickness: 0.3,
      tessellation: 48,
    }, this.scene)
    ring.position.set(zone.center.x, 0.04, zone.center.y)
    ring.material = mat
    return ring
  }

  private removeMesh(zoneId: string): void {
    const entry = this.meshes.get(zoneId)
    if (!entry) return
    entry.material.dispose()
    entry.mesh.dispose()
    if (entry.waveRing) {
      entry.waveRing.material?.dispose()
      entry.waveRing.dispose()
    }
    this.meshes.delete(zoneId)
  }
}
