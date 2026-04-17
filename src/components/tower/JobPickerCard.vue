<!-- src/components/tower/JobPickerCard.vue -->
<script setup lang="ts">
import type { PlayerJob } from '@/jobs'
import { JOB_CATEGORY_LABELS, JobCategory } from '@/jobs'
import { computed } from 'vue'

interface Props {
  job: PlayerJob
}
const props = defineProps<Props>()

const emit = defineEmits<{
  pick: [job: PlayerJob]
}>()

const categoryLabel = computed(() => JOB_CATEGORY_LABELS[props.job.category])
const firstThreeSkills = computed(() =>
  props.job.skillBar.slice(0, 3).map(e => e.skill.name),
)
const portraitFallback = computed(() => props.job.name.charAt(0))

const accentColor = computed(() => {
  // Subtle category accent
  switch (props.job.category) {
    case JobCategory.Melee:
    case JobCategory.Tank:
      return '#c65a4a' // red-ish
    case JobCategory.PhysRanged:
    case JobCategory.Ranged:
      return '#5aa65a' // green-ish
    case JobCategory.Caster:
    case JobCategory.Healer:
      return '#5a82c6' // blue-ish
    default:
      return '#8a8a8a'
  }
})
</script>

<template lang="pug">
button.job-card(
  type="button"
  :style="{ '--accent': accentColor }"
  @click="emit('pick', props.job)"
)
  //- 1:1 portrait placeholder; TODO: when PlayerJob.portrait is added, render <img v-if="job.portrait" :src="job.portrait">
  .portrait
    .portrait-frame
      span.portrait-fallback {{ portraitFallback }}
    .portrait-category-badge {{ categoryLabel }}
  .job-body
    .job-name {{ job.name }}
    .job-description {{ job.description }}
    .divider
    .job-skill-preview
      .preview-title 起始技能
      .skill-chips
        span.skill-chip(v-for="name in firstThreeSkills" :key="name") {{ name }}
</template>

<style lang="scss" scoped>
.job-card {
  --accent: #8a8a8a;

  display: flex;
  flex-direction: column;
  padding: 0;
  width: 260px;
  min-width: 240px;
  background: linear-gradient(
    to bottom,
    rgba(50, 50, 55, 0.55),
    rgba(20, 20, 22, 0.75)
  );
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  cursor: pointer;
  text-align: left;
  color: inherit;
  font-family: inherit;
  overflow: hidden;
  position: relative;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  // Accent stripe on top
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--accent) 40%,
      var(--accent) 60%,
      transparent
    );
    opacity: 0.8;
  }

  &:hover {
    transform: translateY(-3px);
    border-color: rgba(255, 255, 255, 0.35);
    box-shadow:
      0 6px 18px rgba(0, 0, 0, 0.5),
      0 0 0 1px var(--accent),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }
}

.portrait {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.08),
    rgba(0, 0, 0, 0.35)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  .portrait-frame {
    position: absolute;
    inset: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(
      ellipse at center,
      rgba(var(--accent-rgb, 255 255 255), 0.08),
      rgba(0, 0, 0, 0.25)
    );
  }

  .portrait-fallback {
    font-size: 72px;
    color: rgba(255, 255, 255, 0.4);
    font-weight: bold;
    font-family: serif;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  }

  .portrait-category-badge {
    position: absolute;
    bottom: 10px;
    left: 10px;
    padding: 3px 10px;
    font-size: 10px;
    color: #fff;
    background: var(--accent);
    border-radius: 2px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    opacity: 0.92;
  }
}

.job-body {
  padding: 14px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-name {
  font-size: 17px;
  font-weight: bold;
  color: #e8e8e8;
  letter-spacing: 1px;
}

.job-description {
  font-size: 11px;
  line-height: 1.55;
  color: #a5a5a5;
  min-height: 48px; // Reserve uniform height across cards
}

.divider {
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.15),
    transparent
  );
}

.job-skill-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .preview-title {
    font-size: 10px;
    color: #666;
    letter-spacing: 1px;
  }

  .skill-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .skill-chip {
    padding: 3px 8px;
    font-size: 10px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    color: #b8b8b8;
  }
}
</style>
