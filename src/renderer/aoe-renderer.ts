// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'

interface AoeMesh {
  mesh: Mesh
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
}

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()
  private telegraphMat: StandardMaterial
  private resolveMat: StandardMaterial

  constructor(private scene: Scene, bus: EventBus) {
    // Telegraph: semi-transparent orange, pulsing
    this.telegraphMat = new StandardMaterial('aoe-telegraph', scene)
    this.telegraphMat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    this.telegraphMat.emissiveColor = new Color3(0.5, 0.3, 0.0)
    this.telegraphMat.alpha = 0.3

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
      }
    })

    bus.on('aoe:zone_removed', (payload: { zone: ActiveAoeZone }) => {
      this.removeMesh(payload.zone.id)
    })
  }

  /** Call each frame to animate telegraph pulse */
  update(time: number): void {
    const pulse = 0.2 + Math.sin(time * 0.005) * 0.1
    this.telegraphMat.alpha = pulse
  }

  private createMesh(zone: ActiveAoeZone): void {
    const { shape } = zone.def
    let mesh: Mesh

    switch (shape.type) {
      case 'circle':
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
        }, this.scene)
        break

      case 'fan': {
        // Approximate fan with a disc sector using custom mesh or full disc
        // For prototype, use a disc and note it's approximate
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius,
          tessellation: 48,
          arc: shape.angle / 360,
        }, this.scene)
        break
      }

      case 'ring':
        // Use a torus as approximation
        mesh = MeshBuilder.CreateTorus(`aoe-${zone.id}`, {
          diameter: shape.innerRadius + shape.outerRadius,
          thickness: shape.outerRadius - shape.innerRadius,
          tessellation: 48,
        }, this.scene)
        mesh.position.y = 0.02
        this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph' })
        mesh.material = this.telegraphMat
        return // torus doesn't need the rotation below

      case 'rect':
        mesh = MeshBuilder.CreatePlane(`aoe-${zone.id}`, {
          width: shape.width,
          height: shape.length,
        }, this.scene)
        break

      default:
        return
    }

    // Lay flat on ground
    mesh.rotation.x = Math.PI / 2
    mesh.position.set(zone.center.x, 0.02, zone.center.y)

    // Apply facing rotation (around Y axis)
    // After rotation.x = PI/2, CreateDisc arc starts at +X (east=90°), sweeps CCW.
    // Arc center is at (90 - A/2)°. To align center with facing F:
    //   rotation.y = (F - 90 + A/2) * PI/180
    // For non-fan shapes (rect/circle), simply rotate by facing.
    if (shape.type === 'fan') {
      mesh.rotation.y = ((zone.facing - 90 + shape.angle / 2) * Math.PI) / 180
    } else {
      mesh.rotation.y = (zone.facing * Math.PI) / 180
    }

    mesh.material = this.telegraphMat

    this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph' })
  }

  private removeMesh(zoneId: string): void {
    const entry = this.meshes.get(zoneId)
    if (!entry) return
    entry.mesh.dispose()
    this.meshes.delete(zoneId)
  }
}
