// src/game/mechanics/index.ts
import type { MechanicFactory } from './mechanic-host'
import { bladeClash } from './blade-clash'
import { dance } from './dance'
import { moveAlong } from './move-along'
import { arenaRing } from './arena-ring'

/** Mechanics addressable from encounter timelines (`mechanic: <name>`). */
export const MECHANICS: Record<string, MechanicFactory> = {
  blade_clash: bladeClash,
  dance,
  move_along: moveAlong,
  arena_ring: arenaRing,
}
