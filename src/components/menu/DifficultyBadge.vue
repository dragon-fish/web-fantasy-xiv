<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ difficulty?: string }>()

const DIFFICULTY_META: Record<string, { short: string; label: string; color: string }> = {
  tutorial: { short: '教学', label: '教学关卡', color: '#6a8' },
  normal: { short: '歼灭', label: '歼灭战', color: '#8ab' },
  extreme: { short: '歼殛', label: '歼殛战', color: '#c86' },
  savage: { short: '零式', label: '零式', color: '#c66' },
  ultimate: { short: '绝境', label: '绝境战', color: '#d4a' },
}

const meta = computed(
  () => DIFFICULTY_META[props.difficulty ?? 'normal'] ?? DIFFICULTY_META.normal
)
</script>

<template lang="pug">
span.badge(:style="{ color: meta.color, borderColor: meta.color }")
  | {{ meta.short }}
</template>

<style lang="scss" scoped>
.badge {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: bold;
  border: 1px solid;
  border-radius: 3px;
  line-height: 16px;
}
</style>
