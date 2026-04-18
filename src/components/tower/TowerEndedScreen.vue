<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import { getJob } from '@/jobs'

const emit = defineEmits<{
  exit: []
}>()

const tower = useTowerStore()

const jobName = computed(() => {
  if (!tower.run) return '—'
  return getJob(tower.run.advancedJobId ?? tower.run.baseJobId).name
})

const elapsedText = computed(() => {
  if (!tower.run) return '—'
  const ms = Date.now() - tower.run.startedAt
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}分${secs}秒`
})

const completedCount = computed(() => tower.run?.completedNodes.length ?? 0)
</script>

<template lang="pug">
.ended-screen(v-if="tower.run")
  .ended-card
    .ended-title 你的攀登结束了
    .ended-subtitle 决心耗尽
    .ended-summary
      .summary-row
        span.label 职业
        span.value {{ jobName }}
      .summary-row
        span.label 等级
        span.value {{ tower.run.level }}
      .summary-row
        span.label 水晶
        span.value 💎 {{ tower.run.crystals }}
      .summary-row
        span.label 通过节点
        span.value {{ completedCount }}
      .summary-row
        span.label 耗时
        span.value {{ elapsedText }}
    .ended-note
      | 本局记录将在 phase 6 结算系统上线后转化为金币。
    .ended-actions
      button.btn.primary(type="button" @click="emit('exit')") 返回主菜单
</template>

<style lang="scss" scoped>
.ended-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 200px);
  width: 100%;
}

.ended-card {
  min-width: 360px;
  max-width: 440px;
  padding: 32px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  text-align: center;
}

.ended-title {
  font-size: 22px;
  font-weight: bold;
  color: #ccc;
  margin-bottom: 4px;
}

.ended-subtitle {
  font-size: 13px;
  color: #888;
  margin-bottom: 20px;
}

.ended-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  margin-bottom: 16px;
  font-family: monospace;
  font-size: 13px;

  .summary-row {
    display: flex;
    justify-content: space-between;
    .label { color: #888; }
    .value { color: #ddd; }
  }
}

.ended-note {
  font-size: 11px;
  color: #888;
  margin-bottom: 16px;
}

.btn {
  padding: 10px 20px;
  font-size: 13px;
  color: #ccc;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
}
</style>
