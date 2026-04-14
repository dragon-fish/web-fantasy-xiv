import type { EventBus } from '@/core/event-bus'

type Handler = (payload: any) => void

interface ScriptHandle {
  subscriptions: Array<{ event: string; handler: Handler }>
  timeouts: Set<number>
  disposed: boolean
}

export interface ScriptContext {
  on: (event: string, handler: Handler) => void
  off: (event: string, handler: Handler) => void
  once: (event: string, handler: Handler) => void
  wait: (ms: number) => Promise<void>
  Math: typeof Math
  console: { log: (...args: any[]) => void }
  [key: string]: any
}

export interface ScriptRunnerDeps {
  bus: EventBus
  /** Called to build extra ctx properties (game actions, entity access, etc.) */
  buildCtx: (handle: ScriptHandle) => Record<string, any>
}

export class ScriptRunner {
  private handles = new Set<ScriptHandle>()

  constructor(private deps: ScriptRunnerDeps) {}

  run(scriptSource: string): void {
    const handle: ScriptHandle = {
      subscriptions: [],
      timeouts: new Set(),
      disposed: false,
    }
    this.handles.add(handle)

    const bus = this.deps.bus

    const ctx: ScriptContext = {
      on: (event: string, handler: Handler) => {
        if (handle.disposed) return
        handle.subscriptions.push({ event, handler })
        bus.on(event, handler)
      },
      off: (event: string, handler: Handler) => {
        bus.off(event, handler)
        handle.subscriptions = handle.subscriptions.filter(
          s => !(s.event === event && s.handler === handler)
        )
      },
      once: (event: string, handler: Handler) => {
        if (handle.disposed) return
        const wrapper: Handler = (payload) => {
          ctx.off(event, wrapper)
          handler(payload)
        }
        ctx.on(event, wrapper)
      },
      wait: (ms: number) => {
        return new Promise<void>((resolve) => {
          if (handle.disposed) return
          const id = window.setTimeout(() => {
            handle.timeouts.delete(id)
            if (!handle.disposed) resolve()
          }, ms)
          handle.timeouts.add(id)
        })
      },
      Math,
      console: { log: (...args: any[]) => console.log('[script]', ...args) },
      ...this.deps.buildCtx(handle),
    }

    // Execute script in sandbox
    try {
      const fn = new Function('ctx', `
        const { Math, console } = ctx;
        return (${scriptSource})(ctx);
      `)
      const result = fn(ctx)
      // If result is a promise (async main), handle completion
      if (result && typeof result.then === 'function') {
        result.then(() => this.dispose(handle)).catch((err: any) => {
          console.error('[script] error:', err)
          this.dispose(handle)
        })
      }
    } catch (err) {
      console.error('[script] compile/run error:', err)
      this.dispose(handle)
    }
  }

  private dispose(handle: ScriptHandle): void {
    if (handle.disposed) return
    handle.disposed = true

    // Clean up event subscriptions
    for (const sub of handle.subscriptions) {
      this.deps.bus.off(sub.event, sub.handler)
    }
    handle.subscriptions = []

    // Clean up timeouts
    for (const id of handle.timeouts) {
      clearTimeout(id)
    }
    handle.timeouts.clear()

    this.handles.delete(handle)
  }

  disposeAll(): void {
    for (const handle of this.handles) {
      this.dispose(handle)
    }
  }
}
