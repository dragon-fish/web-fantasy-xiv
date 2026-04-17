import { ref, readonly } from 'vue'

interface TooltipState {
  html: string
  x: number
  y: number
}

const state = ref<TooltipState | null>(null)

export function useTooltip() {
  return {
    state: readonly(state),
    show: (html: string, x: number, y: number) => {
      state.value = { html, x, y }
    },
    hide: () => {
      state.value = null
    },
  }
}
