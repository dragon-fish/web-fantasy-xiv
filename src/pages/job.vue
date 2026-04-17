<script setup lang="ts">
import { ref, computed } from 'vue'
import { JOBS, JOB_CATEGORY_LABELS, classJobIcon } from '@/jobs'
import { useJobStore } from '@/stores/job'

const jobStore = useJobStore()
const viewId = ref(jobStore.selectedJobId)
const job = computed(() => JOBS.find((j) => j.id === viewId.value) ?? JOBS[0])
const isActive = computed(() => viewId.value === jobStore.selectedJobId)

function onTrial() {
  jobStore.select(job.value.id)
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .job-layout
    .job-list
      button.job-item(
        v-for="j in JOBS"
        :key="j.id"
        :class="{ selected: j.id === viewId }"
        @click="viewId = j.id"
      )
        span {{ j.name }}
        span.job-equipped-marker(v-if="j.id === jobStore.selectedJobId") ✓
    .job-detail
      .job-detail-header
        img.job-icon(:src="classJobIcon(job.category)" :alt="JOB_CATEGORY_LABELS[job.category]")
        span.job-name {{ job.name }}
        span.job-category {{ JOB_CATEGORY_LABELS[job.category] }}
      .job-description(v-if="job.description") {{ job.description }}
      .job-stats
        | HP {{ job.stats.hp }} | ATK {{ job.stats.attack }} | SPD {{ job.stats.speed }}
        template(v-if="job.stats.mp > 0")  &nbsp;| MP {{ job.stats.mp }}
        |  | Range {{ job.stats.autoAttackRange }}m
      .job-skills
        MenuCompactSkillRow(
          v-for="entry in job.skillBar"
          :key="entry.key"
          :key-label="entry.key"
          :skill="entry.skill"
          :buff-defs="job.buffMap"
          :gcd-duration="job.stats.gcdDuration"
        )
      .job-actions
        RouterLink.btn-trial(
          to="/encounter/training-dummy"
          @click="onTrial"
        ) 试玩
        button.btn-equip(
          :disabled="isActive"
          @click="!isActive && jobStore.select(job.id)"
        ) {{ isActive ? '已选择' : '切换为此职业' }}
</template>

<style lang="scss" scoped>
.job-layout {
  display: flex;
  gap: 16px;
  max-width: 700px;
  width: 90%;
  height: 60vh;
}
.job-list {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.job-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #888;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;

  &.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
}
.job-equipped-marker {
  font-size: 10px;
  color: #6a6;
  margin-left: 4px;
}
.job-detail {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.job-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-shrink: 0;
}
.job-icon { width: 20px; height: 20px; }
.job-name { font-size: 14px; color: #ccc; font-weight: bold; }
.job-category { font-size: 11px; color: #666; }
.job-description {
  font-size: 11px;
  color: #777;
  line-height: 1.6;
  margin-bottom: 8px;
}
.job-stats {
  font-size: 11px;
  color: #888;
  line-height: 1.8;
  margin-bottom: 12px;
}
.job-skills {
  flex: 1;
  overflow-y: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.job-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
.btn-trial {
  padding: 6px 16px;
  font-size: 12px;
  background: rgba(184, 160, 106, 0.15);
  border: 1px solid rgba(184, 160, 106, 0.4);
  border-radius: 4px;
  color: #b8a06a;
  text-decoration: none;
}
.btn-equip {
  padding: 6px 16px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  color: #ddd;
  cursor: pointer;

  &:disabled {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.1);
    color: #666;
    cursor: default;
  }
}
</style>
