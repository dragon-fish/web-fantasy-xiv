// src/ui/skill-bar.ts
import type { SkillDef } from '@/core/types'

export class SkillBar {
  private slots: HTMLDivElement[] = []
  private cooldownOverlays: HTMLDivElement[] = []
  private cooldownTexts: HTMLSpanElement[] = []

  constructor(parent: HTMLDivElement, skills: SkillDef[]) {
    const bar = document.createElement('div')
    bar.style.cssText = `
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 8px;
    `

    for (let i = 0; i < 4; i++) {
      const slot = document.createElement('div')
      slot.style.cssText = `
        width: 48px; height: 48px; background: rgba(0,0,0,0.8);
        border: 2px solid rgba(255,255,255,0.4); border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
        position: relative; font-size: 12px;
      `

      const keyLabel = document.createElement('span')
      keyLabel.textContent = `${i + 1}`
      keyLabel.style.cssText = `
        position: absolute; top: 2px; left: 4px; font-size: 10px;
        color: rgba(255,255,255,0.5);
      `
      slot.appendChild(keyLabel)

      const nameLabel = document.createElement('span')
      nameLabel.textContent = skills[i]?.name?.slice(0, 4) ?? ''
      nameLabel.style.cssText = 'font-size: 10px; text-align: center;'
      slot.appendChild(nameLabel)

      const cdOverlay = document.createElement('div')
      cdOverlay.style.cssText = `
        position: absolute; bottom: 0; left: 0; width: 100%;
        background: rgba(0,0,0,0.7); transition: height 0.05s;
        height: 0%;
      `
      slot.appendChild(cdOverlay)

      // Cooldown countdown text (centered, on top of overlay)
      const cdText = document.createElement('span')
      cdText.style.cssText = `
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 14px; font-weight: bold; z-index: 1;
        text-shadow: 1px 1px 2px #000;
        display: none;
      `
      slot.appendChild(cdText)

      this.slots.push(slot)
      this.cooldownOverlays.push(cdOverlay)
      this.cooldownTexts.push(cdText)
      bar.appendChild(slot)
    }

    parent.appendChild(bar)
  }

  updateGcd(gcdRemaining: number, gcdTotal: number): void {
    const pct = gcdTotal > 0 ? (gcdRemaining / gcdTotal) * 100 : 0
    for (let i = 0; i < this.cooldownOverlays.length; i++) {
      this.cooldownOverlays[i].style.height = `${pct}%`
      if (gcdRemaining > 0) {
        this.cooldownTexts[i].style.display = 'block'
        this.cooldownTexts[i].textContent = (gcdRemaining / 1000).toFixed(1)
      } else {
        this.cooldownTexts[i].style.display = 'none'
      }
    }
  }
}
