import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import type { InputManager } from '@/input/input-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { EntityManager } from '@/entity/entity-manager'
import type { EventBus } from '@/core/event-bus'
import type { Arena } from '@/arena/arena'
import { computeMoveDirection, computeFacingAngle } from '@/input/input-manager'

const SKILL_QUEUE_WINDOW = 500
const SLIDECAST_WINDOW = 300
const REGEN_INTERVAL = 3000
const REGEN_RATE_IDLE = 0.20  // 20% max HP per tick out of combat
const REGEN_RATE_COMBAT = 0.02 // 2% max HP per tick in combat

export interface PlayerInputConfig {
  skills: SkillDef[]
  extraSkills?: Map<number, SkillDef>
  autoAttackSkill?: SkillDef
  autoAttackInterval: number
}

export class PlayerInputDriver {
  private queuedSkill: SkillDef | null = null
  private regenTimer = 0

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

  update(dt: number): 'pause' | null {
    const p = this.entity

    // ESC priority: interrupt cast → release target → pause
    if (this.input.consumeEsc()) {
      if (p.casting) {
        this.skillResolver.interruptCast(p)
        this.queuedSkill = null
      } else if (p.target) {
        p.target = null
        this.bus.emit('target:released', { entity: p })
      } else {
        return 'pause'
      }
    }

    // Movement (blocked while stunned)
    if (!this.buffSystem.isStunned(p)) {
      const dir = computeMoveDirection(this.input.keys)
      if (dir.x !== 0 || dir.y !== 0) {
        // Slidecast: movement only interrupts casting if remaining > SLIDECAST_WINDOW
        if (p.casting) {
          const remaining = p.casting.castTime - p.casting.elapsed
          if (remaining > SLIDECAST_WINDOW) {
            this.skillResolver.interruptCast(p)
            this.queuedSkill = null
          }
          // else: slidecast window — allow movement without interrupting
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

    // Skill input → try use or queue
    const skillIdx = this.input.consumeSkillPress()
    if (skillIdx !== null) {
      const skill = skillIdx < this.config.skills.length
        ? this.config.skills[skillIdx]
        : this.config.extraSkills?.get(skillIdx) ?? null

      if (skill) {
        if (skill.requiresTarget && !p.target) this.autoLockNearest()
        this.tryUseOrQueue(skill)
      }
    }

    // Try to flush queued skill
    if (this.queuedSkill) {
      if (this.skillResolver.tryUse(p, this.queuedSkill)) {
        this.queuedSkill = null
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

    // Tick ALL entities' GCD / casting / cooldowns
    this.skillResolver.updateAll(dt)
    this.buffSystem.update(p, dt)

    // Passive HP regen
    if (p.alive && p.hp < p.maxHp) {
      this.regenTimer += dt
      if (this.regenTimer >= REGEN_INTERVAL) {
        this.regenTimer -= REGEN_INTERVAL
        const rate = p.inCombat ? REGEN_RATE_COMBAT : REGEN_RATE_IDLE
        const heal = Math.floor(p.maxHp * rate)
        p.hp = Math.min(p.maxHp, p.hp + heal)
      }
    }

    return null
  }

  private tryUseOrQueue(skill: SkillDef): void {
    const p = this.entity

    // Try immediately
    if (this.skillResolver.tryUse(p, skill)) {
      this.queuedSkill = null
      return
    }

    // Queue if GCD or CD is within the queue window
    const canQueue = this.isWithinQueueWindow(skill)
    if (canQueue) {
      this.queuedSkill = skill
    }
  }

  private isWithinQueueWindow(skill: SkillDef): boolean {
    const p = this.entity

    // Can't queue while stunned
    if (this.buffSystem.isStunned(p)) return false

    // GCD skill: queue if GCD remaining <= window
    if (skill.gcd && p.gcdTimer > 0 && p.gcdTimer <= SKILL_QUEUE_WINDOW) return true

    // Ability with independent CD: queue if CD remaining <= window
    if (!skill.gcd && skill.cooldown > 0) {
      const cd = this.skillResolver.getCooldown(p.id, skill.id)
      if (cd > 0 && cd <= SKILL_QUEUE_WINDOW) return true
    }

    // Currently casting: queue if cast remaining <= window
    if (p.casting) {
      const remaining = p.casting.castTime - p.casting.elapsed
      if (remaining > 0 && remaining <= SKILL_QUEUE_WINDOW) return true
    }

    return false
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
