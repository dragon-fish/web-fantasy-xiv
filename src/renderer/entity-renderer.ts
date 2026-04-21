// src/renderer/entity-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3,
  TransformNode, Vector3,
  type Scene,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'

/** Shortest signed angular distance from `from` to `to` in degrees. Positive = clockwise. */
function angleDelta(from: number, to: number): number {
  let d = ((to - from) % 360 + 360) % 360
  if (d > 180) d -= 360
  return d
}

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
  private static readonly ROTATION_SPEED = 720 // degrees per second
  private meshes = new Map<string, EntityMeshGroup>()
  private displayFacing = new Map<string, number>()

  constructor(private scene: Scene, private bus: EventBus) {
    bus.on('entity:created', (payload: { entity: Entity }) => {
      this.createMesh(payload.entity)
    })

    bus.on('entity:died', (payload: { entity: Entity }) => {
      // Player death: keep the mesh but desaturate to gray as a temporary
      // "corpse" until a proper corpse mesh is designed. Other entities
      // (mobs / bosses) remove their mesh normally.
      if (payload.entity.type === 'player') {
        this.grayOut(payload.entity.id)
      } else {
        this.removeMesh(payload.entity.id)
      }
    })
  }

  /**
   * Desaturate an entity's body to gray + dim the facing arrow. Used for
   * player death so the capsule remains visible during the death window.
   * No-op if the mesh group has already been disposed.
   */
  private grayOut(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return
    const GRAY = new Color3(0.4, 0.4, 0.4)
    const bodyMat = group.body.material as StandardMaterial | null
    if (bodyMat) {
      bodyMat.diffuseColor = GRAY
      bodyMat.emissiveColor = Color3.Black()
      bodyMat.alpha = 0.6
    }
    const arrowMat = group.facingArrow.material as StandardMaterial | null
    if (arrowMat) {
      arrowMat.diffuseColor = GRAY.scale(1.1)
    }
    if (group.rangeRing) group.rangeRing.isVisible = false
    if (group.aggroFan) group.aggroFan.isVisible = false
    group.baseEmissive = Color3.Black()
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

    // Target ring at feet: auto-attack range ring, or small indicator for targetable entities
    let rangeRing: any = null
    const ringRadius = entity.autoAttackRange > 0
      ? entity.autoAttackRange
      : (entity.type !== 'player' ? entity.size + 0.3 : 0)
    if (ringRadius > 0) {
      rangeRing = MeshBuilder.CreateTorus(`range-${entity.id}`, {
        diameter: ringRadius * 2,
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
    this.displayFacing.set(entity.id, entity.facing)
  }

  /** Call each render frame to sync positions */
  updateAll(entities: Entity[], dt: number, lockedTargetId?: string | null): void {
    for (const entity of entities) {
      const group = this.meshes.get(entity.id)
      if (!group) continue

      // Hide entire mesh group when entity is not visible
      group.root.setEnabled(entity.visible)
      if (!entity.visible) continue

      // Fall effect: if entity is out of bounds, Y drops over time
      const fallY = (entity as any)._fallOffset ?? 0
      group.root.position.set(entity.position.x, -fallY, entity.position.y)
      // Smooth rotation toward logical facing
      const current = this.displayFacing.get(entity.id) ?? entity.facing
      const delta = angleDelta(current, entity.facing)
      const maxStep = EntityRenderer.ROTATION_SPEED * (dt / 1000)
      const step = Math.sign(delta) * Math.min(Math.abs(delta), maxStep)
      const newDisplay = ((current + step) % 360 + 360) % 360
      this.displayFacing.set(entity.id, newDisplay)
      group.root.rotation.y = (newDisplay * Math.PI) / 180

      // Hide aggro fan once in combat
      if (group.aggroFan) {
        group.aggroFan.isVisible = !entity.inCombat
      }

      // Highlight locked target's range ring (thicker + brighter)
      if (group.rangeRing) {
        const isLocked = entity.id === lockedTargetId
        const mat = group.rangeRing.material as StandardMaterial
        if (isLocked) {
          group.rangeRing.scaling.set(1, 3, 1) // Y scale = visually thicker torus
          mat.alpha = 0.7
          mat.emissiveColor.set(0.8, 0.2, 0.1)
        } else {
          group.rangeRing.scaling.set(1, 1, 1)
          mat.alpha = 0.3
          mat.emissiveColor = this.getColor(entity.type).scale(0.15)
        }
      }
    }
  }

  private removeMesh(entityId: string): void {
    const group = this.meshes.get(entityId)
    if (!group) return
    group.root.dispose()
    this.meshes.delete(entityId)
    this.displayFacing.delete(entityId)
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
