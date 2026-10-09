// src/core/game-loop.ts
export const LOGIC_TICK = 16 // ms
const MAX_DELTA = 250 // prevent spiral of death

export class GameLoop {
  private accumulator = 0
  private updateFn: ((dt: number) => void) | null = null

  logicTime = 0
  alpha = 0
  /** Dev fast-forward: logic ticks run this many times faster than wall time */
  timeScale = 1

  onUpdate(fn: (dt: number) => void): void {
    this.updateFn = fn
  }

  tick(deltaMs: number): void {
    const clamped = Math.min(deltaMs, MAX_DELTA)
    this.accumulator += clamped * this.timeScale

    while (this.accumulator >= LOGIC_TICK) {
      this.updateFn?.(LOGIC_TICK)
      this.logicTime += LOGIC_TICK
      this.accumulator -= LOGIC_TICK
    }

    this.alpha = this.accumulator / LOGIC_TICK
  }
}
