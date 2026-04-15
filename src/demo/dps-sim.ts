/**
 * DPS Simulation Framework
 *
 * Tick-based simulation: steps through time at 100ms resolution,
 * handles GCD rotation, oGCD weaving, passive buffs, haste, and conditional skills.
 * Uses real CombatResolver and BuffSystem with actual job definitions.
 */
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { CombatResolver } from '@/game/combat-resolver'
import type { SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { PlayerJob } from './player-job'

// ─── Types ──────────────────────────────────────────

export interface OgcdEntry {
  skill: SkillDef
  /** First available time in ms. Default: 0 */
  startAt?: number
  /** Only weave after this GCD index in the cycle (0-based). If omitted, can fire at any GCD. */
  afterGcd?: number
  /** Use when this buff has >= N stacks (for conditional oGCDs like Pitch Perfect) */
  whenStacks?: { buffId: string; stacks: number }
  /**
   * Also use when a buff is about to expire and stacks >= 1.
   * Handles "dump remaining stacks before buff ends" pattern.
   * Value is the remaining ms threshold (e.g. 1500 = use when buff has < 1.5s left).
   */
  whenBuffExpiring?: { buffId: string; thresholdMs: number }
}

export interface Rotation {
  /** Repeating GCD skill cycle (loops forever) */
  gcdCycle: SkillDef[]
  /** oGCD skills — used on cooldown / when conditions are met */
  ogcds?: OgcdEntry[]
}

export interface SimResult {
  totalDamage: number
  dps: number
}

// ─── Simulation ─────────────────────────────────────

/** Default simulation duration */
export const SIM_DURATION = 120_000

/**
 * Tick-based DPS simulation.
 * Steps at 100ms resolution, handles GCD/oGCD/AA/passive buffs/haste.
 */
export function simulate(job: PlayerJob, rotation: Rotation, duration = SIM_DURATION): SimResult {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'circle', radius: 50 }, boundary: 'wall' })
  const resolver = new CombatResolver(bus, entityMgr, buffSystem, arena)

  const boss = entityMgr.create({ id: 'boss', type: 'boss', attack: 1, hp: 9999999, maxHp: 9999999 })
  const player = entityMgr.create({
    id: 'player', type: 'player',
    attack: job.stats.attack,
    hp: job.stats.hp, maxHp: job.stats.hp,
    mp: job.stats.mp, maxMp: job.stats.mp,
  })
  player.gcdDuration = job.stats.gcdDuration ?? 2500
  player.target = 'boss'
  boss.target = 'player'

  resolver.registerBuffs(job.buffs)

  let totalDamage = 0
  bus.on('damage:dealt', (payload: { amount: number; target: Entity }) => {
    if (payload.target.id === 'boss' && payload.amount > 0) {
      totalDamage += payload.amount
    }
  })

  // ─── State ────────────────────────────────
  const baseGcd = job.stats.gcdDuration ?? 2500
  const baseAaInterval = job.autoAttackInterval
  const ogcds = rotation.ogcds ?? []
  const cycleLen = rotation.gcdCycle.length
  const passiveBuffs = job.passiveBuffs ?? []

  let gcdTimer = 0
  let aaTimer = 0
  let cycleIndex = 0
  const ogcdCooldowns = new Map<string, number>()
  const passiveTimers = new Map<string, number>()

  for (const entry of ogcds) {
    ogcdCooldowns.set(entry.skill.id, entry.startAt ?? 0)
  }
  for (const pb of passiveBuffs) {
    passiveTimers.set(pb.buffId, pb.interval)
  }

  // ─── Helpers ──────────────────────────────

  function castSkill(skill: SkillDef) {
    // Pre-process buff consumption that SkillResolver normally handles
    if (skill.castTimeWithBuff?.consumeStack
      && buffSystem.hasBuff(player, skill.castTimeWithBuff.buffId)) {
      buffSystem.removeStacks(player, skill.castTimeWithBuff.buffId, 1)
    }
    if (skill.mpCostAbsorbBuff
      && buffSystem.hasBuff(player, skill.mpCostAbsorbBuff)) {
      buffSystem.removeStacks(player, skill.mpCostAbsorbBuff, 1)
    }

    bus.emit('skill:cast_complete', { caster: player, skill })
    if (skill.zones) {
      for (const zoneDef of skill.zones) {
        bus.emit('aoe:zone_resolved', {
          zone: { casterId: player.id, skillId: skill.id, def: zoneDef },
          hitEntities: [boss],
        })
      }
    }
  }

  function getHaste(): number {
    return buffSystem.getHaste(player)
  }

  function getEffectiveGcd(): number {
    const h = getHaste()
    return h > 0 ? Math.round(baseGcd * (1 - h)) : baseGcd
  }

  function getEffectiveAaInterval(): number {
    const h = getHaste()
    return h > 0 ? Math.round(baseAaInterval * (1 - h)) : baseAaInterval
  }

  // ─── Tick loop ────────────────────────────

  const TICK = 100

  for (let t = 0; t < duration; t += TICK) {
    buffSystem.update(player, TICK)

    // Passive buffs
    for (const pb of passiveBuffs) {
      if (pb.requiresBuff && !buffSystem.hasBuff(player, pb.requiresBuff)) {
        passiveTimers.set(pb.buffId, pb.interval)
        continue
      }
      let remaining = passiveTimers.get(pb.buffId)! - TICK
      if (remaining <= 0) {
        const def = job.buffMap.get(pb.buffId)
        if (def) {
          buffSystem.applyBuff(player, def, player.id, pb.stacks)
        }
        remaining = pb.interval
      }
      passiveTimers.set(pb.buffId, remaining)
    }

    // Auto-attack
    aaTimer -= TICK
    if (aaTimer <= 0) {
      castSkill(job.autoAttackSkill)
      aaTimer = getEffectiveAaInterval()
    }

    // GCD
    if (gcdTimer > 0) {
      gcdTimer -= TICK
    }

    if (gcdTimer <= 0) {
      const posInCycle = cycleIndex % cycleLen

      // Weave oGCDs
      for (const entry of ogcds) {
        if (entry.afterGcd != null && posInCycle !== entry.afterGcd) continue

        const cd = ogcdCooldowns.get(entry.skill.id)!
        if (cd > 0) continue

        // Check conditional triggers
        let shouldUse = true
        if (entry.whenStacks || entry.whenBuffExpiring) {
          shouldUse = false
          if (entry.whenStacks) {
            const stacks = buffSystem.getStacks(player, entry.whenStacks.buffId)
            if (stacks >= entry.whenStacks.stacks) shouldUse = true
          }
          if (!shouldUse && entry.whenBuffExpiring) {
            const inst = player.buffs.find(b => b.defId === entry.whenBuffExpiring!.buffId)
            if (inst && inst.remaining > 0 && inst.remaining <= entry.whenBuffExpiring.thresholdMs) {
              const skillReq = entry.skill.requiresBuffStacks
              const stacks = skillReq ? buffSystem.getStacks(player, skillReq.buffId) : 1
              if (stacks >= (skillReq?.stacks ?? 1)) shouldUse = true
            }
          }
        }
        if (!shouldUse) continue

        castSkill(entry.skill)
        ogcdCooldowns.set(entry.skill.id, entry.skill.cooldown)
      }

      // Fire GCD
      const gcdSkill = rotation.gcdCycle[posInCycle]
      castSkill(gcdSkill)
      cycleIndex++
      gcdTimer = getEffectiveGcd()
    }

    // Tick oGCD cooldowns
    for (const entry of ogcds) {
      const cd = ogcdCooldowns.get(entry.skill.id)!
      if (cd > 0) {
        ogcdCooldowns.set(entry.skill.id, Math.max(0, cd - TICK))
      }
    }
  }

  const dps = totalDamage / (duration / 1000)
  return { totalDamage, dps }
}

