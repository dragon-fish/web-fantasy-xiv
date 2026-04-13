// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Color4,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { ActiveAoeZone } from '@/skill/aoe-zone'

interface AoeMesh {
  mesh: Mesh
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
  waveRing?: Mesh
}

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()
  private telegraphMat: StandardMaterial
  private telegraphKbMat: StandardMaterial
  private resolveMat: StandardMaterial
  private edgeColor: Color4

  constructor(private scene: Scene, bus: EventBus) {
    this.telegraphMat = new StandardMaterial('aoe-telegraph', scene)
    this.telegraphMat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    this.telegraphMat.emissiveColor = new Color3(0.5, 0.3, 0.0)
    this.telegraphMat.alpha = 0.3

    this.telegraphKbMat = new StandardMaterial('aoe-telegraph-kb', scene)
    this.telegraphKbMat.diffuseColor = new Color3(1.0, 0.7, 0.2)
    this.telegraphKbMat.emissiveColor = new Color3(0.4, 0.25, 0.0)
    this.telegraphKbMat.alpha = 0.15

    this.resolveMat = new StandardMaterial('aoe-resolve', scene)
    this.resolveMat.diffuseColor = new Color3(1.0, 0.0, 0.0)
    this.resolveMat.emissiveColor = new Color3(0.8, 0.0, 0.0)
    this.resolveMat.alpha = 0.5

    // Edge rendering color for telegraph outlines
    this.edgeColor = new Color4(1.0, 0.5, 0.0, 0.6)

    bus.on('aoe:zone_created', (payload: { zone: ActiveAoeZone }) => {
      this.createMesh(payload.zone)
    })

    bus.on('aoe:zone_resolved', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      if (entry) {
        entry.phase = 'resolve'
        entry.mesh.material = this.resolveMat
        entry.mesh.disableEdgesRendering()
        if (entry.waveRing) {
          entry.waveRing.dispose()
          entry.waveRing = undefined
        }
      }
    })

    bus.on('aoe:zone_removed', (payload: { zone: ActiveAoeZone }) => {
      this.removeMesh(payload.zone.id)
    })
  }

  update(time: number): void {
    const pulse = 0.2 + Math.sin(time * 0.005) * 0.1
    this.telegraphMat.alpha = pulse
    this.telegraphKbMat.alpha = pulse * 0.5

    // Animate displacement wave rings
    for (const entry of this.meshes.values()) {
      if (!entry.waveRing || entry.phase !== 'telegraph') continue

      const hint = entry.zone.def.displacementHint
      if (!hint) continue

      const shape = entry.zone.def.shape
      let maxRadius = 0
      if (shape.type === 'circle') maxRadius = shape.radius
      else if (shape.type === 'ring') maxRadius = shape.outerRadius
      else continue

      // Wave cycle: 0→1 repeating over ~1.5s
      const cycle = (time * 0.0007) % 1

      if (hint === 'knockback') {
        // Expand outward: small → large
        const scale = 0.2 + cycle * 0.8
        entry.waveRing.scaling.set(scale, 1, scale)
        ;(entry.waveRing.material as StandardMaterial).alpha = (1 - cycle) * 0.3
      } else {
        // Contract inward: large → small
        const scale = 1.0 - cycle * 0.8
        entry.waveRing.scaling.set(scale, 1, scale)
        ;(entry.waveRing.material as StandardMaterial).alpha = cycle * 0.3
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
          radius: shape.radius, tessellation: 48,
        }, this.scene)
        break

      case 'fan':
        mesh = MeshBuilder.CreateDisc(`aoe-${zone.id}`, {
          radius: shape.radius, tessellation: 48,
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
        mesh.enableEdgesRendering()
        mesh.edgesWidth = 2.0
        mesh.edgesColor = this.edgeColor
        const waveRing = hasDisplacement ? this.createWaveRing(zone) : undefined
        this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', waveRing })
        return

      case 'rect':
        mesh = MeshBuilder.CreatePlane(`aoe-${zone.id}`, {
          width: shape.width, height: shape.length,
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

    // Edge outline for telegraph boundary
    mesh.enableEdgesRendering()
    mesh.edgesWidth = 2.0
    mesh.edgesColor = this.edgeColor

    const waveRing = hasDisplacement ? this.createWaveRing(zone) : undefined
    this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', waveRing })
  }

  /** Create a torus ring that scales in/out to indicate displacement direction */
  private createWaveRing(zone: ActiveAoeZone): Mesh {
    const shape = zone.def.shape
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

    const mat = new StandardMaterial(`wave-mat-${zone.id}`, this.scene)
    mat.diffuseColor = new Color3(1.0, 0.6, 0.0)
    mat.emissiveColor = new Color3(0.6, 0.3, 0.0)
    mat.alpha = 0.3
    ring.material = mat

    return ring
  }

  private removeMesh(zoneId: string): void {
    const entry = this.meshes.get(zoneId)
    if (!entry) return
    entry.mesh.dispose()
    if (entry.waveRing) {
      entry.waveRing.material?.dispose()
      entry.waveRing.dispose()
    }
    this.meshes.delete(zoneId)
  }
}
