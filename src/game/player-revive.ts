// src/game/player-revive.ts
// Revival, one path for everyone: a `raise` lands → hard stun under the light → stand up with
// Weakness → Brink. Practice revives are a hidden puppet ally raising the player; Unraisable
// (revive_denied) is what ends the ladder. Spec: docs/superpowers/specs/2026-10-10-unified-revive-design.md
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { EntityManager } from '@/entity/entity-manager'
import type { BuffDef, SkillDef, Vec2 } from '@/core/types'
import type { BuffSystem } from '@/combat/buff'
import type { SkillResolver } from '@/skill/skill-resolver'
import { canBeRaised, REVIVE_DENIED } from '@/combat/party'
import { NEUTRAL_TEAM } from '@/entity/entity'
import { icon } from '@/jobs/commons/icon-paths'

/** Hard stun from death to standing up; the renderer's resurrection sequence is timed to it */
export const REVIVE_DELAY_MS = 2600

export const REVIVE_BUFFS = {
  revive_transcendent: {
    id: 'revive_transcendent', name: '生还', icon: icon('effects', 15273), type: 'buff',
    description: '刚刚复活，伤害无效（不防击退）。使用任意技能或自动攻击即解除。',
    duration: 3000, stackable: false, maxStacks: 1,
    effects: [{ type: 'damage_immunity' }],
  },
  revive_weakness: {
    id: 'revive_weakness', name: '衰弱', icon: icon('effects', 15010), type: 'debuff',
    description: '主属性降低 25%：技能伤害与治疗量降低 25%。陷入无法战斗状态时不会消失，倒计时暂停；此状态下陷入无法战斗，复活后进入濒死。',
    duration: 60000, stackable: false, maxStacks: 1, preserveOnDeath: true,
    effects: [{ type: 'attack_modifier', value: -0.25 }],
  },
  revive_brink: {
    id: 'revive_brink', name: '濒死', icon: icon('effects', 15011), type: 'debuff',
    description: '主属性降低 50%，最大体力降低 25%。陷入无法战斗状态时不会消失，倒计时暂停；被复活仍为濒死。',
    duration: 60000, stackable: false, maxStacks: 1, preserveOnDeath: true,
    effects: [{ type: 'attack_modifier', value: -0.5 }, { type: 'max_hp_modifier', value: -0.25 }],
  },
  revive_denied: {
    id: REVIVE_DENIED, name: '无法复活', icon: icon('effects', 215959), type: 'debuff',
    description: '无法被复活。陷入无法战斗状态时不会消失。',
    duration: Infinity, stackable: false, maxStacks: 1, preserveOnDeath: true,
    effects: [],
  },
} satisfies Record<string, BuffDef>

export type ReviveTier = 'revive_weakness' | 'revive_brink'

/** Tier a party raise stands up with: Brink once either tier is already on (it survives death) */
export function raiseTier(entity: Entity): ReviveTier {
  return entity.buffs.some(b => b.defId === 'revive_weakness' || b.defId === 'revive_brink') ? 'revive_brink' : 'revive_weakness'
}

/** The new tier replaces the old one, with a fresh timer */
function applyReviveTier(buffSystem: BuffSystem, entity: Entity, tier: ReviveTier): void {
  buffSystem.removeBuff(entity, 'revive_weakness', 'replaced')
  buffSystem.removeBuff(entity, 'revive_brink', 'replaced')
  buffSystem.applyBuff(entity, REVIVE_BUFFS[tier], entity.id)
}

export interface RaiseDeps {
  bus: EventBus
  buffSystem: BuffSystem
  /** Run `fn` after `ms` of live battle time */
  schedule: (ms: number, fn: () => void) => void
}

/**
 * A raise has landed (`party:raising`, body already moved to the caster): the body lies under the
 * light for the revive hard stun, then stands with Weakness (Brink if already weakened), 25% MP
 * and transcendence. Brink raises to Brink; only Unraisable stops raises.
 */
