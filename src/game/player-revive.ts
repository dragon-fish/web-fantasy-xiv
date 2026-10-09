// src/game/player-revive.ts
// Practice-friendly revival (encounter `revive: true`): FFXIV-style Weakness → Brink of Death
// ladder. Dying at Brink ends the attempt through the normal death window.
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
    description: '主属性降低 25%：技能伤害与治疗量降低 25%。此状态下死亡会进入濒死。',
    duration: 60000, stackable: false, maxStacks: 1,
    effects: [{ type: 'attack_modifier', value: -0.25 }],
  },
  revive_brink: {
    id: 'revive_brink', name: '濒死', icon: icon('effects', 15011), type: 'debuff',
    description: '主属性降低 50%，最大体力降低 25%。此状态下死亡将结束挑战。',
    duration: 60000, stackable: false, maxStacks: 1,
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
        buffSystem.applyBuff(player, REVIVE_BUFFS[tier], player.id)
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
