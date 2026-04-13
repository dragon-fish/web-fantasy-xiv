import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import type { InputManager } from '@/input/input-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { EntityManager } from '@/entity/entity-manager'
import type { EventBus } from '@/core/event-bus'
import type { Arena } from '@/arena/arena'
import { computeMoveDirection, computeFacingAngle } from '@/input/input-manager'

export interface PlayerInputConfig {
  /** Skills bound to number keys (index 0 = key 1, etc.) */
  skills: SkillDef[]
  /** Extra skill bindings (e.g. 100=Q, 101=E) */
  extraSkills?: Map<number, SkillDef>
  /** Auto-attack skill (no GCD, fires on interval when target locked) */
  autoAttackSkill?: SkillDef
  /** Auto-attack interval in ms */
  autoAttackInterval: number
}

/**
 * Binds keyboard/mouse input to a player entity.
 * Handles: movement, facing, targeting, skill use, ESC priority chain.
 * Displacement effects are handled by CombatResolver, not here.
 */
export class PlayerInputDriver {
  constructor(
    private entity: Entity,
    private input: InputManager,
    private skillResolver: SkillResolver,
    private buffSystem: BuffSystem,
    private entityMgr: EntityManager,
    private bus: EventBus,
    private arena: Arena,
    private config: PlayerInputConfig,
  ) {}

  /** Returns 'pause' if ESC should trigger pause (no higher-priority action consumed it) */
  update(dt: number): 'pause' | null {
    const p = this.entity

    // ESC priority: interrupt cast → release target → pause
    if (this.input.consumeEsc()) {
      if (p.casting) {
        this.skillResolver.interruptCast(p)
      } else if (p.target) {
        p.target = null
        this.bus.emit('target:released', { entity: p })
      } else {
        return 'pause'
      }
    }

    // Movement (blocked while stunned, interrupts casting)
    if (!this.buffSystem.isStunned(p)) {
      const dir = computeMoveDirection(this.input.keys)
      if (dir.x !== 0 || dir.y !== 0) {
        if (p.casting) {
          this.skillResolver.interruptCast(p)
        }

        const speedMod = this.buffSystem.getSpeedModifier(p)
        const modifiedSpeed = p.speed * (1 + speedMod)
        const distance = modifiedSpeed * (dt / 1000)
        p.position.x += dir.x * distance
        p.position.y += dir.y * distance

        const clamped = this.arena.clampPosition({ x: p.position.x, y: p.position.y })
        p.position.x = clamped.x
        p.position.y = clamped.y
      }
    }

    // Facing follows mouse
    p.facing = computeFacingAngle(
      { x: p.position.x, y: p.position.y },
      this.input.mouse.worldPos,
    )

    // Right click: lock nearest enemy
    if (this.input.mouse.rightDown) {
      const nearest = this.entityMgr.findNearest(
        p.id,
        (e) => e.type !== 'player' && e.type !== 'object' && e.alive,
      )
      if (nearest && p.target !== nearest.id) {
        p.target = nearest.id
        this.bus.emit('target:locked', { entity: p, target: nearest })
      }
    }

    // Skill keys
    const skillIdx = this.input.consumeSkillPress()
    if (skillIdx !== null) {
      const skill = skillIdx < this.config.skills.length
        ? this.config.skills[skillIdx]
        : this.config.extraSkills?.get(skillIdx) ?? null

      if (skill) {
        if (skill.requiresTarget && !p.target) {
          this.autoLockNearest()
        }
        this.skillResolver.tryUse(p, skill)
      }
    }

    // Auto-attack when target locked
    if (p.target && p.inCombat && this.config.autoAttackSkill) {
      p.autoAttackTimer += dt
      if (p.autoAttackTimer >= this.config.autoAttackInterval) {
        p.autoAttackTimer -= this.config.autoAttackInterval
        this.skillResolver.tryUse(p, this.config.autoAttackSkill)
      }
    }

    // Tick GCD / casting / cooldowns / buffs
    this.skillResolver.update(p, dt)
    this.skillResolver.updateCooldowns(p, dt)
    this.buffSystem.update(p, dt)

    return null
  }

  private autoLockNearest(): void {
    const nearest = this.entityMgr.findNearest(
      this.entity.id,
      (e) => e.type !== 'player' && e.type !== 'object' && e.alive,
    )
    if (nearest) {
      this.entity.target = nearest.id
      this.bus.emit('target:locked', { entity: this.entity, target: nearest })
    }
  }
}
