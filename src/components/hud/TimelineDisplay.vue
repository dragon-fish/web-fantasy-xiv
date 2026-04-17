<script setup lang="ts">
import { computed } from 'vue'
import { useLocalStorage } from '@vueuse/core'
import { useBattleStore } from '@/stores/battle'
import type { TimelineEntry } from '@/timeline/types'

const WINDOW_MS = 30000

const battle = useBattleStore()
const collapsed = useLocalStorage('xiv-timeline-collapsed', false)

function toggle() {
  collapsed.value = !collapsed.value
}

const headerLabel = computed(() => {
  const phase = battle.currentPhaseInfo
  return phase?.showLabel ? `Timeline · ${phase.label}` : 'Timeline'
})

interface RowStyle {
  barWidth: string
  barColor: string
  countdownText: string
  opacity: string
}

function rowStyle(entry: TimelineEntry): RowStyle {
  let barWidth = '0%'
  let barColor = 'rgba(100, 160, 255, 0.15)'
  let countdownText = ''
  let opacity = '1'

  if (entry.state === 'upcoming') {
    const pct = Math.max(0, 1 - entry.timeUntil / WINDOW_MS) * 100
    barWidth = `${pct}%`
    countdownText = (entry.timeUntil / 1000).toFixed(1)
  } else if (entry.state === 'casting') {
    const castElapsed = -entry.timeUntil
    const remaining = 1 - castElapsed / entry.castTime
    barWidth = `${remaining * 100}%`
    barColor = 'rgba(255, 140, 60, 0.25)'
    countdownText = ((entry.castTime - castElapsed) / 1000).toFixed(1)
  } else if (entry.state === 'flash') {
    barWidth = '100%'
    barColor = 'rgba(255, 200, 80, 0.3)'
    opacity = Math.sin(entry.flashElapsed * 0.01) > 0 ? '1' : '0.5'
  }

  return { barWidth, barColor, countdownText, opacity }
}
</script>

<template lang="pug">
.timeline-panel
  .timeline-header(:class="{ collapsed }" @click="toggle")
    span {{ headerLabel }}
    span {{ collapsed ? '\u25B8' : '\u25BE' }}
  .timeline-body(v-if="!collapsed")
    .timeline-empty(v-if="battle.timelineEntries.length === 0") 没有即将到来的威胁
    template(v-else)
      .timeline-row(
        v-for="entry in battle.timelineEntries"
        :key="entry.key"
        :style="{ opacity: rowStyle(entry).opacity }"
      )
        .timeline-row-bar(:style="{ width: rowStyle(entry).barWidth, background: rowStyle(entry).barColor }")
        .timeline-row-content
          span.timeline-row-name {{ entry.skillName }}
          span.timeline-row-countdown {{ rowStyle(entry).countdownText }}
</template>

<style lang="scss" scoped>
.timeline-panel {
  position: absolute;
  top: 60px;
  left: 12px;
  width: 220px;
  z-index: 50;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.75rem;
  pointer-events: auto;
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 10px;
  color: #aaa;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px 4px 0 0;
  border-bottom: none;
  cursor: pointer;
  user-select: none;

  &.collapsed {
    border-radius: 4px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
}

.timeline-body {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-top: none;
  border-radius: 0 0 4px 4px;
  overflow: hidden;
}

.timeline-empty {
  padding: 6px 8px;
  color: #666;
  text-align: center;
}

.timeline-row {
  position: relative;
  overflow: hidden;
  padding: 3px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.timeline-row-bar {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
}

.timeline-row-content {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1;
}

.timeline-row-name {
  color: #ccc;
}

.timeline-row-countdown {
  color: #888;
  font-variant-numeric: tabular-nums;
}
</style>
