<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface EncounterEntry {
  label: string
  description: string
  file: string
  difficulty?: string
  duration?: string
  dpsCheck?: number
  hidden?: boolean
}

const DIFFICULTY_META: Record<
  string,
  { short: string; label: string; color: string }
> = {
  tutorial: { short: '教学', label: '教学关卡', color: '#6a8' },
  normal: { short: '歼灭', label: '歼灭战', color: '#8ab' },
  extreme: { short: '歼殛', label: '歼殛战', color: '#c86' },
  savage: { short: '零式', label: '零式', color: '#c66' },
  ultimate: { short: '绝境', label: '绝境战', color: '#d4a' },
}

const isDev = import.meta.env.DEV
const base = import.meta.env.BASE_URL
const selectedIdx = ref(0)
const levels = ref<EncounterEntry[]>([])

onMounted(async () => {
  const res = await fetch(`${base}encounters/index.json`)
  levels.value = await res.json()
})

const visible = computed(() =>
  isDev ? levels.value : levels.value.filter((lv) => !lv.hidden)
)
const selected = computed(() => visible.value[selectedIdx.value])
const encId = computed(() => selected.value?.file.replace(/\.yaml$/, ''))
const diffMeta = computed(() =>
  selected.value
    ? (DIFFICULTY_META[selected.value.difficulty ?? 'normal'] ??
      DIFFICULTY_META.normal)
    : null
)
const showPractice = computed(
  () =>
    selected.value &&
    selected.value.difficulty !== 'tutorial' &&
    selected.value.difficulty !== 'ultimate'
)
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .encounter-layout
    .encounter-list
      button.encounter-item(
        v-for="(lv, i) in visible"
        :key="lv.file"
        :class="{ selected: i === selectedIdx }"
        @click="selectedIdx = i"
      )
        MenuDifficultyBadge(:difficulty="lv.difficulty")
        span.encounter-item-label {{ lv.label }}
        span.encounter-hidden-marker(v-if="lv.hidden") [HIDDEN]
    .encounter-detail
      template(v-if="selected")
        .encounter-detail-header
          MenuDifficultyBadge(:difficulty="selected.difficulty")
          span.encounter-detail-title {{ selected.label }}
        .encounter-info-grid
          div
            span.grid-label 难度：
            | {{ diffMeta?.label }}
          div(v-if="selected.duration")
            span.grid-label 耗时：
            | {{ selected.duration }}
          div(v-if="selected.dpsCheck")
            span.grid-label DPS 门槛：
            | {{ selected.dpsCheck }}
        .encounter-description
          | {{ selected.description }}
        .encounter-actions
          RouterLink.btn-practice(
            v-if="showPractice"
            :to="`/encounter/${encId}?practice`"
          ) 练习模式
          RouterLink.btn-start(:to="`/encounter/${encId}`") ▶ &nbsp;进入副本
      .encounter-empty(v-else) 选择一个副本查看详情
</template>

<style lang="scss" scoped>
.encounter-layout {
  display: flex;
  gap: 16px;
  max-width: 700px;
  width: 90%;
  height: 60vh;
}
.encounter-list {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.encounter-item {
  padding: 8px 12px;
  font-size: 13px;
  color: #888;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;

  &.selected {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
}
.encounter-item-label {
  flex: 1;
}
.encounter-hidden-marker {
  font-size: 9px;
  color: #a86;
}
.encounter-detail {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.encounter-detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.encounter-detail-title {
  font-size: 16px;
  color: #ddd;
  font-weight: bold;
}
.encounter-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 12px;
  color: #999;
  line-height: 1.8;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}
.grid-label {
  color: #666;
}
.encounter-description {
  flex: 1;
  overflow-y: auto;
  font-size: 12px;
  color: #aaa;
  line-height: 2;
  white-space: pre-line;
}
.encounter-actions {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
}
.btn-practice {
  padding: 8px 16px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #999;
  text-decoration: none;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }
}
.btn-start {
  padding: 8px 24px;
  font-size: 13px;
  background: rgba(184, 160, 106, 0.15);
  border: 1px solid rgba(184, 160, 106, 0.4);
  border-radius: 4px;
  color: #b8a06a;
  text-decoration: none;
  transition: all 0.15s;

  &:hover {
    background: rgba(184, 160, 106, 0.3);
  }
}
.encounter-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 13px;
}
</style>
