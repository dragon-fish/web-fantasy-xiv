// src/ui/main-menu.ts
export class MainMenu {
  private container: HTMLDivElement
  private onStart: (() => void) | null = null

  constructor(parent: HTMLDivElement) {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0, 0, 0, 0.85); z-index: 100;
    `

    const title = document.createElement('h1')
    title.textContent = 'XIV Stage Play'
    title.style.cssText = `
      font-size: 36px; color: #e0e0e0; margin-bottom: 8px;
      font-weight: 300; letter-spacing: 4px;
    `
    this.container.appendChild(title)

    const subtitle = document.createElement('p')
    subtitle.textContent = 'Boss Battle Simulator'
    subtitle.style.cssText = `
      font-size: 14px; color: #888; margin-bottom: 40px;
      letter-spacing: 2px;
    `
    this.container.appendChild(subtitle)

    const startBtn = document.createElement('button')
    startBtn.textContent = '▶  Training Dummy'
    startBtn.style.cssText = `
      padding: 12px 32px; font-size: 16px;
      background: rgba(255, 255, 255, 0.1); color: #ccc;
      border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px;
      cursor: pointer; transition: all 0.15s;
      letter-spacing: 1px;
    `
    startBtn.addEventListener('mouseenter', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.2)'
      startBtn.style.color = '#fff'
    })
    startBtn.addEventListener('mouseleave', () => {
      startBtn.style.background = 'rgba(255, 255, 255, 0.1)'
      startBtn.style.color = '#ccc'
    })
    startBtn.addEventListener('click', () => this.onStart?.())
    this.container.appendChild(startBtn)

    parent.appendChild(this.container)
  }

  onStartGame(cb: () => void): void {
    this.onStart = cb
  }

  hide(): void {
    this.container.style.display = 'none'
  }

  show(): void {
    this.container.style.display = 'flex'
  }
}
