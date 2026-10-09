<script setup lang="ts">
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const items = computed(() => battle.gauge)
/** FFXIV's "simple display" option; per viewer, click the gauge to toggle */
const simple = useLocalStorage('xiv-gauge-simple', false)
const showArt = computed(() => !!battle.gaugeArt && !simple.value)

const BASE = `${import.meta.env.BASE_URL}ui/xiv/jobhud-simple`
const frame = (shape: string) => ({ backgroundImage: `url(${BASE}/${shape}-frame.png)` })
/** The white fill art is used as a mask so one asset takes any job colour */
const fill = (shape: string, color: string) => {
  const url = `url(${BASE}/${shape}-fill.png)`
  return { backgroundColor: color, maskImage: url, WebkitMaskImage: url }
}
</script>

<template lang="pug">
.job-gauge(
  v-if="items.length"
  :title="battle.gaugeArt ? '点击切换简洁显示' : undefined"
  @click="battle.gaugeArt && (simple = !simple)"
)
  HudWhmLilyGauge(v-if="showArt && battle.gaugeArt === 'whm-lily'" :items="items")
  .job-gauge__simple(v-else)
    template(v-for="(item, i) in items" :key="i")
      .job-gauge__timer(v-if="item.kind === 'timer'")
        .job-gauge__timer-fill(:style="{ width: `${item.progress * 100}%` }")
      .job-gauge__pips(v-else :class="`job-gauge__pips--${item.shape}`")
        .job-gauge__pip(v-for="n in item.max" :key="n" :style="frame(item.shape)")
          .job-gauge__pip-fill(v-if="n <= item.count" :style="fill(item.shape, item.color)")
</template>

<style lang="scss" scoped>
.job-gauge {
  position: absolute;
  bottom: 96px;
  left: calc(50% + 228px);
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
}

.job-gauge__simple {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

// Bar: dark well with a bronze rim, blue fill (as in game)
.job-gauge__timer {
  width: 160px;
  height: 8px;
  margin: 1px 0;
  border-radius: 4px;
  background: #2b2018;
  box-shadow: inset 0 0 0 1px #b38d4e, 0 0 0 1px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.job-gauge__timer-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(180deg, #a9e2ff, #3f86d2);
}

.job-gauge__pips {
  display: flex;
  padding-left: 6px;
}

.job-gauge__pip {
  position: relative;
  width: 22px;
  height: 22px;
  background: center / contain no-repeat;
}

// Pips sit edge to edge (the art has padding); chevrons overlap into a run
.job-gauge__pips--diamond .job-gauge__pip + .job-gauge__pip {
  margin-left: -5px;
}

.job-gauge__pips--chevron .job-gauge__pip + .job-gauge__pip {
  margin-left: -8px;
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
