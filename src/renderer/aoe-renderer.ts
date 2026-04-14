// src/renderer/aoe-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Color4,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { EntityManager } from '@/entity/entity-manager'
import type { ActiveAoeZone } from '@/skill/aoe-zone'

interface AoeMesh {
  mesh: Mesh
  zone: ActiveAoeZone
  phase: 'telegraph' | 'resolve'
  waveRing?: Mesh
  isPlayerZone: boolean
}

export class AoeRenderer {
  private meshes = new Map<string, AoeMesh>()

  // Enemy (orange)
  private enemyTelegraphMat: StandardMaterial
  private enemyKbMat: StandardMaterial
  private enemyResolveMat: StandardMaterial
  private enemyEdgeColor: Color4

  // Player (blue)
  private playerTelegraphMat: StandardMaterial
  private playerResolveMat: StandardMaterial
  private playerEdgeColor: Color4

  constructor(private scene: Scene, bus: EventBus, private entityMgr: EntityManager) {
    // Enemy telegraph: orange
    this.enemyTelegraphMat = new StandardMaterial('aoe-enemy-tel', scene)
    this.enemyTelegraphMat.diffuseColor = new Color3(0.95, 0.45, 0.0)
    this.enemyTelegraphMat.emissiveColor = new Color3(0.5, 0.2, 0.0)
    this.enemyTelegraphMat.alpha = 0.3

    this.enemyKbMat = new StandardMaterial('aoe-enemy-kb', scene)
    this.enemyKbMat.diffuseColor = new Color3(0.95, 0.5, 0.05)
    this.enemyKbMat.emissiveColor = new Color3(0.4, 0.15, 0.0)
    this.enemyKbMat.alpha = 0.15

    this.enemyResolveMat = new StandardMaterial('aoe-enemy-resolve', scene)
    this.enemyResolveMat.diffuseColor = new Color3(1.0, 0.0, 0.0)
    this.enemyResolveMat.emissiveColor = new Color3(0.8, 0.0, 0.0)
    this.enemyResolveMat.alpha = 0.5

    this.enemyEdgeColor = new Color4(0.95, 0.4, 0.0, 0.7)

    // Player telegraph: blue
    this.playerTelegraphMat = new StandardMaterial('aoe-player-tel', scene)
    this.playerTelegraphMat.diffuseColor = new Color3(0.2, 0.5, 0.95)
    this.playerTelegraphMat.emissiveColor = new Color3(0.1, 0.25, 0.5)
    this.playerTelegraphMat.alpha = 0.3

    this.playerResolveMat = new StandardMaterial('aoe-player-resolve', scene)
    this.playerResolveMat.diffuseColor = new Color3(0.3, 0.5, 1.0)
    this.playerResolveMat.emissiveColor = new Color3(0.2, 0.3, 0.8)
    this.playerResolveMat.alpha = 0.5

    this.playerEdgeColor = new Color4(0.3, 0.5, 1.0, 0.7)

    bus.on('aoe:zone_created', (payload: { zone: ActiveAoeZone }) => {
      this.createMesh(payload.zone)
    })

    bus.on('aoe:zone_resolved', (payload: { zone: ActiveAoeZone }) => {
      const entry = this.meshes.get(payload.zone.id)
      if (entry) {
        entry.phase = 'resolve'
        entry.mesh.material = entry.isPlayerZone ? this.playerResolveMat : this.enemyResolveMat
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
    this.enemyTelegraphMat.alpha = pulse
    this.enemyKbMat.alpha = pulse * 0.5
    this.playerTelegraphMat.alpha = pulse

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
        const cx = entry.zone.center.x + Math.sin(facingRad) * offset
        const cz = entry.zone.center.y + Math.cos(facingRad) * offset
        entry.waveRing.position.set(cx, 0.04, cz)
        ;(entry.waveRing.material as StandardMaterial).alpha = (hint === 'knockback' ? 1 - cycle : cycle) * 0.35
      } else {
        // Circular wave: scale ring in/out
        if (hint === 'knockback') {
          const scale = 0.2 + cycle * 0.8
          entry.waveRing.scaling.set(scale, 1, scale)
          ;(entry.waveRing.material as StandardMaterial).alpha = (1 - cycle) * 0.3
        } else {
          const scale = 1.0 - cycle * 0.8
          entry.waveRing.scaling.set(scale, 1, scale)
          ;(entry.waveRing.material as StandardMaterial).alpha = cycle * 0.3
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
    const { shape } = zone.def
    const isPlayer = this.isPlayerCaster(zone)
    const hasDisplacement = !!zone.def.displacementHint
    let mesh: Mesh

    const telegraphMat = isPlayer
      ? this.playerTelegraphMat
      : (hasDisplacement ? this.enemyKbMat : this.enemyTelegraphMat)
    const edgeColor = isPlayer ? this.playerEdgeColor : this.enemyEdgeColor

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
        mesh.material = telegraphMat
        mesh.enableEdgesRendering()
        mesh.edgesWidth = 2.0
        mesh.edgesColor = edgeColor
        const waveRing = hasDisplacement ? this.createWaveRing(zone) : undefined
        this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', waveRing, isPlayerZone: isPlayer })
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

    mesh.material = telegraphMat
    mesh.enableEdgesRendering()
    mesh.edgesWidth = 2.0
    mesh.edgesColor = edgeColor

    const waveRing = hasDisplacement ? this.createWaveRing(zone) : undefined
    this.meshes.set(zone.id, { mesh, zone, phase: 'telegraph', waveRing, isPlayerZone: isPlayer })
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
    entry.mesh.dispose()
    if (entry.waveRing) {
      entry.waveRing.material?.dispose()
      entry.waveRing.dispose()
    }
    this.meshes.delete(zoneId)
  }
}
