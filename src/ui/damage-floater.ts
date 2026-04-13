// src/ui/damage-floater.ts
export class DamageFloater {
  private container: HTMLDivElement

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: hidden;
    `
    parent.appendChild(this.container)
  }

  spawn(screenX: number, screenY: number, amount: number, isHeal: boolean): void {
    const el = document.createElement('div')
    el.textContent = isHeal ? `+${amount}` : `${amount}`
    el.style.cssText = `
      position: absolute;
      left: ${screenX}px; top: ${screenY}px;
      font-size: 18px; font-weight: bold;
      color: ${isHeal ? '#4eff4e' : '#ff4444'};
      text-shadow: 1px 1px 3px #000;
      pointer-events: none;
      animation: floatUp 1s ease-out forwards;
    `
    this.container.appendChild(el)
    setTimeout(() => el.remove(), 1000)
  }

  /** Inject CSS animation (call once) */
  static injectStyles(): void {
    if (document.getElementById('damage-floater-styles')) return
    const style = document.createElement('style')
    style.id = 'damage-floater-styles'
    style.textContent = `
      @keyframes floatUp {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-60px) scale(0.8); }
      }
    `
    document.head.appendChild(style)
  }
}
