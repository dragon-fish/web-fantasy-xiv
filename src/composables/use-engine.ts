import { inject, provide, shallowRef, onMounted, onBeforeUnmount, type InjectionKey, type Ref } from 'vue'
import { Engine } from '@babylonjs/core'
import { useEventListener } from '@vueuse/core'

interface EngineCtx {
  engine: Ref<Engine | null>
  canvas: Ref<HTMLCanvasElement | null>
}

const KEY = Symbol('xiv-engine') as InjectionKey<EngineCtx>

export function provideEngine(canvas: Ref<HTMLCanvasElement | null>): EngineCtx {
  const engine = shallowRef<Engine | null>(null)
  onMounted(() => {
    if (canvas.value) {
      engine.value = new Engine(canvas.value, true, { preserveDrawingBuffer: true })
    }
  })
  useEventListener(window, 'resize', () => engine.value?.resize())
  onBeforeUnmount(() => {
    engine.value?.dispose()
    engine.value = null
  })
  const ctx: EngineCtx = { engine, canvas }
  provide(KEY, ctx)
  return ctx
}

export function useEngine(): EngineCtx {
  const ctx = inject(KEY)
  if (!ctx) throw new Error('useEngine must be used within <App>')
  return ctx
}
