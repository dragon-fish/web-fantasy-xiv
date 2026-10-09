import type { QtePrompt } from '@/game/game-scene'
import type { ControlStatus } from '@/game/control-status'
import { defineStore } from 'pinia'
import type { HealthBarSnapshot } from '@/renderer/health-bar-motion'
import type { BuffDef } from '@/core/types'
import type { TimelineEntry } from '@/timeline/types'
import type { DamageLogEntry } from '@/game/types'
import type { SkillBarEntry } from '@/jobs/shared'

export interface HpState {
  feedback?: HealthBarSnapshot
  current: number
  max: number
  shield?: number
}

export interface CastInfo {
  name: string
  elapsed: number
  total: number
}

export interface BuffSnapshot {
  defId: string
  name: string
  description?: string
  icon?: string
  iconPerStack?: Record<number, string>
  type: 'buff' | 'debuff'
  stacks: number
  remaining: number
  effects: BuffDef['effects']
}

/** One rendered element of the job gauge */
export type GaugeView =
  | { kind: 'stacks'; buffId: string; label: string; count: number; max: number; shape: 'diamond' | 'chevron'; color: string }
  | { kind: 'timer'; buffId: string; label: string; progress: number; color: string }

/** Status shown over the player's head (CSS px within the canvas box) */
export interface OverheadStatus {
  x: number
  y: number
  /** Crowd control explaining ignored input */
  control: ControlStatus | null
  /** Briefly flashed status, e.g. the Weakness / Brink debuff right after a revive */
  flash: { icon?: string; name: string } | null
  /** FFXIV-style "+Status / −Status" fly text beside the player, oldest first */
  popups: StatusPopup[]
}

export interface StatusPopup {
  key: number
  icon?: string
  name: string
  gained: boolean
  debuff: boolean
  /** Life progress 0..1 */
  t: number
}

export interface DpsSkillEntry {
  name: string
  total: number
  percent: number
}

export interface DpsMeterState {
  skills: DpsSkillEntry[]
  totalDamage: number
  dps: number
}

export const useBattleStore = defineStore('battle', {
  state: () => ({
    // HP/MP
    playerHp: { current: 0, max: 0 } as HpState,
    playerMp: { current: 0, max: 0 } as HpState,
    bossHp: { current: 0, max: 0 } as HpState,
    // Cast/GCD
    gcdState: { remaining: 0, total: 0 },
    playerCast: null as CastInfo | null,
    bossCast: null as CastInfo | null,
    // Buffs
    buffs: [] as BuffSnapshot[],
    buffDefs: new Map<string, BuffDef>(),
    cooldowns: new Map<string, number>(),
    // Damage display
    damageLog: [] as DamageLogEntry[],
    dpsMeter: { skills: [], totalDamage: 0, dps: 0 } as DpsMeterState,
    // Announce
    announceText: null as string | null,
    dialogText: '',
    // Timed-input prompt (blade clash)
    qte: null as QtePrompt | null,
    overhead: null as OverheadStatus | null,
    gauge: [] as GaugeView[],
    gaugeArt: null as 'whm-lily' | null,
    /** Stacks of every buff on the player, hidden ones included (skill usability checks) */
    buffStacks: {} as Record<string, number>,
    // Control
    paused: false,
    battleOver: false,
    battleResult: null as 'victory' | 'wipe' | null,
    practiceMode: false,
    combatElapsed: null as number | null,
    // Scene config
    skillBarEntries: [] as SkillBarEntry[],
    tooltipContext: { gcdDuration: 2500, haste: 0 },
    // Timeline
    timelineEntries: [] as TimelineEntry[],
    currentPhaseInfo: null as { label: string; showLabel: boolean } | null,
    // Debug
    debugPlayerPos: { x: 0, y: 0 },
  }),
})
