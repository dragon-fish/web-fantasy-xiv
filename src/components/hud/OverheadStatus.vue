<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const status = computed(() => battle.overhead)
const R = 20
const C = 2 * Math.PI * R
/** Remaining fraction of the control effect, drained clockwise from 12 o'clock */
const left = computed(() => {
  const c = status.value?.control
  return c ? Math.max(0, Math.min(1, c.remaining / c.total)) : 0
})
/** Fly text drifts up and fades over its last third */
const popupStyle = (t: number) => ({
  transform: `translateY(${-t * 28}px)`,
  opacity: t < 0.66 ? 1 : (1 - t) / 0.34,
})
</script>

<template lang="pug">
.overhead(v-if="status" :style="{ left: `${status.x}px`, top: `${status.y}px` }")
  .overhead__flash(v-if="status.flash")
    img.overhead__flash-icon(v-if="status.flash.icon" :src="status.flash.icon" :alt="status.flash.name")
    .overhead__flash-name {{ status.flash.name }}
  .overhead__control(v-if="status.control" :title="status.control.name")
    svg.overhead__ring(viewBox="0 0 48 48")
      circle.overhead__ring-track(cx="24" cy="24" :r="R")
      circle.overhead__ring-fill(cx="24" cy="24" :r="R" :stroke-dasharray="`${left * C} ${C}`")
    img.overhead__control-icon(v-if="status.control.icon" :src="status.control.icon" :alt="status.control.name")
  .overhead__popups
    .overhead__popup(
      v-for="p in status.popups"
      :key="p.key"
      :class="{ 'is-debuff': p.debuff, 'is-lost': !p.gained }"
      :style="popupStyle(p.t)"
    )
      span.overhead__popup-sign {{ p.gained ? '+' : '−' }}
      img.overhead__popup-icon(v-if="p.icon" :src="p.icon" :alt="p.name")
      span {{ p.name }}
</template>

<style lang="scss" scoped>
.overhead {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  z-index: 60;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.overhead__flash {
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: overhead-flash 0.5s ease-in-out infinite alternate;
}

.overhead__flash-icon {
  width: 36px;
  height: 48px;
  object-fit: contain;
  filter: drop-shadow(0 0 6px rgba(255, 60, 60, 0.9));
}

.overhead__flash-name {
  font-size: 13px;
  font-weight: 700;
  color: #ff6b6b;
}

@keyframes overhead-flash {
  from { opacity: 0.35; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1.08); }
}

.overhead__control {
  position: relative;
  width: 44px;
  height: 44px;
  opacity: 0.75;
}

.overhead__ring {
  position: absolute;
  inset: 0;
  // Start the stroke at 12 o'clock
  transform: rotate(-90deg);
}

.overhead__ring-track {
  fill: rgba(0, 0, 0, 0.45);
  stroke: rgba(255, 255, 255, 0.18);
  stroke-width: 4;
}

.overhead__ring-fill {
  fill: none;
  stroke: #ffb04a;
  stroke-width: 4;
  stroke-linecap: round;
}

.overhead__control-icon {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 22px;
  height: 29px;
  object-fit: contain;
  transform: translate(-50%, -50%);
}

// Beside the head, rising from the shoulder
.overhead__popups {
  position: absolute;
  left: calc(50% + 34px);
  bottom: -18px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.overhead__popup {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: #b8f5a8;

  &.is-debuff { color: #ff9a8a; }
  &.is-lost { color: #c9c9c9; }
}

.overhead__popup-sign {
  width: 10px;
  text-align: center;
}

.overhead__popup-icon {
  width: 15px;
  height: 20px;
  object-fit: contain;
}
</style>
