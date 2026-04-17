import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import type { InputManager } from '@/input/input-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { EntityManager } from '@/entity/entity-manager'
import type { EventBus } from '@/core/event-bus'
import type { Arena } from '@/arena/arena'
import type { BuffDef } from '@/core/types'
import type { DisplacementAnimator } from './displacement-animator'
import { computeMoveDirection, computeFacingAngle } from '@/input/input-manager'

const SKILL_QUEUE_WINDOW = 500
const SLIDECAST_WINDOW = 300
const REGEN_INTERVAL = 3000
const REGEN_RATE_IDLE = 0.20  // 20% max HP per tick out of combat
const REGEN_RATE_COMBAT = 0.02 // 2% max HP per tick in combat
const MP_REGEN_INTERVAL = 3000
const MP_REGEN_AMOUNT = 500
const MP_REGEN_INTERVAL_IDLE = 3000
const MP_REGEN_AMOUNT_IDLE = 5000

export interface PlayerInputConfig {
  skills: SkillDef[]
  extraSkills?: Map<number, SkillDef>
  autoAttackSkill?: SkillDef
  autoAttackInterval: number
  noMpRegen?: boolean
  passiveBuffs?: { buffId: string; interval: number; stacks: number; requiresBuff?: string }[]
  /** Buff defs needed for passive buff application */
  buffDefs?: Map<string, BuffDef>
}

export class PlayerInputDriver {
  private queuedSkill: SkillDef | null = null
  private regenTimer = 0
  private mpRegenTimer = 0
  private passiveBuffTimers = new Map<string, number>()
  private displacer: DisplacementAnimator | null = null
  private leyLinesCheckTimer = 0
  constructor(
    private entity: Entity,
    private input: InputManager,
    private skillResolver: SkillResolver,
    private buffSystem: BuffSystem,
    private entityMgr: EntityManager,
    private bus: EventBus,
    private arena: Arena,
    private config: PlayerInputConfig,
  ) {
    // Track Ley Lines placement on entity custom data
    this.bus.on('buff:applied', (payload: { target: any; buff: any }) => {
      if (payload.target.id === this.entity.id && payload.buff?.id === 'blm_leylines_active') {
        this.entity.customData.leyLinesCenter = { x: this.entity.position.x, y: this.entity.position.y }
      }
    })
    this.bus.on('buff:removed', (payload: { target: any; buff: any }) => {
      if (payload.target?.id === this.entity.id && payload.buff?.id === 'blm_leylines_active') {
        delete this.entity.customData.leyLinesCenter
      }
    })
  }

  setDisplacer(displacer: DisplacementAnimator): void {
    this.displacer = displacer
  }

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

    // During displacement animation: block all input, only tick regen/buffs/cooldowns
    if (this.displacer?.isAnimating(p.id)) {
      this.input.consumeSkillPress() // discard pending skill press
      this.skillResolver.updateAll(dt)
      this.tickRegen(p, dt)
      return null
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
        const wallClamped = this.arena.clampToWallZones(clamped)
        p.position.x = wallClamped.x
        p.position.y = wallClamped.y

        this.bus.emit('player:walk', { entity: p, position: { x: p.position.x, y: p.position.y } })
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
        (e) => e.type !== 'player' && e.type !== 'object' && e.alive && e.targetable,
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

    // Auto-attack when target locked (haste reduces interval)
    if (p.target && p.inCombat && this.config.autoAttackSkill) {
      const haste = this.buffSystem.getHaste(p)
      const aaInterval = haste > 0
        ? this.config.autoAttackInterval * (1 - haste)
        : this.config.autoAttackInterval
      p.autoAttackTimer += dt
      if (p.autoAttackTimer >= aaInterval) {
        p.autoAttackTimer -= aaInterval
        this.skillResolver.tryUse(p, this.config.autoAttackSkill)
      }
    }

    // Tick ALL entities' GCD / casting / cooldowns
    // NOTE: buff duration tick is centralized in GameScene (covers all alive entities)
    this.skillResolver.updateAll(dt)

    this.tickLeyLines(p, dt)
    this.tickRegen(p, dt)

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

  /** Ley Lines: every 1s check if player stands inside the zone, grant 3s haste buff */
  private tickLeyLines(p: Entity, dt: number): void {
    const center = p.customData.leyLinesCenter as { x: number; y: number } | undefined
    if (!center || !p.alive) return
    this.leyLinesCheckTimer += dt
    if (this.leyLinesCheckTimer < 1000) return
    this.leyLinesCheckTimer -= 1000

    const dx = p.position.x - center.x
    const dy = p.position.y - center.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= 3) {
      const def = this.config.buffDefs?.get('blm_leylines_buff')
      if (def) {
        this.buffSystem.applyBuff(p, def, p.id)
      }
    }
  }

  private tickRegen(p: Entity, dt: number): void {
    if (p.alive && p.hp < p.maxHp) {
      this.regenTimer += dt
      if (this.regenTimer >= REGEN_INTERVAL) {
        this.regenTimer -= REGEN_INTERVAL
        const rate = p.inCombat ? REGEN_RATE_COMBAT : REGEN_RATE_IDLE
        const heal = Math.floor(p.maxHp * rate)
        p.hp = Math.min(p.maxHp, p.hp + heal)
      }
    }
    if (!this.config.noMpRegen && p.alive && p.maxMp > 0 && p.mp < p.maxMp) {
      this.mpRegenTimer += dt
      const interval = p.inCombat ? MP_REGEN_INTERVAL : MP_REGEN_INTERVAL_IDLE
      const amount = p.inCombat ? MP_REGEN_AMOUNT : MP_REGEN_AMOUNT_IDLE
      if (this.mpRegenTimer >= interval) {
        this.mpRegenTimer -= interval
        p.mp = Math.min(p.maxMp, p.mp + amount)
      }
    }

    // Passive buff accumulation (in combat only)
    if (p.alive && p.inCombat && this.config.passiveBuffs) {
      for (const pb of this.config.passiveBuffs) {
        // Skip if required buff is not present
        if (pb.requiresBuff && this.buffSystem.getStacks(p, pb.requiresBuff) <= 0) {
          this.passiveBuffTimers.set(pb.buffId, 0)
          continue
        }
        const timer = (this.passiveBuffTimers.get(pb.buffId) ?? 0) + dt
        if (timer >= pb.interval) {
          this.passiveBuffTimers.set(pb.buffId, timer - pb.interval)
          const def = this.config.buffDefs?.get(pb.buffId)
          if (def) {
            this.buffSystem.applyBuff(p, def, p.id, pb.stacks)
          }
        } else {
          this.passiveBuffTimers.set(pb.buffId, timer)
        }
      }
    }
  }

  private autoLockNearest(): void {
    const nearest = this.entityMgr.findNearest(
      this.entity.id,
      (e) => e.type !== 'player' && e.type !== 'object' && e.alive && e.targetable,
    )
    if (nearest) {
      this.entity.target = nearest.id
      this.bus.emit('target:locked', { entity: this.entity, target: nearest })
    }
  }
}
