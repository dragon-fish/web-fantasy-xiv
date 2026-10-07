// src/game/mechanics/timed-input.ts
export type TimingGrade = 'just' | 'perfect' | 'good' | 'early' | 'late'

/** Half-widths (ms) of each judgement window around the target moment. */
export interface TimingWindows {
  just: number
  perfect: number
  good: number
}

export const DEFAULT_WINDOWS: TimingWindows = { just: 100, perfect: 220, good: 450 }

/**
 * Grade a press `offset` ms from the target moment (negative = early).
 * `null` means the player never pressed inside the window → late.
 */
export function gradeTiming(offset: number | null, w: TimingWindows = DEFAULT_WINDOWS): TimingGrade {
  if (offset === null) return 'late'
  const d = Math.abs(offset)
  if (d <= w.just) return 'just'
  if (d <= w.perfect) return 'perfect'
  if (d <= w.good) return 'good'
  return offset < 0 ? 'early' : 'late'
}
