import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useDebugStore = defineStore('debug', () => {
  const fps = ref(0)
  return { fps }
})
