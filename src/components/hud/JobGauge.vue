<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const items = computed(() => battle.gauge)
const BASE = `${import.meta.env.BASE_URL}ui/xiv/jobhud-simple`
const frame = (shape: string) => ({ backgroundImage: `url(${BASE}/${shape}-frame.png)` })
/** The white fill art is used as a mask so one asset takes any job colour */
const fill = (shape: string, color: string) => {
  const url = `url(${BASE}/${shape}-fill.png)`
  return { backgroundColor: color, maskImage: url, WebkitMaskImage: url }
}
</script>

<template lang="pug">
.job-gauge(v-if="items.length")
  .job-gauge__row(v-for="(item, i) in items" :key="i")
    .job-gauge__label {{ item.label }}
    .job-gauge__timer(v-if="item.kind === 'timer'")
      .job-gauge__timer-fill(:style="{ width: `${item.progress * 100}%`, backgroundColor: item.color }")
    .job-gauge__pips(v-else)
      .job-gauge__pip(v-for="n in item.max" :key="n" :style="frame(item.shape)")
        .job-gauge__pip-fill(v-if="n <= item.count" :style="fill(item.shape, item.color)")
</template>

<style lang="scss" scoped>
.job-gauge {
  position: absolute;
  bottom: 100px;
  left: calc(50% + 200px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
  user-select: none;
}

.job-gauge__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.job-gauge__label {
  width: 56px;
  font-size: 11px;
  color: #d7cfbf;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}

.job-gauge__timer {
  width: 96px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: inset 0 0 0 1px rgba(200, 170, 110, 0.6);
  overflow: hidden;
}

.job-gauge__timer-fill {
  height: 100%;
}

.job-gauge__pips {
  display: flex;
  gap: 2px;
}

.job-gauge__pip {
  position: relative;
  width: 28px;
  height: 28px;
  background: center / contain no-repeat;
}

.job-gauge__pip-fill {
  position: absolute;
  inset: 0;
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
}
</style>
