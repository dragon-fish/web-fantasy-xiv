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
