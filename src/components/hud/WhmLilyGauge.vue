<script setup lang="ts">
import { computed } from 'vue'
import type { GaugeView } from '@/stores/battle'

// White Mage "lily stalk" gauge, assembled from the game's JobHudWHM parts. Positions are in
// source-texture pixels (vine top-left = origin), measured against an in-game screenshot.
const props = defineProps<{ items: GaugeView[] }>()

const BASE = `${import.meta.env.BASE_URL}ui/xiv/jobhud-whm`
const SCALE = 0.42
/** Lily slots in bloom order: center of the bell, center of its calyx */
const LILY_SLOTS = [
  { lily: [149.5, 97.5], calyx: [182.7, 61.4] },
  { lily: [162.5, 176.9], calyx: [196.4, 143] },
  { lily: [83, 231], calyx: [115.5, 195] },
]
const BLOOD_CENTER = [279.4, 293.9]
/** Blood lily art per stack count: petal → bigger petal → full bloom */
const BLOOD_PARTS = ['blood-1', 'blood-2', 'blood-3']
const SIZES: Record<string, [number, number]> = {
  vine: [279, 359], lily: [84, 86], calyx: [38, 37],
  'blood-1': [31, 35], 'blood-2': [58, 60], 'blood-3': [105, 96], 'blood-glow': [115, 107],
}

const find = (kind: string, buffId: string) => props.items.find(i => i.kind === kind && i.buffId === buffId)
const lilies = computed(() => { const i = find('stacks', 'whm_lily'); return i?.kind === 'stacks' ? i.count : 0 })
const nextLily = computed(() => { const i = find('timer', 'whm_lily'); return i?.kind === 'timer' ? i.progress : 0 })
const blood = computed(() => { const i = find('stacks', 'whm_blood_lily'); return i?.kind === 'stacks' ? i.count : 0 })

/** Absolutely place a part by its center (source px) */
const at = (part: string, cx: number, cy: number) => {
  const [w, h] = SIZES[part]!
  return {
    backgroundImage: `url(${BASE}/${part}.png)`,
    left: `${(cx - w / 2) * SCALE}px`, top: `${(cy - h / 2) * SCALE}px`,
    width: `${w * SCALE}px`, height: `${h * SCALE}px`,
  }
}
const lilyStyle = (slot: number) => {
  const s = LILY_SLOTS[slot]!
  // Bloomed lilies are solid; the next one fades in as it grows
  const opacity = slot < lilies.value ? 1 : slot === lilies.value ? nextLily.value * 0.35 : 0
  return { ...at('lily', s.lily[0]!, s.lily[1]!), opacity }
}
</script>

<template lang="pug">
.whm-gauge(:style="{ width: `${340 * SCALE}px`, height: `${362 * SCALE}px` }")
  .whm-gauge__part(:style="at('vine', 139.5, 179.5)")
  template(v-for="(slot, i) in LILY_SLOTS" :key="i")
    .whm-gauge__part(:style="lilyStyle(i)")
    .whm-gauge__part(:style="at('calyx', slot.calyx[0], slot.calyx[1])")
  template(v-if="blood > 0")
    .whm-gauge__part.whm-gauge__glow(v-if="blood >= 3" :style="at('blood-glow', BLOOD_CENTER[0], BLOOD_CENTER[1])")
    .whm-gauge__part(:style="at(BLOOD_PARTS[Math.min(blood, 3) - 1], BLOOD_CENTER[0], BLOOD_CENTER[1])")
</template>

<style lang="scss" scoped>
.whm-gauge {
  position: relative;
}

.whm-gauge__part {
  position: absolute;
  background: center / contain no-repeat;
  transition: opacity 0.25s;
}

.whm-gauge__glow {
  animation: whm-glow 1.2s ease-in-out infinite alternate;
}

@keyframes whm-glow {
  from { opacity: 0.45; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1.08); }
}
</style>
