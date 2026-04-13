// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, TransformNode,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'

interface AoeMesh {
  mesh: Mesh
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
  arrows?: Mesh[] // displacement hint arrows
}

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()
  private telegraphMat: StandardMaterial
  private telegraphKbMat: StandardMaterial // lighter for knockback/pull base
  private resolveMat: StandardMaterial
  private arrowMat: StandardMaterial

  constructor(private scene: Scene, bus: EventBus) {
    // Telegraph: semi-transparent orange, pulsing
    this.telegraphMat = new StandardMaterial('aoe-telegraph', scene)
    this.telegraphMat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    this.telegraphMat.emissiveColor = new Color3(0.5, 0.3, 0.0)
    this.telegraphMat.alpha = 0.3

    // Knockback/pull base: fainter orange
    this.telegraphKbMat = new StandardMaterial('aoe-telegraph-kb', scene)
    this.telegraphKbMat.diffuseColor = new Color3(1.0, 0.7, 0.2)
    this.telegraphKbMat.emissiveColor = new Color3(0.4, 0.25, 0.0)
    this.telegraphKbMat.alpha = 0.15

    // Arrow overlay for displacement direction
    this.arrowMat = new StandardMaterial('aoe-arrow', scene)
    this.arrowMat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    this.arrowMat.emissiveColor = new Color3(0.6, 0.3, 0.0)
    this.arrowMat.alpha = 0.4

    // Resolve: red flash
    this.resolveMat = new StandardMaterial('aoe-resolve', scene)
    this.resolveMat.diffuseColor = new Color3(1.0, 0.0, 0.0)
    this.resolveMat.emissiveColor = new Color3(0.8, 0.0, 0.0)
    this.resolveMat.alpha = 0.5

    bus.on('aoe:zone_created', (payload: { zone: ActiveAoeZone }) => {
      this.createMesh(payload.zone)
    })

    bus.on('aoe:zone_resolved', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      if (entry) {
        entry.phase = 'resolve'
        entry.mesh.material = this.resolveMat
        // Hide arrows on resolve
        entry.arrows?.forEach((a) => a.dispose())
        entry.arrows = undefined
      }
    })

    bus.on('aoe:zone_removed', (payload: { zone: ActiveAoeZone }) => {
      this.removeMesh(payload.zone.id)
    })
  }

  /** Call each frame to animate telegraph pulse + displacement arrows */
  update(time: number): void {
    const pulse = 0.2 + Math.sin(time * 0.005) * 0.1
    this.telegraphMat.alpha = pulse
    this.telegraphKbMat.alpha = pulse * 0.5

    // Animate displacement arrows: cycle position along direction
    for (const entry of this.meshes.values()) {
      if (!entry.arrows || entry.phase !== 'telegraph') continue
      const hint = entry.zone.def.displacementHint
      if (!hint) continue

      // Cycle arrows outward (knockback) or inward (pull)
      const cycle = (time * 0.003) % 1 // 0-1 repeating
      const dir = hint === 'knockback' ? 1 : -1

      for (let i = 0; i < entry.arrows.length; i++) {
        const arrow = entry.arrows[i]
        const baseOffset = i / entry.arrows.length
        const t = (baseOffset + cycle * dir + 1) % 1
        // Fade: arrows near start are transparent, near end are opaque
        const fade = hint === 'knockback' ? t : 1 - t
        ;(arrow.material as StandardMaterial).alpha = fade * 0.5
      }
    }
  }

  private createMesh(zone: ActiveAoeZone): void {
    const { shape } = zone.def
    const hasDisplacement = !!zone.def.displacementHint
    let mesh: Mesh

    switch (shape.type) {
      case 'circle':
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
        }, this.scene)
        break

      case 'fan':
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
          arc: shape.angle / 360,
        }, this.scene)
        break

      case 'ring':
        mesh = MeshBuilder.CreateTorus(`aoe-${zone.id}`, {
          diameter: shape.innerRadius + shape.outerRadius,
          thickness: shape.outerRadius - shape.innerRadius,
          tessellation: 48,
        }, this.scene)
        mesh.position.y = 0.02
        mesh.material = hasDisplacement ? this.telegraphKbMat : this.telegraphMat
        const arrowsRing = hasDisplacement ? this.createDisplacementArrows(zone) : undefined
        this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', arrows: arrowsRing })
        return

      case 'rect':
        mesh = MeshBuilder.CreatePlane(`aoe-${zone.id}`, {
          width: shape.width,
          height: shape.length,
        }, this.scene)
        break

      default:
        return
    }

    mesh.rotation.x = Math.PI / 2

    if (shape.type === 'rect') {
      const facingRad = (zone.facing * Math.PI) / 180
      const offsetX = Math.sin(facingRad) * (shape.length / 2)
      const offsetZ = Math.cos(facingRad) * (shape.length / 2)
      mesh.position.set(zone.center.x + offsetX, 0.02, zone.center.y + offsetZ)
    } else {
      mesh.position.set(zone.center.x, 0.02, zone.center.y)
    }

    if (shape.type === 'fan') {
      mesh.rotation.y = ((zone.facing - 90 + shape.angle / 2) * Math.PI) / 180
    } else {
      mesh.rotation.y = (zone.facing * Math.PI) / 180
    }

    mesh.material = hasDisplacement ? this.telegraphKbMat : this.telegraphMat

    const arrows = hasDisplacement ? this.createDisplacementArrows(zone) : undefined
    this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', arrows })
  }

  /** Create small arrow cones radiating outward (knockback) or inward (pull) */
  private createDisplacementArrows(zone: ActiveAoeZone): Mesh[] {
    const arrows: Mesh[] = []
    const shape = zone.def.shape
    const hint = zone.def.displacementHint!

    // Determine radius for arrow placement
    let radius = 0
    if (shape.type === 'circle') radius = shape.radius * 0.6
    else if (shape.type === 'ring') radius = (shape.innerRadius + shape.outerRadius) / 2
    else return arrows

    const count = 8 // arrows around the circle
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2

      const arrow = MeshBuilder.CreateCylinder(`arrow-${zone.id}-${i}`, {
        height: 1.0,
        diameterTop: 0,
        diameterBottom: 0.4,
        tessellation: 6,
      }, this.scene)

      // Lay flat, point outward (knockback) or inward (pull)
      arrow.rotation.x = Math.PI / 2
      arrow.rotation.y = angle + (hint === 'pull' ? Math.PI : 0)

      const x = zone.center.x + Math.cos(angle) * radius
      const z = zone.center.y + Math.sin(angle) * radius
      arrow.position.set(x, 0.04, z)

      const mat = this.arrowMat.clone(`arrow-mat-${zone.id}-${i}`)
      arrow.material = mat

      arrows.push(arrow)
    }

    return arrows
  }

  private removeMesh(zoneId: string): void {
    const entry = this.meshes.get(zoneId)
    if (!entry) return
    entry.mesh.dispose()
    entry.arrows?.forEach((a) => {
      a.material?.dispose()
      a.dispose()
    })
    this.meshes.delete(zoneId)
  }
}
