// src/game/mechanics/index.ts
import type { MechanicFactory } from './mechanic-host'
import { bladeClash } from './blade-clash'

/** Mechanics addressable from encounter timelines (`mechanic: <name>`). */
export const MECHANICS: Record<string, MechanicFactory> = {
  blade_clash: bladeClash,
}
