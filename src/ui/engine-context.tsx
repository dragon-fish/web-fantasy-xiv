import { createContext } from 'preact'
import { useContext, useEffect, useRef, useState } from 'preact/hooks'
import { Engine } from '@babylonjs/core'
import type { ComponentChildren } from 'preact'

interface EngineCtx {
  engine: Engine
  canvas: HTMLCanvasElement
}

const Ctx = createContext<EngineCtx | null>(null)

export function useEngine(): EngineCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useEngine must be used within EngineProvider')
  return ctx
}

export function EngineProvider({ children }: { children: ComponentChildren }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<EngineCtx | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none;'
    container.prepend(canvas)

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true })
    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)
    setCtx({ engine, canvas })

    return () => {
      window.removeEventListener('resize', onResize)
      engine.dispose()
    }
  }, [])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {ctx && <Ctx.Provider value={ctx}>{children}</Ctx.Provider>}
    </div>
  )
}
