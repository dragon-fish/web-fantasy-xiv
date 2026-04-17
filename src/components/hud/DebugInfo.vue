<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { useDebugStore } from '@/stores/debug'

const battle = useBattleStore()
const debug = useDebugStore()

const isDev = import.meta.env.DEV

const timeText = computed(() => {
  const elapsed = battle.combatElapsed
  if (elapsed === null) return '--:--'
  const sec = elapsed / 1000
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
})

const timeIsNull = computed(() => battle.combatElapsed === null)
</script>

<template lang="pug">
.debug-info(v-if="isDev")
  div
    span.debug-info__label FPS&nbsp;
    span {{ debug.fps }}
  div
    span.debug-info__label POS&nbsp;
    span {{ battle.debugPlayerPos.x.toFixed(1) }}, {{ battle.debugPlayerPos.y.toFixed(1) }}
  div
    span.debug-info__label TIME&nbsp;
    span(:class="{ 'debug-info__time--null': timeIsNull }") {{ timeText }}
</template>

<style lang="scss" scoped>
.debug-info {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.5);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  color: #999;
  line-height: 1.6;
  pointer-events: none;
  min-width: 160px;
}

.debug-info__label {
  color: #666;
}

.debug-info__time--null {
  color: #666;
}
</style>
