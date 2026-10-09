import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { getPlayableJob } from '@/jobs'

export const useJobStore = defineStore('job', () => {
  const selectedJobId = useLocalStorage('xiv-selected-job', 'default')
  const job = computed(() => getPlayableJob(selectedJobId.value))
  function select(id: string) {
    selectedJobId.value = id
  }
  return { selectedJobId, job, select }
})
