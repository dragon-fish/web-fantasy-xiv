// src/ui/buff-bar.ts
import type { Entity, BuffInstance } from '@/entity/entity'
import type { BuffSystem } from '@/combat/buff'

export class BuffBar {
  private container: HTMLDivElement

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%);
      display: flex; gap: 4px; pointer-events: none;
    `
    parent.appendChild(this.container)
  }

  update(entity: Entity, buffSystem: BuffSystem): void {
    // Reconcile DOM with entity.buffs
    const needed = entity.buffs.length
    while (this.container.children.length > needed) {
      this.container.removeChild(this.container.lastChild!)
    }
    while (this.container.children.length < needed) {
      this.container.appendChild(this.createIcon())
    }

    for (let i = 0; i < entity.buffs.length; i++) {
      const inst = entity.buffs[i]
      const el = this.container.children[i] as HTMLDivElement
      const arrow = el.querySelector('.arrow') as HTMLSpanElement
      const timer = el.querySelector('.timer') as HTMLSpanElement

      // Determine buff or debuff from the def
      const isBuff = !inst.defId.includes('debuff') // heuristic; ideally check def.type
      // Better: check via buffSystem
      const isDebuff = this.isDebuff(inst, buffSystem)

      arrow.textContent = isDebuff ? '▼' : '▲'
      arrow.style.color = isDebuff ? '#ff6666' : '#66ff66'
      el.style.borderColor = isDebuff ? 'rgba(255,80,80,0.4)' : 'rgba(80,255,80,0.4)'

      if (inst.remaining > 0) {
        timer.textContent = (inst.remaining / 1000).toFixed(0)
      } else {
        timer.textContent = '∞'
      }
    }
  }

  private isDebuff(inst: BuffInstance, buffSystem: BuffSystem): boolean {
    // Try to read from registered defs via naming convention
    // A proper implementation would check BuffDef.type, but BuffSystem
    // doesn't expose getDef(). Use defId heuristic for prototype.
    return inst.defId.toLowerCase().includes('debuff')
      || inst.defId.toLowerCase().includes('slow')
      || inst.defId.toLowerCase().includes('poison')
      || inst.defId.toLowerCase().includes('stun')
      || inst.defId.toLowerCase().includes('silence')
  }

  private createIcon(): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = `
      width: 28px; height: 28px;
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(80,255,80,0.4);
      border-radius: 3px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-size: 10px; position: relative;
    `

    const arrow = document.createElement('span')
    arrow.className = 'arrow'
    arrow.style.cssText = 'font-size: 12px; line-height: 1;'
    el.appendChild(arrow)

    const timer = document.createElement('span')
    timer.className = 'timer'
    timer.style.cssText = 'font-size: 9px; color: #aaa; line-height: 1;'
    el.appendChild(timer)

    return el
  }
}
