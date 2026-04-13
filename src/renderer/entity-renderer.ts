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
  baseEmissive: Color3  // stored once at creation for flash restore
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
    body.renderingGroupId = 1

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
    hitPoint.renderingGroupId = 1

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
    facingArrow.renderingGroupId = 1

    const arrowMat = new StandardMaterial(`arrow-mat-${entity.id}`, this.scene)
    arrowMat.diffuseColor = color.scale(1.3) // slightly brighter than body
    arrowMat.emissiveColor = color.scale(0.3)
    facingArrow.material = arrowMat

    // Auto-attack range ring: thin torus at feet
    let rangeRing: any = null
    if (entity.autoAttackRange > 0) {
      rangeRing = MeshBuilder.CreateTorus(`range-${entity.id}`, {
        diameter: entity.autoAttackRange * 2,
        thickness: 0.12,
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

    // Aggro detection fan (boss/mob only): pink 120° fan, visible only when idle
    let aggroFan: any = null
    if ((entity.type === 'boss' || entity.type === 'mob') && entity.aggroRange > 0) {
      const aggroAngle = 120
      aggroFan = MeshBuilder.CreateDisc(`aggro-${entity.id}`, {
        radius: entity.aggroRange,
        tessellation: 48,
        arc: aggroAngle / 360,
      }, this.scene)
      aggroFan.rotation.x = Math.PI / 2 // lay flat
      // Center arc on forward (+Z): rotation = (0 - 90 + aggroAngle/2) * PI/180
      aggroFan.rotation.y = ((0 - 90 + aggroAngle / 2) * Math.PI) / 180
      aggroFan.position.y = 0.01
      aggroFan.parent = root

      const aggroMat = new StandardMaterial(`aggro-mat-${entity.id}`, this.scene)
      aggroMat.diffuseColor = new Color3(1.0, 0.4, 0.6)   // pink
      aggroMat.emissiveColor = new Color3(0.4, 0.1, 0.2)
      aggroMat.alpha = 0.12
      aggroFan.material = aggroMat
    }

    this.meshes.set(entity.id, { root, body, hitPoint, facingArrow, rangeRing, aggroFan, baseEmissive: bodyMat.emissiveColor.clone() })
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

      // Hide aggro fan once in combat
      if (group.aggroFan) {
        group.aggroFan.isVisible = !entity.inCombat
      }
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
    mat.emissiveColor = Color3.White().scale(0.6)

    // Always restore to the base color stored at creation, not "current"
    setTimeout(() => {
      mat.emissiveColor = group.baseEmissive.clone()
    }, 100)
  }

  private getColor(type: string): Color3 {
    switch (type) {
      case 'player': return new Color3(0.4, 0.85, 0.4)    // green
      case 'boss': return new Color3(0.85, 0.25, 0.2)     // red
      case 'mob': return new Color3(0.85, 0.25, 0.2)      // red (same as boss)
      default: return new Color3(0.5, 0.5, 0.5)           // gray
    }
  }
}
