// src/core/event-bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/event-bus'

describe('EventBus', () => {
  it('should call subscriber when event is emitted', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('damage:dealt', handler)
    const payload = { amount: 100 }
    bus.emit('damage:dealt', payload)
    expect(handler).toHaveBeenCalledWith(payload)
  })

  it('should support multiple subscribers', () => {
    const bus = new EventBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('entity:created', h1)
    bus.on('entity:created', h2)
    bus.emit('entity:created', { id: '1' })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('should unsubscribe with off()', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('entity:died', handler)
    bus.off('entity:died', handler)
    bus.emit('entity:died', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('should support once() - auto unsubscribe after first call', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.once('combat:started', handler)
    bus.emit('combat:started', {})
    bus.emit('combat:started', {})
    expect(handler).toHaveBeenCalledOnce()
  })

  it('should not throw when emitting event with no subscribers', () => {
    const bus = new EventBus()
    expect(() => bus.emit('entity:moved', {})).not.toThrow()
  })
})
