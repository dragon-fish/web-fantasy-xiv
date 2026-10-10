// src/game/player-revive.ts
// Revival. Practice-friendly self-revive (encounter `revive: true`): FFXIV-style Weakness → Brink
// of Death ladder; dying at Brink ends the attempt through the normal death window. Raises from a
// party healer play the same resurrection sequence and hard stun.
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { BuffDef } from '@/core/types'
import type { BuffSystem } from '@/combat/buff'
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
    description: '主属性降低 25%：技能伤害与治疗量降低 25%。死亡时不会消失，倒计时暂停；此状态下死亡，复活后进入濒死。',
    duration: 60000, stackable: false, maxStacks: 1, preserveOnDeath: true,
    effects: [{ type: 'attack_modifier', value: -0.25 }],
  },
  revive_brink: {
    id: 'revive_brink', name: '濒死', icon: icon('effects', 15011), type: 'debuff',
    description: '主属性降低 50%，最大体力降低 25%。死亡时不会消失，倒计时暂停；被复活仍为濒死。单人练习中此状态下死亡将结束挑战。',
    duration: 60000, stackable: false, maxStacks: 1, preserveOnDeath: true,
    effects: [{ type: 'attack_modifier', value: -0.5 }, { type: 'max_hp_modifier', value: -0.25 }],
  },
} satisfies Record<string, BuffDef>

export type ReviveTier = 'revive_weakness' | 'revive_brink'

/** Debuff the player gets when revived after this death; null = no revive left. Read before buffs are cleared. */
export function nextReviveTier(player: Entity): ReviveTier | null {
  if (player.buffs.some(b => b.defId === 'revive_brink')) return null
  if (player.buffs.some(b => b.defId === 'revive_weakness')) return 'revive_brink'
  return 'revive_weakness'
}

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
 * light for the revive hard stun, then stands with Weakness (Brink if already weakened) and
 * transcendence. Unlike the practice ladder there is no last death: Brink raises to Brink.
 */
export function createRaiseSequence({ bus, buffSystem, schedule }: RaiseDeps): void {
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
      buffSystem.applyBuff(entity, REVIVE_BUFFS.revive_transcendent, entity.id)
      if (!entity.npc && entity.target) {
        entity.target = null
        bus.emit('target:released', { entity })
      }
      bus.emit('player:revived', { entity, tier })
      bus.emit('party:raised', { entity, by })
    })
  })
}

export interface PlayerReviveDeps {
  bus: EventBus
  player: Entity
  buffSystem: BuffSystem
  /** Run `fn` after `ms` of live battle time */
  schedule: (ms: number, fn: () => void) => void
  /** Move the player back onto safe ground before standing up (fell off / died in a pit) */
  relocate?: () => void
}

export interface PlayerRevive {
  /** Call after the player has been marked dead. Returns false when no revive is left. */
  tryRevive(): boolean
  isPending(): boolean
  /** From now on deaths are final (e.g. enrage) */
  disable(): void
}

export function createPlayerRevive({ bus, player, buffSystem, schedule, relocate }: PlayerReviveDeps): PlayerRevive {
  let pending = false
  let disabled = false

  // Transcendence breaks on any action, auto-attacks included
  const breakTranscendence = ({ caster }: { caster: Entity }) => {
    if (caster.id === player.id) buffSystem.removeBuff(player, 'revive_transcendent', 'consumed')
  }
  bus.on('skill:cast_start', breakTranscendence)
  bus.on('skill:cast_complete', breakTranscendence)

  return {
    isPending: () => pending,
    disable: () => { disabled = true },
    tryRevive() {
      if (disabled) return false
      const tier = nextReviveTier(player)
      if (!tier) return false
      pending = true
      buffSystem.clearDeathBuffs(player)
      bus.emit('player:reviving', { entity: player, tier, delay: REVIVE_DELAY_MS })
      schedule(REVIVE_DELAY_MS, () => {
        pending = false
        relocate?.()
        player.alive = true
        applyReviveTier(buffSystem, player, tier)
        player.hp = player.maxHp
        player.mp = Math.min(player.maxMp, player.mp + Math.floor(player.maxMp * 0.25))
        buffSystem.applyBuff(player, REVIVE_BUFFS.revive_transcendent, player.id)
        // Drop the target: auto-attacks would otherwise break transcendence on the first swing.
        // Pressing any skill re-acquires a target and ends it, as intended.
        if (player.target) {
          player.target = null
          bus.emit('target:released', { entity: player })
        }
        bus.emit('player:revived', { entity: player, tier })
      })
      return true
    },
  }
}
