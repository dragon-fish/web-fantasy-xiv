import { defineStore } from 'pinia'
import type { BuffDef } from '@/core/types'
import type { TimelineEntry } from '@/timeline/types'
import type { DamageLogEntry } from '@/game/types'
import type { SkillBarEntry } from '@/jobs/shared'

export interface HpState {
  current: number
  max: number
  shield?: number
}

export interface CastInfo {
  name: string
  elapsed: number
  total: number
}

export interface DamageEvent {
  id: number
  screenX: number
  screenY: number
  amount: number
  isHeal: boolean
  isInvulnerable?: boolean
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
    damageEvents: [] as DamageEvent[],
    damageLog: [] as DamageLogEntry[],
    dpsMeter: { skills: [], totalDamage: 0, dps: 0 } as DpsMeterState,
    // Announce
    announceText: null as string | null,
    dialogText: '',
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
