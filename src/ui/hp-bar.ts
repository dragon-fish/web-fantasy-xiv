// src/ui/hp-bar.ts
export class HpBar {
  private container: HTMLDivElement
  private fill: HTMLDivElement
  private text: HTMLSpanElement

  constructor(parent: HTMLDivElement, label: string, color: string, position: 'top' | 'bottom') {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; ${position === 'top' ? 'top: 20px' : 'bottom: 80px'};
      left: 50%; transform: translateX(-50%);
      width: 300px; height: 24px;
      background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.3);
      border-radius: 3px; overflow: hidden;
    `

    const labelEl = document.createElement('span')
    labelEl.textContent = label
    labelEl.style.cssText = `
      position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
      font-size: 11px; z-index: 1; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(labelEl)

    this.fill = document.createElement('div')
    this.fill.style.cssText = `
      height: 100%; background: ${color}; transition: width 0.1s;
    `
    this.container.appendChild(this.fill)

    this.text = document.createElement('span')
    this.text.style.cssText = `
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      font-size: 11px; z-index: 1; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(this.text)

    parent.appendChild(this.container)
  }

  update(current: number, max: number): void {
    const pct = max > 0 ? (current / max) * 100 : 0
    this.fill.style.width = `${pct}%`
    this.text.textContent = `${Math.floor(current)} / ${max}`
  }
}
