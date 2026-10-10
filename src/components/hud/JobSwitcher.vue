<script setup lang="ts">
import { PLAYABLE_JOBS, classJobIcon } from '@/jobs'
import { useJobStore } from '@/stores/job'

// Picking a job only updates the store: the encounter page derives the runner's jobId from it and
// the runner reboots the battle on that change.
const jobStore = useJobStore()
</script>

<template lang="pug">
.job-switcher
  .job-switcher__label 切换职业（重新开始）
  .job-switcher__list
    button.job-switcher__btn(
      v-for="j in PLAYABLE_JOBS"
      :key="j.id"
      :class="{ active: j.id === jobStore.job.id }"
      :disabled="j.id === jobStore.job.id"
      @click="jobStore.select(j.id)"
    )
      img(:src="classJobIcon(j.category)" :alt="j.name")
      span {{ j.name }}
</template>

<style lang="scss" scoped>
.job-switcher {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
}

.job-switcher__label {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.job-switcher__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  max-width: 640px;
}

.job-switcher__btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 4px 6px;
  font-size: 13px;
  color: #bbb;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  cursor: pointer;

  img {
    width: 20px;
    height: 20px;
  }

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  &.active {
    cursor: default;
    color: #ffd27a;
    border-color: rgba(255, 210, 122, 0.6);
  }
}
</style>