export function createRaiseSequence({ bus, buffSystem, schedule }: RaiseDeps): void {
  // Transcendence breaks on any action, auto-attacks included
  const breakTranscendence = ({ caster }: { caster: Entity }) => buffSystem.removeBuff(caster, 'revive_transcendent', 'consumed')
  bus.on('skill:cast_start', breakTranscendence)
  bus.on('skill:cast_complete', breakTranscendence)
  bus.on('party:raising', ({ entity, by, hpPercent }: { entity: Entity; by: Entity | null; hpPercent: number }) => {
    const tier = raiseTier(entity)
    bus.emit('player:reviving', { entity, tier, delay: REVIVE_DELAY_MS })
    schedule(REVIVE_DELAY_MS, () => {
      delete entity.customData.raising
      entity.alive = true
      // Brink lowers max HP: apply the tier first
      applyReviveTier(buffSystem, entity, tier)
      entity.hp = Math.max(1, Math.floor(entity.maxHp * hpPercent))
      entity.mp = Math.min(entity.maxMp, entity.mp + Math.floor(entity.maxMp * 0.25))
      buffSystem.applyBuff(entity, REVIVE_BUFFS.revive_transcendent, entity.id)
      // Drop the target: auto-attacks would otherwise break transcendence on the first swing.
      // Pressing any skill re-acquires a target and ends it, as intended.
      if (!entity.npc && entity.target) {
        entity.target = null
        bus.emit('target:released', { entity })
      }
      bus.emit('player:revived', { entity, tier })
      bus.emit('party:raised', { entity, by })
    })
  })
}

/** Instant, unlimited-range raise the puppet raiser casts (full HP: practice revives) */
export const PUPPET_RAISE: SkillDef = {
  id: 'puppet_raise', name: '复活', type: 'ability', castTime: 0, cooldown: 0, gcd: false,
  targetType: 'single', requiresTarget: false, allyTarget: 'fallen', range: Infinity, mpCost: 0,
  effects: [{ type: 'raise', hpPercent: 1 }],
}

/** How long after the player's death the puppet keeps trying to raise them */
export const PUPPET_WINDOW_MS = 1000
const PUPPET_RETRY_MS = 100

export interface PuppetReviverDeps {
  bus: EventBus
  entityMgr: EntityManager
  skillResolver: SkillResolver
  buffSystem: BuffSystem
  player: Entity
  /** Where it stands: the raised player gets up there */
  at: Vec2
  /** `brink`: Unraisable once the player reaches Brink (practice ladder); `once`: after its one raise */
  denyAfter: 'brink' | 'once'
  schedule: (ms: number, fn: () => void) => void
}

export interface PuppetReviver {
  /** The player just died: try to raise them for a short window; `onFail` runs if it never lands */
  onPlayerDeath(onFail: () => void): void
}

/**
 * Practice revives (and a healer player's one self-revive in a party) are a hidden ally at the
 * start point casting a raise on the player — the same raise any healer casts. When to stop is
 * Unraisable's job, not this module's.
 */
export function createPuppetReviver(deps: PuppetReviverDeps): PuppetReviver {
  const { bus, entityMgr, skillResolver, buffSystem, player, denyAfter, schedule } = deps
  // Neutral: no one's ally or enemy, never counted in the party
  const puppet = entityMgr.create({
    id: 'puppet_raiser', type: 'mob', team: NEUTRAL_TEAM, hp: 1, visible: false, targetable: false,
    position: { x: deps.at.x, y: deps.at.y, z: 0 },
  })
  bus.on('party:raised', ({ entity, by }: { entity: Entity; by: Entity | null }) => {
    if (entity.id !== player.id || by?.id !== puppet.id) return
    if (denyAfter === 'once' || buffSystem.hasBuff(player, 'revive_brink')) buffSystem.applyBuff(player, REVIVE_BUFFS.revive_denied, puppet.id)
  })
  const tryRaise = (): boolean => {
    if (player.alive || player.customData.raising || !canBeRaised(player)) return false
    puppet.allyTarget = player.id
    return skillResolver.tryUse(puppet, PUPPET_RAISE) && !!player.customData.raising
  }
  return {
    onPlayerDeath(onFail) {
      if (tryRaise()) return
      let waited = 0
      const retry = () => {
        if (player.customData.raising || player.alive) return
        if (tryRaise()) return
        waited += PUPPET_RETRY_MS
        if (waited >= PUPPET_WINDOW_MS) onFail()
        else schedule(PUPPET_RETRY_MS, retry)
      }
      schedule(PUPPET_RETRY_MS, retry)
    },
  }
}
