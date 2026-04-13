// src/timeline/timeline-scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { TimelineScheduler } from '@/timeline/timeline-scheduler'
import { EventBus } from '@/core/event-bus'
import type { TimelineAction } from '@/config/schema'

describe('TimelineScheduler', () => {
  function setup(actions: TimelineAction[], enrage?: { time: number; castTime: number; skill: string }) {
    const bus = new EventBus()
    const scheduler = new TimelineScheduler(bus, actions, enrage)
    return { bus, scheduler }
  }

  it('should fire action at correct time', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'slash' },
      { at: 5000, action: 'use', use: 'raidwide' },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16) // t=16
    expect(handler).toHaveBeenCalledTimes(1) // at:0 fires immediately
    expect(handler.mock.calls[0][0].action).toBe('use')
    expect(handler.mock.calls[0][0].use).toBe('slash')

    handler.mockClear()
    scheduler.update(4984) // t=5000
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0][0].use).toBe('raidwide')
  })

  it('should not fire same action twice', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'slash' },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16)
    scheduler.update(16)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should handle loop action', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([
      { at: 0, action: 'use', use: 'a' },
      { at: 1000, action: 'use', use: 'b' },
      { at: 2000, action: 'loop', loop: 0 },
    ])
    bus.on('timeline:action', handler)

    scheduler.update(16)    // t=16, fires 'a'
    scheduler.update(984)   // t=1000, fires 'b'
    scheduler.update(1000)  // t=2000, loop resets to 0
    scheduler.update(16)    // fires 'a' again
    expect(handler).toHaveBeenCalledTimes(3) // a, b, a
  })

  it('should emit timeline:enrage when enrage timer expires', () => {
    const handler = vi.fn()
    const { bus, scheduler } = setup([], { time: 1000, castTime: 500, skill: 'enrage_blast' })
    bus.on('timeline:enrage', handler)

    scheduler.update(999)
    expect(handler).not.toHaveBeenCalled()
    scheduler.update(1)
    expect(handler).toHaveBeenCalledWith({ castTime: 500, skill: 'enrage_blast' })
  })

  it('should track elapsed time', () => {
    const { scheduler } = setup([])
    scheduler.update(100)
    scheduler.update(200)
    expect(scheduler.elapsed).toBe(300)
  })
})
