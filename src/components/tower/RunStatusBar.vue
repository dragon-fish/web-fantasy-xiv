<script setup lang="ts">
import { computed } from 'vue'
import { useTowerStore } from '@/stores/tower'
import { getJob } from '@/jobs'

const tower = useTowerStore()

const jobName = computed(() => {
  if (!tower.run) return '—'
  const id = tower.run.advancedJobId ?? tower.run.baseJobId
  return getJob(id).name
})

const hearts = computed(() => {
  if (!tower.run) return { filled: 0, empty: 5 }
  const filled = Math.max(0, tower.run.determination)
  const empty = Math.max(0, tower.run.maxDetermination - filled)
  return { filled, empty }
})

const weaponLabel = computed(() => {
  if (!tower.run) return '—'
  if (tower.run.currentWeapon) return '装备中'
  return '基础'
})

const materiaSlots = computed(() => {
  if (!tower.run) return ['○', '○', '○', '○', '○']
  return ['○', '○', '○', '○', '○']
})
</script>

<template lang="pug">
.run-status-bar(v-if="tower.run")
  .seg.job
    span.label 职业
    span.value {{ jobName }}
  .seg.level
    span.label Lv
    span.value {{ tower.run.level }}/15
  .seg.determination
    span.label 决心
    span.hearts
      span.heart.filled(v-for="n in hearts.filled" :key="`f${n}`") ❤️
      span.heart.empty(v-for="n in hearts.empty" :key="`e${n}`") 🖤
  .seg.crystals
    span.label 水晶
    span.value 💎 {{ tower.run.crystals }}
  .seg.weapon
    span.label 装备
    span.value {{ weaponLabel }}
  .seg.materia
    span.label 魔晶石
    span.slots
      span.slot(v-for="(s, i) in materiaSlots" :key="i") {{ s }}
</template>

<style lang="scss" scoped>
.run-status-bar {
  position: fixed;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px;
  margin-bottom: 12px;
  max-width: 900px;
  width: 95%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
}

.seg {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .label {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .value, .hearts, .slots {
    color: #ddd;
    font-size: 13px;
  }
}

.hearts {
  display: inline-flex;
  gap: 2px;

  .heart {
    filter: grayscale(0);
    &.empty { filter: grayscale(1) opacity(0.4); }
  }
}

.slots {
  display: inline-flex;
  gap: 4px;

  .slot {
    color: #666;
  }
}
</style>
