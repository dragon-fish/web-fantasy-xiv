import { signal } from '@preact/signals'
import type { SkillDef, BuffDef } from '@/core/types'

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
  /** Icon image URL; falls back to arrow text when absent */
  icon?: string
  /** Per-stack icon overrides (key 0 = fallback) */
  iconPerStack?: Record<number, string>
  type: 'buff' | 'debuff'
  stacks: number
  remaining: number
  effects: BuffDef['effects']
}

export interface SkillBarEntry {
  key: string
  skill: SkillDef
}

export interface DamageLogEntry {
  time: number
  sourceName: string
  skillName: string
  amount: number
  hpAfter: number
  mitigation: number
}

// Per-frame continuous state
export const playerHp = signal<HpState>({ current: 0, max: 0 })
export const playerMp = signal<HpState>({ current: 0, max: 0 })
export const bossHp = signal<HpState>({ current: 0, max: 0 })
export const gcdState = signal({ remaining: 0, total: 0 })
export const playerCast = signal<CastInfo | null>(null)
export const bossCast = signal<CastInfo | null>(null)
export const buffs = signal<BuffSnapshot[]>([])
export const cooldowns = signal<Map<string, number>>(new Map())

// Discrete event state
export const damageEvents = signal<DamageEvent[]>([])
export const announceText = signal<string | null>(null)
export const dialogText = signal('')

// UI control
export const paused = signal(false)
export const battleResult = signal<'victory' | 'wipe' | null>(null)
export const damageLog = signal<DamageLogEntry[]>([])
export const combatElapsed = signal<number | null>(null)

// Scene-lifetime config (set once per encounter)
export const skillBarEntries = signal<SkillBarEntry[]>([])
export const buffDefs = signal<Map<string, BuffDef>>(new Map())
/** Runtime tooltip context: actual GCD duration and haste value */
export const tooltipContext = signal<{ gcdDuration: number; haste: number }>({ gcdDuration: 2500, haste: 0 })

// DPS meter
export interface DpsSkillEntry {
  name: string
  total: number
  percent: number
}
export const dpsMeter = signal<{ skills: DpsSkillEntry[]; totalDamage: number; dps: number }>({
  skills: [], totalDamage: 0, dps: 0,
})

// Timeline display
export interface TimelineEntry {
  key: string
  skillName: string
  state: 'upcoming' | 'casting' | 'flash'
  /** Time until activation in ms (positive = upcoming, negative = past) */
  timeUntil: number
  /** Skill cast time in ms (0 for instant) */
  castTime: number
  /** Flash elapsed in ms */
  flashElapsed: number
}

export const timelineEntries = signal<TimelineEntry[]>([])
export const timelineCollapsed = signal(localStorage.getItem('xiv-timeline-collapsed') === 'true')
export const currentPhaseInfo = signal<{ label: string; showLabel: boolean } | null>(null)

// Job selection (persists across encounters)
export const selectedJobId = signal(localStorage.getItem('xiv-selected-job') ?? 'default')

// Debug
export const debugFps = signal(0)
export const debugPlayerPos = signal({ x: 0, y: 0 })

/** Reset all signals to default state (call on scene dispose) */
export function resetState(): void {
  playerHp.value = { current: 0, max: 0 }
  playerMp.value = { current: 0, max: 0 }
  bossHp.value = { current: 0, max: 0 }
  gcdState.value = { remaining: 0, total: 0 }
  playerCast.value = null
  bossCast.value = null
  buffs.value = []
  cooldowns.value = new Map()
  damageEvents.value = []
  announceText.value = null
  dialogText.value = ''
  paused.value = false
  battleResult.value = null
  damageLog.value = []
  combatElapsed.value = null
  skillBarEntries.value = []
  buffDefs.value = new Map()
  tooltipContext.value = { gcdDuration: 2500, haste: 0 }
  dpsMeter.value = { skills: [], totalDamage: 0, dps: 0 }
  timelineEntries.value = []
  currentPhaseInfo.value = null
  debugFps.value = 0
  debugPlayerPos.value = { x: 0, y: 0 }
}
