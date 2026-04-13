// src/ui/debug-info.ts
import type { Entity } from '@/entity/entity'

export class DebugInfo {
  private container: HTMLDivElement
  private fpsEl: HTMLSpanElement
  private posEl: HTMLSpanElement
  private timeEl: HTMLSpanElement

  private frameCount = 0
  private fpsAccum = 0
  private currentFps = 0

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 12px; right: 12px;
      background: rgba(0,0,0,0.5); padding: 6px 10px;
      border-radius: 4px; font-size: 11px; font-family: monospace;
      color: #999; line-height: 1.6; pointer-events: none;
      min-width: 160px;
    `

    this.fpsEl = this.addLine('FPS')
    this.posEl = this.addLine('POS')
    this.timeEl = this.addLine('TIME')

    parent.appendChild(this.container)
  }

  private addLine(label: string): HTMLSpanElement {
    const row = document.createElement('div')
    const labelEl = document.createElement('span')
    labelEl.textContent = `${label} `
    labelEl.style.color = '#666'
    row.appendChild(labelEl)
    const valueEl = document.createElement('span')
    row.appendChild(valueEl)
    this.container.appendChild(row)
    return valueEl
  }

  update(deltaMs: number, player: Entity, combatElapsed: number | null): void {
    // FPS (smoothed over ~0.5s)
    this.frameCount++
    this.fpsAccum += deltaMs
    if (this.fpsAccum >= 500) {
      this.currentFps = Math.round((this.frameCount / this.fpsAccum) * 1000)
      this.frameCount = 0
      this.fpsAccum = 0
    }
    this.fpsEl.textContent = `${this.currentFps}`

    // Player position
    this.posEl.textContent = `${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)}`

    // Combat time
    if (combatElapsed === null) {
      this.timeEl.textContent = '--:--'
      this.timeEl.style.color = '#666'
    } else {
      const sec = combatElapsed / 1000
      const m = Math.floor(sec / 60)
      const s = (sec % 60).toFixed(1).padStart(4, '0')
      this.timeEl.textContent = `${m}:${s}`
      this.timeEl.style.color = '#999'
    }
  }
}
