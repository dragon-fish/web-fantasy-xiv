// src/game/party/damage-director.ts
// NPC output is scripted, not simulated (FFXIV duty support): one team DPS budget, steered so that
// boss HP runs out around the target time, split among the NPCs by role weight.
import type { Role } from '@/core/types'

/**
 * DPS of an ordinary player on a DPS job: the job-balance DPM baseline (docs/job-balance.md) / 60.
 * Tanks and healers deal ROLE_WEIGHT × this.
 */
export const NORMAL_PLAYER_DPS = 900
/** Output share of an ordinary party: DPS : tank : healer */
export const ROLE_WEIGHT: Record<Role, number> = { dps: 1, tank: 0.7, healer: 0.5 }
/** A 1+1+0.7+0.5 party clears ~30% slower with NPCs; this is its total output in ordinary-player units */
export const NPC_PARTY_OUTPUT = (1 + 1 + ROLE_WEIGHT.tank + ROLE_WEIGHT.healer) / 1.3
/** Team budget bounds as multiples of the baseline */
export const BUDGET_FLOOR = 0.5
export const BUDGET_CEILING = 1.25
/** Budget recomputed this often (ms); the player's DPS is read over the last WINDOW ms */
export const RECOMPUTE_MS = 3000
export const PLAYER_DPS_WINDOW_MS = 30000
/** Largest budget change per recompute, as a fraction of the baseline */
const MAX_STEP = 0.15
/** Floor on the remaining time used for the required DPS, so it climbs steeply but stays finite once overtime */
const MIN_REMAINING_MS = 5000

export function npcBaseline(playerRole: Role, normalDps = NORMAL_PLAYER_DPS): number {
  return (NPC_PARTY_OUTPUT - ROLE_WEIGHT[playerRole]) * normalDps
}

export function defaultTargetTime(bossMaxHp: number, normalDps = NORMAL_PLAYER_DPS): number {
  return (bossMaxHp / (NPC_PARTY_OUTPUT * normalDps)) * 1000
}

export interface DirectorSnapshot {
  baseline: number
  required: number
  playerDps: number
  budget: number
}

export class DamageDirector {
  readonly baseline: number
  private budget: number
  private sinceRecompute = 0
  private playerHits: { at: number; amount: number }[] = []
  private last: DirectorSnapshot

  constructor(playerRole: Role, private targetTimeMs: number, normalDps = NORMAL_PLAYER_DPS) {
    this.baseline = npcBaseline(playerRole, normalDps)
    this.budget = this.baseline
    this.last = { baseline: this.baseline, required: this.baseline, playerDps: 0, budget: this.budget }
  }

  recordPlayerDamage(at: number, amount: number): void {
    this.playerHits.push({ at, amount })
  }

  /** Advance combat time; recomputes the team budget every RECOMPUTE_MS */
  update(dt: number, combatElapsed: number, bossHp: number): void {
    this.sinceRecompute += dt
    if (this.sinceRecompute < RECOMPUTE_MS) return
    this.sinceRecompute = 0
    this.recompute(combatElapsed, bossHp)
  }

  recompute(combatElapsed: number, bossHp: number): void {
    const windowStart = combatElapsed - PLAYER_DPS_WINDOW_MS
    this.playerHits = this.playerHits.filter(h => h.at >= windowStart)
    const span = Math.min(PLAYER_DPS_WINDOW_MS, Math.max(combatElapsed, RECOMPUTE_MS))
    const playerDps = this.playerHits.reduce((sum, h) => sum + h.amount, 0) / (span / 1000)
    const remaining = Math.max(MIN_REMAINING_MS, this.targetTimeMs - combatElapsed)
    const required = bossHp / (remaining / 1000)
    const goal = Math.min(BUDGET_CEILING * this.baseline, Math.max(BUDGET_FLOOR * this.baseline, required - playerDps))
    const step = MAX_STEP * this.baseline
    this.budget += Math.max(-step, Math.min(step, goal - this.budget))
    this.last = { baseline: this.baseline, required, playerDps, budget: this.budget }
  }

  /** Current team DPS budget */
  teamDps(): number {
    return this.budget
  }

  /** One NPC's share of the budget, given the roles of all NPCs */
  shareOf(role: Role, npcRoles: Role[]): number {
    const total = npcRoles.reduce((sum, r) => sum + ROLE_WEIGHT[r], 0)
    return total > 0 ? this.budget * ROLE_WEIGHT[role] / total : 0
  }

  snapshot(): DirectorSnapshot {
    return this.last
  }
}
