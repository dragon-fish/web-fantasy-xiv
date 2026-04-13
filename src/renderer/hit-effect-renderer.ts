// src/renderer/hit-effect-renderer.ts
import {
  MeshBuilder, StandardMaterial, Color3, Vector3,
  type Scene, type Mesh,
} from '@babylonjs/core'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityRenderer } from './entity-renderer'

interface FlyingArrow {
  mesh: Mesh
  from: Vector3
  to: Vector3
  elapsed: number
  duration: number  // ms
  targetId: string
}

const ARROW_FLY_DURATION = 200  // ms

export class HitEffectRenderer {
  private arrows: FlyingArrow[] = []

  constructor(
    private scene: Scene,
    private bus: EventBus,
    private entityRenderer: EntityRenderer,
  ) {
    // Listen for single-target skill hits
    bus.on('skill:cast_complete', (payload: { caster: Entity; skill: any }) => {
      const caster = payload.caster
      const skill = payload.skill
      if (!skill || skill.targetType !== 'single' || !caster.target) return

      // We need target position — look up from scene
      // The demo will pass entity positions via the event or we read from entity
      this.spawnArrow(caster, caster.target)
    })
  }

  private spawnArrow(caster: Entity, targetId: string): void {
    const arrow = MeshBuilder.CreateCylinder('hit-arrow', {
      height: 0.5,
      diameterTop: 0,
      diameterBottom: 0.15,
      tessellation: 6,
    }, this.scene)

    // Point arrow sideways (along Z)
    arrow.rotation.x = Math.PI / 2

    const mat = new StandardMaterial('hit-arrow-mat', this.scene)
    mat.diffuseColor = new Color3(1, 1, 0.7)
    mat.emissiveColor = new Color3(0.6, 0.6, 0.3)
    arrow.material = mat

    const from = new Vector3(caster.position.x, 1, caster.position.y)
    arrow.position.copyFrom(from)

    this.arrows.push({
      mesh: arrow,
      from,
      to: Vector3.Zero(), // will be updated in update()
      elapsed: 0,
      duration: ARROW_FLY_DURATION,
      targetId,
    })
  }

  /** Call each render frame. Pass entity lookup for live target position. */
  update(dt: number, getEntity: (id: string) => Entity | undefined): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i]
      arrow.elapsed += dt

      // Update target position (target may have moved)
      const target = getEntity(arrow.targetId)
      if (target) {
        arrow.to.set(target.position.x, 1, target.position.y)
      }

      const t = Math.min(arrow.elapsed / arrow.duration, 1)
      Vector3.LerpToRef(arrow.from, arrow.to, t, arrow.mesh.position)

      // Orient arrow toward target
      const dir = arrow.to.subtract(arrow.from)
      if (dir.lengthSquared() > 0.001) {
        const angle = Math.atan2(dir.x, dir.z)
        arrow.mesh.rotation.y = angle
      }

      if (t >= 1) {
        // Hit: flash target + remove arrow
        arrow.mesh.dispose()
        this.arrows.splice(i, 1)
        this.entityRenderer.flashHit(arrow.targetId)
      }
    }
  }
}
