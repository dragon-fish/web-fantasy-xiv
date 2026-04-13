// src/ui/skill-bar.ts
import type { SkillBarEntry } from './ui-manager'

export class SkillBar {
  private slots: HTMLDivElement[] = []
  private cooldownOverlays: HTMLDivElement[] = []
  private cooldownTexts: HTMLSpanElement[] = []
  private entries: SkillBarEntry[]

  constructor(parent: HTMLDivElement, entries: SkillBarEntry[]) {
    this.entries = entries

    const bar = document.createElement('div')
    bar.style.cssText = `
      position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 6px;
    `

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const slot = document.createElement('div')
      slot.style.cssText = `
        width: 48px; height: 48px; background: rgba(0,0,0,0.8);
        border: 2px solid rgba(255,255,255,0.4); border-radius: 4px;
        display: flex; align-items: center; justify-content: center;
        position: relative; font-size: 12px;
      `

      const keyLabel = document.createElement('span')
      keyLabel.textContent = entry.key
      keyLabel.style.cssText = `
        position: absolute; top: 2px; left: 4px; font-size: 10px;
        color: rgba(255,255,255,0.5);
      `
      slot.appendChild(keyLabel)

      const nameLabel = document.createElement('span')
      nameLabel.textContent = entry.skill.name.slice(0, 3)
      nameLabel.style.cssText = 'font-size: 9px; text-align: center;'
      slot.appendChild(nameLabel)

      const cdOverlay = document.createElement('div')
      cdOverlay.style.cssText = `
        position: absolute; bottom: 0; left: 0; width: 100%;
        background: rgba(0,0,0,0.7); transition: height 0.05s;
        height: 0%;
      `
      slot.appendChild(cdOverlay)

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

  update(gcdRemaining: number, gcdTotal: number, getCooldown: (skillId: string) => number): void {
    for (let i = 0; i < this.entries.length; i++) {
      const skill = this.entries[i].skill
      const overlay = this.cooldownOverlays[i]
      const text = this.cooldownTexts[i]

      if (!skill.gcd && skill.cooldown > 0) {
        const cd = getCooldown(skill.id)
        if (cd > 0) {
          overlay.style.height = `${(cd / skill.cooldown) * 100}%`
          text.style.display = 'block'
          text.textContent = (cd / 1000).toFixed(1)
        } else {
          overlay.style.height = '0%'
          text.style.display = 'none'
        }
        continue
      }

      if (skill.gcd && gcdRemaining > 0) {
        overlay.style.height = `${(gcdRemaining / gcdTotal) * 100}%`
        text.style.display = 'block'
        text.textContent = (gcdRemaining / 1000).toFixed(1)
      } else {
        overlay.style.height = '0%'
        text.style.display = 'none'
      }
    }
  }
}
