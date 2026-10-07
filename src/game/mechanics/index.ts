// src/game/mechanics/index.ts
import type { MechanicFactory } from './mechanic-host'
import { bladeClash } from './blade-clash'
import { dance } from './dance'
import { moveAlong } from './move-along'
import { arenaRing } from './arena-ring'
import { scarletHymn } from './scarlet-hymn'
import { forcedMarch } from './forced-march'

/** Mechanics addressable from encounter timelines (`mechanic: <name>`). */
export const MECHANICS: Record<string, MechanicFactory> = {
  blade_clash: bladeClash,
  dance,
  move_along: moveAlong,
  arena_ring: arenaRing,
  scarlet_hymn: scarletHymn,
  forced_march: forcedMarch,
}

/**
 * How a mechanic is applied when a timeline seek skips past it: lasting effects (arena shape,
 * final positions) are applied instantly; anything absent here is skipped (transient).
 */
export const FAST_FORWARD: Record<string, (host: { start(name: string, params?: Record<string, any>): void }, params: Record<string, any>, entities: { get(id: string): { position: { x: number; y: number } } | undefined }) => void> = {
  arena_ring: (host, params) => host.start('arena_ring', params),
  move_along: (_host, params, entities) => {
    const e = entities.get(params.entity ?? 'boss')
    const path = params.path as { x: number; y: number }[] | undefined
    const end = path?.[path.length - 1]
    if (e && end) { e.position.x = end.x; e.position.y = end.y }
  },
}
