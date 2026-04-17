import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { getJob } from '@/jobs'

export const useJobStore = defineStore('job', () => {
  const selectedJobId = useLocalStorage('xiv-selected-job', 'default')
  const job = computed(() => getJob(selectedJobId.value))
  function select(id: string) {
    selectedJobId.value = id
  }
  return { selectedJobId, job, select }
})
