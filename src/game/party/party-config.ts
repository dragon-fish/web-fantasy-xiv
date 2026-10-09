// src/game/party/party-config.ts
// Encounter `party:` block — turns on party mode (three NPC allies).
import type { Vec2 } from '@/core/types'

export interface PartyConfig {
  /** Clear time the NPC damage director steers towards (ms); default derived from boss HP */
  targetTime?: number
  /** Chance per NPC per mechanic to react late or stand off their spot */
  mistakeRate: number
  /** Where NPCs gather when nothing can be attacked */
  idle: Vec2
  /** Where the NPC tank holds the boss, and the way the boss faces there (degrees, 0 = north / +y) */
  tankSpot: Vec2 & { facing: number }
}

const COMPASS: Record<string, number> = { north: 0, east: 90, south: 180, west: 270 }

function parseFacing(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (raw == null) return 0
  const angle = COMPASS[String(raw)]
  if (angle == null) throw new Error(`[party] unknown facing '${raw}' (north / east / south / west or degrees)`)
  return angle
}

export function parsePartyConfig(raw: any): PartyConfig {
  const block = raw === true ? {} : raw
  return {
    ...(typeof block.targetTime === 'number' ? { targetTime: block.targetTime * 1000 } : {}),
    mistakeRate: block.mistakeRate ?? 0.03,
    idle: { x: block.idle?.x ?? 0, y: block.idle?.y ?? 0 },
    tankSpot: { x: block.tankSpot?.x ?? 0, y: block.tankSpot?.y ?? 0, facing: parseFacing(block.tankSpot?.facing) },
  }
}
