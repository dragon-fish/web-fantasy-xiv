<!-- src/components/tower/JobPicker.vue -->
<script setup lang="ts">
import type { PlayerJob } from '@/jobs'
import { getBaseJobs } from '@/jobs'
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits<{
  pick: [job: PlayerJob]
  back: []
}>()

const baseJobs = getBaseJobs()

const scrollContainer = ref<HTMLElement | null>(null)
const canScrollRight = ref(false)
const canScrollLeft = ref(false)

function updateScrollState() {
  const el = scrollContainer.value
  if (!el) return
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
  canScrollLeft.value = el.scrollLeft > 2
}

onMounted(() => {
  updateScrollState()
  window.addEventListener('resize', updateScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollState)
})
</script>

<template lang="pug">
.job-picker
  .picker-title 选择起始职业
  .picker-subtitle 挑选一个基础职业开始下潜。战斗中可通过拾取武器切换到进阶职业。
  .picker-cards-wrapper
    .picker-scroll-hint.left(v-if="canScrollLeft") ◀
    .picker-cards(ref="scrollContainer" @scroll="updateScrollState")
      TowerJobPickerCard(
        v-for="job in baseJobs"
        :key="job.id"
        :job="job"
        @pick="(j) => emit('pick', j)"
      )
    .picker-scroll-hint.right(v-if="canScrollRight") ▶
  .picker-footer
    button.tower-btn.tertiary(type="button" @click="emit('back')") 返回
</template>

<style lang="scss" scoped>
.job-picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  max-width: 900px;
  width: 95%;
}
.picker-title {
  font-size: 18px;
  color: #ddd;
  font-weight: bold;
}
.picker-subtitle {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  text-align: center;
}

.picker-cards-wrapper {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.picker-cards {
  display: flex;
  gap: 14px;
  padding: 8px 16px;
  overflow-x: auto;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  width: 100%;

  // Hide scrollbar for cleaner look (still scrollable)
  scrollbar-width: thin;
  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 3px;
  }

  & > * {
    scroll-snap-align: center;
    flex-shrink: 0;
  }
}

.picker-scroll-hint {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 18px;
  color: rgba(255, 255, 255, 0.55);
  z-index: 2;
  animation: hint-pulse 1.6s ease-in-out infinite;

  &.left {
    left: 0;
    background: linear-gradient(to right, rgba(20, 20, 20, 0.85), transparent);
  }
  &.right {
    right: 0;
    background: linear-gradient(to left, rgba(20, 20, 20, 0.85), transparent);
  }
}

@keyframes hint-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

.picker-footer {
  margin-top: 16px;
}
.tower-btn {
  padding: 8px 20px;
  font-size: 12px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  &.tertiary { background: rgba(255, 255, 255, 0.02); }
}
</style>
