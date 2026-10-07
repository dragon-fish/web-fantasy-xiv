// src/timeline/timeline-scheduler.ts
import type { EventBus } from '@/core/event-bus'
import type { TimelineAction } from '@/config/schema'

export class TimelineScheduler {
  elapsed = 0
  private pointer = 0
  private enrageFired = false

  constructor(
    private bus: EventBus,
    private actions: TimelineAction[],
    private enrage?: { time: number; castTime: number; skill: string },
  ) {}

  update(dt: number): void {
    this.elapsed += dt

    // Fire all actions whose time has been reached
    while (this.pointer < this.actions.length) {
      const action = this.actions[this.pointer]
      if (action.at > this.elapsed) break

      if (action.action === 'loop') {
        // Jump back to the target time; earlier actions must not replay
        const target = action.loop ?? 0
        this.elapsed = target
        this.pointer = this.actions.findIndex(a => a.at >= target)
        if (this.pointer < 0) this.pointer = this.actions.length
        continue
      }

      this.bus.emit('timeline:action', action)
      this.pointer++
    }

    // Enrage check
    if (this.enrage && !this.enrageFired && this.elapsed >= this.enrage.time) {
      this.enrageFired = true
      this.bus.emit('timeline:enrage', {
        castTime: this.enrage.castTime,
        skill: this.enrage.skill,
      })
    }
  }

  reset(): void {
    this.elapsed = 0
    this.pointer = 0
    this.enrageFired = false
  }
}
