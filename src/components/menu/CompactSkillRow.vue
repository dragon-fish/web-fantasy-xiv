<script setup lang="ts">
import { computed } from 'vue'
import type { SkillDef, BuffDef } from '@/core/types'
import { buildSkillTooltip } from '@/components/hud/tooltip-builders'

const props = defineProps<{
  keyLabel: string
  skill: SkillDef
  buffDefs: Map<string, BuffDef>
  gcdDuration?: number
}>()

const html = computed(() =>
  buildSkillTooltip(
    props.skill,
    props.buffDefs.size > 0 ? props.buffDefs : undefined,
    { gcdDuration: props.gcdDuration ?? 2500, haste: 0 }
  )
)
</script>

<template lang="pug">
.skill-row
  .skill-icon
    img(v-if="skill.icon" :src="skill.icon" :key="skill.icon")
    span.skill-icon-fallback(v-else) {{ skill.name.slice(0, 3) }}
    span.skill-key {{ keyLabel }}
  .skill-tooltip(v-html="html")
</template>

<style lang="scss" scoped>
.skill-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.skill-icon {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
}
.skill-icon-fallback {
  font-size: 10px;
  color: #888;
}
.skill-key {
  position: absolute;
  top: 1px;
  left: 3px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-shadow:
    0 0 2px #000,
    0 0 2px #000;
  line-height: 1;
}
.skill-tooltip {
  font-size: 11px;
  line-height: 1.5;
  color: #bbb;
  flex: 1;
}
</style>
