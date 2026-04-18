// src/devtools/dev-terminal.ts
import type { EventBus } from '@/core/event-bus'
import type { CommandRegistry } from './commands'

const MAX_LOG_LINES = 200

export class DevTerminal {
  private logs: string[] = []
  private container: HTMLDivElement | null = null
  private logEl: HTMLDivElement | null = null
  private inputEl: HTMLInputElement | null = null
  private visible = false

  constructor(
    private bus: EventBus,
    private commands: CommandRegistry,
  ) {
    this.subscribeEvents()
  }

  /** Attach to DOM (call once when UI is ready) */
  mount(parent: HTMLDivElement): void {
    this.container = document.createElement('div')
    this.container.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 40%;
      background: rgba(0, 0, 0, 0.85); display: none;
      flex-direction: column; z-index: 200; font-family: monospace;
      border-bottom: 1px solid rgba(255,255,255,0.15);
    `

    this.logEl = document.createElement('div')
    this.logEl.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px 12px;
      font-size: 12px; color: #aaa; line-height: 1.5;
      white-space: pre-wrap; word-break: break-all;
    `
    this.container.appendChild(this.logEl)

    this.inputEl = document.createElement('input')
    this.inputEl.style.cssText = `
      width: 100%; padding: 6px 12px; font-size: 13px;
      background: rgba(255,255,255,0.05); color: #ddd;
      border: none; border-top: 1px solid rgba(255,255,255,0.1);
      outline: none; font-family: monospace;
    `
    this.inputEl.placeholder = '> Type a command...'
    this.inputEl.addEventListener('keydown', (e) => {
      // Allow Esc to close terminal from within input; ~ stays insertable.
      if (e.code === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.toggle()
        return
      }
      if (e.key === 'Enter') {
        const input = this.inputEl!.value.trim()
        if (input) {
          this.addLog(`> ${input}`, '#8cf')
          const result = this.commands.execute(input)
          if (result) this.addLog(result, '#ccc')
          this.inputEl!.value = ''
        }
      }
      // Prevent game input while typing
      e.stopPropagation()
    })
    this.container.appendChild(this.inputEl)

    parent.appendChild(this.container)

    // Toggle with ~ key, close with ESC
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        e.preventDefault()
        this.toggle()
      }
      if (e.code === 'Escape' && this.visible) {
        e.preventDefault()
        e.stopPropagation()
        this.toggle()
      }
    })
  }

  toggle(): void {
    this.visible = !this.visible
    if (this.container) {
      this.container.style.display = this.visible ? 'flex' : 'none'
      if (this.visible) this.inputEl?.focus()
    }
  }

  isVisible(): boolean { return this.visible }

  getLogs(): string[] { return [...this.logs] }

  addLog(message: string, color = '#aaa'): void {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false })
    const line = `[${timestamp}] ${message}`
    this.logs.push(line)
    if (this.logs.length > MAX_LOG_LINES) this.logs.shift()

    if (this.logEl) {
      const lineEl = document.createElement('div')
      lineEl.textContent = line
      lineEl.style.color = color
      this.logEl.appendChild(lineEl)

      // Auto-scroll to bottom
      this.logEl.scrollTop = this.logEl.scrollHeight

      // Trim DOM
      while (this.logEl.children.length > MAX_LOG_LINES) {
        this.logEl.removeChild(this.logEl.firstChild!)
      }
    }
  }

  private subscribeEvents(): void {
    this.bus.on('skill:cast_start', (p: any) => {
      this.addLog(`${p.caster?.id} starts casting ${p.skill?.name ?? p.skillId}`, '#7bf')
    })

    this.bus.on('skill:cast_complete', (p: any) => {
      const name = p.skill?.name ?? p.skillId ?? '?'
      this.addLog(`${p.caster?.id} casts ${name}`, '#8f8')
    })

    this.bus.on('skill:cast_interrupted', (p: any) => {
      this.addLog(`${p.caster?.id} interrupted (${p.reason})`, '#fa5')
    })

    this.bus.on('damage:dealt', (p: any) => {
      this.addLog(`${p.source?.id} → ${p.target?.id}: ${p.amount} damage`, '#f88')
    })

    this.bus.on('damage:lethal', (p: any) => {
      this.addLog(`LETHAL: ${p.target?.id} killed (${p.reason})`, '#f44')
    })

    this.bus.on('entity:created', (p: any) => {
      this.addLog(`Entity created: ${p.entity?.id} (${p.entity?.type})`, '#888')
    })

    this.bus.on('entity:died', (p: any) => {
      this.addLog(`Entity died: ${p.entity?.id}`, '#f66')
    })

    this.bus.on('buff:applied', (p: any) => {
      this.addLog(`${p.target?.id} gained ${p.buff?.name}`, '#bf8')
    })

    this.bus.on('buff:removed', (p: any) => {
      this.addLog(`${p.target?.id} lost ${p.buff?.name} (${p.reason})`, '#ba8')
    })

    this.bus.on('target:locked', (p: any) => {
      this.addLog(`${p.entity?.id} locked target: ${p.target?.id}`, '#aaf')
    })

    this.bus.on('target:released', (p: any) => {
      this.addLog(`${p.entity?.id} released target`, '#aaf')
    })

    this.bus.on('aoe:zone_created', (p: any) => {
      this.addLog(`AOE zone created: ${p.zone?.def?.shape?.type} (${p.skill})`, '#fa8')
    })

    this.bus.on('aoe:zone_resolved', (p: any) => {
      const hitCount = p.hitEntities?.length ?? 0
      this.addLog(`AOE zone resolved: hit ${hitCount} entities`, '#fa8')
    })
  }
}
