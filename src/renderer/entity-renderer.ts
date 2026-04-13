// src/renderer/entity-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  TransformNode, Vector3,
  type Scene,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'

interface EntityMeshGroup {
  root: TransformNode
  body: any          // capsule body
  hitPoint: any      // small dot at feet center (hit detection point)
  facingArrow: any   // arrow showing facing direction
  rangeRing?: any    // auto-attack range ring at feet
  aggroFan?: any     // aggro detection fan (boss only, semi-transparent)
}

export class EntityRenderer {
  private meshes = new Map<string, EntityMeshGroup>()

  constructor(private scene: Scene, private bus: EventBus) {
    bus.on('entity:created', (payload: { entity: Entity }) => {
      this.createMesh(payload.entity)
    })

    bus.on('entity:died', (payload: { entity: Entity }) => {
      this.removeMesh(payload.entity.id)
    })
  }

  private createMesh(entity: Entity): void {
    const root = new TransformNode(`entity-${entity.id}`, this.scene)
    root.position.set(entity.position.x, 0, entity.position.y)

    const color = this.getColor(entity.type)
    const height = entity.type === 'boss' ? 3 : 1.8
    const radius = entity.size || 0.5

    // Body: capsule = cylinder + two hemisphere caps
    const body = MeshBuilder.CreateCapsule(`body-${entity.id}`, {
      height: height,
      radius: radius,
      tessellation: 16,
      subdivisions: 6,
    }, this.scene)
    body.position.y = height / 2
    body.parent = root

    const bodyMat = new StandardMaterial(`mat-${entity.id}`, this.scene)
    bodyMat.diffuseColor = color
    bodyMat.alpha = 0.85
    body.material = bodyMat

    // Hit detection point: small dark sphere at feet center
    const hitPoint = MeshBuilder.CreateSphere(`hit-${entity.id}`, {
      diameter: 0.2,
      segments: 8,
    }, this.scene)
    hitPoint.position.y = 0.05
    hitPoint.parent = root

    const hitMat = new StandardMaterial(`hit-mat-${entity.id}`, this.scene)
    hitMat.diffuseColor = new Color3(0.1, 0.1, 0.1)
    hitMat.emissiveColor = new Color3(0.2, 0.2, 0.2)
    hitPoint.material = hitMat

    // Facing arrow: cone pointing forward, flat on ground
    const facingArrow = MeshBuilder.CreateCylinder(`facing-${entity.id}`, {
      height: 0.6,
      diameterTop: 0,
      diameterBottom: 0.25,
      tessellation: 8,
    }, this.scene)
    // Lay cone flat, pointing along +Z (forward in local space)
    facingArrow.rotation.x = Math.PI / 2
    facingArrow.position.set(0, 0.08, radius + 0.4)
    facingArrow.parent = root

    const arrowMat = new StandardMaterial(`arrow-mat-${entity.id}`, this.scene)
    arrowMat.diffuseColor = color.scale(1.3) // slightly brighter than body
    arrowMat.emissiveColor = color.scale(0.3)
    facingArrow.material = arrowMat

    // Auto-attack range ring: thin torus at feet
    let rangeRing: any = null
    const autoAtkRange = (entity as any).autoAttackRange
    if (autoAtkRange && autoAtkRange > 0) {
      rangeRing = MeshBuilder.CreateTorus(`range-${entity.id}`, {
        diameter: autoAtkRange * 2,
        thickness: 0.04,
        tessellation: 48,
      }, this.scene)
      rangeRing.position.y = 0.02
      rangeRing.parent = root

      const rangeMat = new StandardMaterial(`range-mat-${entity.id}`, this.scene)
      rangeMat.diffuseColor = color.scale(0.6)
      rangeMat.emissiveColor = color.scale(0.15)
      rangeMat.alpha = 0.3
      rangeRing.material = rangeMat
    }

    // Aggro detection fan (boss/mob only): very faint 120° fan centered on forward direction
    let aggroFan: any = null
    if (entity.type === 'boss' || entity.type === 'mob') {
      const fanRange = autoAtkRange || 5
      aggroFan = MeshBuilder.CreateDisc(`aggro-${entity.id}`, {
        radius: fanRange,
        tessellation: 48,
        arc: 120 / 360,  // 120° aggro cone
      }, this.scene)
      aggroFan.rotation.x = Math.PI / 2  // lay flat
      // Rotate the fan so it's centered on +Z (forward direction)
      // CreateDisc arc starts at +X in local space, so rotate -60° (half of 120°)
      // to center it, then rotate -90° to align +X arc start with +Z forward
      aggroFan.rotation.y = -(Math.PI / 2) + (60 * Math.PI) / 180
      aggroFan.position.y = 0.01
      aggroFan.parent = root

      const aggroMat = new StandardMaterial(`aggro-mat-${entity.id}`, this.scene)
      aggroMat.diffuseColor = new Color3(1, 1, 0.6)
      aggroMat.emissiveColor = new Color3(0.2, 0.2, 0.1)
      aggroMat.alpha = 0.08  // very faint
      aggroFan.material = aggroMat
    }

    this.meshes.set(entity.id, { root, body, hitPoint, facingArrow, rangeRing, aggroFan })
  }

  /** Call each render frame to sync positions */
  updateAll(entities: Entity[]): void {
    for (const entity of entities) {
      const group = this.meshes.get(entity.id)
      if (!group) continue

      // Position: game x,y → Babylon x,z
      group.root.position.set(entity.position.x, 0, entity.position.y)

      // Facing: game degrees (0=north/+y, clockwise) → Babylon rotation.y
      // Babylon Y rotation: 0=+z, clockwise when viewed from above
      // Game: 0=+y(north)=+z(babylon), so direct mapping in radians
      group.root.rotation.y = (entity.facing * Math.PI) / 180
    }
  }

  private removeMesh(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return
    group.root.dispose()
    this.meshes.delete(entityId)
  }

  /** Flash entity bright for 100ms on hit */
  flashHit(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return

    const mat = group.body.material as StandardMaterial
    const original = mat.emissiveColor.clone()
    mat.emissiveColor = Color3.White().scale(0.6)

    setTimeout(() => {
      mat.emissiveColor = original
    }, 100)
  }

  private getColor(type: string): Color3 {
    switch (type) {
      case 'player': return new Color3(0.4, 0.85, 0.4)    // light green
      case 'boss': return new Color3(0.4, 0.7, 0.95)      // light blue
      case 'mob': return new Color3(0.4, 0.7, 0.95)       // light blue (same as boss)
      default: return new Color3(0.5, 0.5, 0.5)           // gray
    }
  }
}
