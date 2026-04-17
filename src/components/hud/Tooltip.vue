<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useTooltip } from '@/composables/use-tooltip'

const { state } = useTooltip()
const tooltipEl = useTemplateRef<HTMLDivElement>('tooltip')
const measuredHeight = ref(0)

watch(
  state,
  async (s) => {
    if (!s) {
      measuredHeight.value = 0
      return
    }
    await nextTick()
    if (tooltipEl.value) {
      measuredHeight.value = tooltipEl.value.offsetHeight
    }
  },
  { immediate: true, flush: 'post' },
)

const style = computed(() => {
  if (!state.value) return {}
  const { x, y } = state.value
  const margin = 12
  const h = measuredHeight.value || 100
  const fitsAbove = y - margin - h >= 4
  const top = fitsAbove ? y - margin - h : y + margin
  return {
    left: x + 'px',
    top: top + 'px',
  }
})
</script>

<template lang="pug">
.tooltip(v-if="state" ref="tooltip" :style="style")
  div(v-html="state.html")
</template>

<style lang="scss" scoped>
.tooltip {
  position: fixed;
  z-index: 200;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(30, 28, 24, 0.97) 0%,
    rgba(18, 16, 14, 0.97) 100%
  );
  border: 2px solid #8b7440;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 12px;
  color: #ccc;
  line-height: 1.6;
  max-width: 280px;
  box-shadow:
    0 0 1px rgba(184, 160, 106, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.6);
}
</style>
