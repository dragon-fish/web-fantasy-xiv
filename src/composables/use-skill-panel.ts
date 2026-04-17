import { ref } from 'vue'
import { useMagicKeys, whenever } from '@vueuse/core'

const isOpen = ref(false)

export function useSkillPanel() {
  return {
    isOpen,
    toggle: () => {
      isOpen.value = !isOpen.value
    },
    close: () => {
      isOpen.value = false
    },
  }
}

/** Bind P key to toggle. Call ONLY inside encounter/battle scope — not in main menu. */
export function useSkillPanelHotkey() {
  const keys = useMagicKeys()
  const { toggle } = useSkillPanel()
  whenever(keys.p, toggle)
}
