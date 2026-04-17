// src/tower/events.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/event-bus'
import {
  TOWER_EVENTS,
  onTowerEvent,
  emitTowerEvent,
  type TowerEventMap,
} from '@/tower/events'

describe('tower events', () => {
  it('TOWER_EVENTS exposes all known event names', () => {
    expect(TOWER_EVENTS.RUN_STARTED).toBe('tower:run:started')
    expect(TOWER_EVENTS.RUN_ENDED).toBe('tower:run:ended')
    expect(TOWER_EVENTS.PHASE_CHANGED).toBe('tower:phase:changed')
    expect(TOWER_EVENTS.NODE_ENTERED).toBe('tower:node:entered')
    expect(TOWER_EVENTS.NODE_COMPLETED).toBe('tower:node:completed')
  })

  it('emitTowerEvent delivers typed payloads to onTowerEvent subscribers', () => {
    const bus = new EventBus()
    const handler = vi.fn<(p: TowerEventMap['tower:phase:changed']) => void>()
    onTowerEvent(bus, 'tower:phase:changed', handler)
    emitTowerEvent(bus, 'tower:phase:changed', {
      from: 'no-run',
      to: 'selecting-job',
    })
    expect(handler).toHaveBeenCalledWith({ from: 'no-run', to: 'selecting-job' })
  })

  it('emits are isolated from other event buses', () => {
    const bus1 = new EventBus()
    const bus2 = new EventBus()
    const handler = vi.fn()
    onTowerEvent(bus1, 'tower:run:started', handler)
    emitTowerEvent(bus2, 'tower:run:started', { runId: 'x' })
    expect(handler).not.toHaveBeenCalled()
  })
})
