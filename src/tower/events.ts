// src/tower/events.ts
//
// Tower mode event name constants + strongly-typed emit/on helpers.
// This module only defines the contract — no handlers are registered here.
// Future tasks (stores, scene code) import TOWER_EVENTS.* and use
// onTowerEvent / emitTowerEvent to stay type-safe.
import type { EventBus } from '@/core/event-bus'
import type { TowerRunPhase } from './types'

export const TOWER_EVENTS = {
  RUN_STARTED: 'tower:run:started',
  RUN_ENDED: 'tower:run:ended',
  PHASE_CHANGED: 'tower:phase:changed',
  NODE_ENTERED: 'tower:node:entered',
  NODE_COMPLETED: 'tower:node:completed',
} as const

/** Payload shapes per event name. */
export interface TowerEventMap {
  'tower:run:started': { runId: string }
  'tower:run:ended': { runId: string; reason: 'victory' | 'exhausted' | 'surrendered' }
  'tower:phase:changed': { from: TowerRunPhase; to: TowerRunPhase }
  'tower:node:entered': { nodeId: number }
  'tower:node:completed': { nodeId: number; outcome: 'victory' | 'surrendered' | 'reward-taken' }
}

export type TowerEventName = keyof TowerEventMap

/** Typed subscriber helper. */
export function onTowerEvent<K extends TowerEventName>(
  bus: EventBus,
  name: K,
  handler: (payload: TowerEventMap[K]) => void,
): void {
  bus.on(name, handler as (payload: unknown) => void)
}

/** Typed emitter helper. */
export function emitTowerEvent<K extends TowerEventName>(
  bus: EventBus,
  name: K,
  payload: TowerEventMap[K],
): void {
  bus.emit(name, payload)
}
