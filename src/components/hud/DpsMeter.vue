<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()

function formatDamage(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
</script>

<template lang="pug">
.dps-meter(v-if="battle.dpsMeter.totalDamage > 0")
  .dps-meter__header DPS Meter
  .dps-meter__row(v-for="s in battle.dpsMeter.skills" :key="s.name")
    .dps-meter__bar(:style="{ width: (s.percent * 100).toFixed(1) + '%' }")
    .dps-meter__row-inner
      span.dps-meter__name {{ s.name }}
      span.dps-meter__value.tabular-nums
        | {{ formatDamage(s.total) }}
        span.dps-meter__percent {{ (s.percent * 100).toFixed(0) }}%
  .dps-meter__footer
    span Total {{ formatDamage(battle.dpsMeter.totalDamage) }}
    span.tabular-nums {{ formatDamage(Math.floor(battle.dpsMeter.dps)) }} DPS
</template>

<style lang="scss" scoped>
.dps-meter {
  margin-top: 6px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.dps-meter__header {
  padding: 4px 10px;
  color: #aaa;
  font-size: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dps-meter__row {
  position: relative;
  overflow: hidden;
  padding: 2px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.dps-meter__bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: rgba(255, 100, 60, 0.15);
}

.dps-meter__row-inner {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1;
  font-size: 10px;
}

.dps-meter__name {
  color: #ccc;
}

.dps-meter__value {
  color: #888;
}

.dps-meter__percent {
  color: #666;
  margin-left: 4px;
}

.dps-meter__footer {
  padding: 4px 10px;
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #999;
}
</style>