// ─── Helpers ────────────────────────────────────────

/**
 * Practical DPS multiplier: accounts for real-fight downtime.
 * - Melee/Tank: ×0.92 — forced out of melee range, lose AA + GCD
 * - Caster: ×0.85 — movement interrupts casts
 * - Phys Ranged: no penalty (instant casts, no melee requirement)
 */
export function getPracticalFactor(job: PlayerJob): number | null {
  const cat = job.category
  if (cat === 'melee' || cat === 'tank') return 0.92
  if (cat === 'caster') return 0.85
  return null
}

/** Print DPS result with optional practical estimate */
export function printResult(name: string, job: PlayerJob, result: SimResult) {
  const gcd = (job.stats.gcdDuration ?? 2500) / 1000
  const factor = getPracticalFactor(job)
  const practical = factor ? ` | practical(×${factor}): ${(result.dps * factor).toFixed(1)}` : ''
  console.info(`  ${name} (ATK=${job.stats.attack}, GCD=${gcd}s, AA=${job.autoAttackInterval / 1000}s): ${result.dps.toFixed(1)} DPS${practical}`)
}

/** Find a skill by id from a job's skill list */
export function skill(job: PlayerJob, id: string): SkillDef {
  const s = job.skills.find(s => s.id === id)
  if (!s) throw new Error(`Skill ${id} not found in job ${job.name}`)
  return s
}
