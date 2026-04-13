// src/ui/cast-bar.ts
export class CastBar {
  private container: HTMLDivElement
  private fill: HTMLDivElement
  private text: HTMLSpanElement

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%);
      width: 250px; height: 18px;
      background: rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.3);
      border-radius: 3px; overflow: hidden; display: none;
    `

    this.fill = document.createElement('div')
    this.fill.style.cssText = `
      height: 100%; background: linear-gradient(90deg, #4a9eff, #82c0ff);
      transition: width 0.05s;
    `
    this.container.appendChild(this.fill)

    this.text = document.createElement('span')
    this.text.style.cssText = `
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      font-size: 11px; text-shadow: 1px 1px 2px #000;
    `
    this.container.appendChild(this.text)

    parent.appendChild(this.container)
  }

  show(skillName: string): void {
    this.container.style.display = 'block'
    this.text.textContent = skillName
  }

  updateProgress(elapsed: number, total: number): void {
    const pct = total > 0 ? (elapsed / total) * 100 : 0
    this.fill.style.width = `${Math.min(100, pct)}%`
  }

  hide(): void {
    this.container.style.display = 'none'
  }
}
