<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const R = 54
const C = 2 * Math.PI * R

const prompt = computed(() => battle.qte)
/** Fill fraction: reaches 1 exactly when the strike lands */
const progress = computed(() => (prompt.value ? Math.min(1, prompt.value.elapsed / prompt.value.windup) : 0))
/** Arc length (in circumference units) of a ± window around the strike moment */
const windowArc = (ms: number) => (prompt.value ? Math.min(0.5, ms / prompt.value.windup) * C : 0)
/** Period exactly one circumference so the arc wraps across 12 o'clock (both sides of the strike) */
const dash = (ms: number) => `${windowArc(ms) * 2} ${C - windowArc(ms) * 2}`
const gradeClass = computed(() => (prompt.value?.grade ?? '').replace(/[^a-z]/gi, '').toLowerCase())
</script>

<template lang="pug">
.qte(v-if="prompt")
  svg.qte__ring(viewBox="0 0 140 140")
    circle.qte__track(cx="70" cy="70" :r="R")
    //- Judgement windows, centred on the top (= strike moment); drawn as arcs either side of 12 o'clock
    circle.qte__window.qte__window--good(cx="70" cy="70" :r="R"
      :stroke-dasharray="dash(prompt.windows.good)"
      :stroke-dashoffset="windowArc(prompt.windows.good)")
    circle.qte__window.qte__window--perfect(cx="70" cy="70" :r="R"
      :stroke-dasharray="dash(prompt.windows.perfect)"
      :stroke-dashoffset="windowArc(prompt.windows.perfect)")
    circle.qte__window.qte__window--just(cx="70" cy="70" :r="R"
      :stroke-dasharray="dash(prompt.windows.just)"
      :stroke-dashoffset="windowArc(prompt.windows.just)")
    circle.qte__fill(cx="70" cy="70" :r="R"
      :stroke-dasharray="`${progress * C} ${C}`")
  .qte__center
    template(v-if="prompt.grade")
      .qte__grade(:class="`qte__grade--${gradeClass}`") {{ prompt.grade }}
    template(v-else)
      .qte__key SPACE
      .qte__hint 光圈转满时按下
  .qte__title(v-if="!prompt.grade") 拼刀！
</template>

<style lang="scss" scoped>
.qte {
  position: absolute;
  top: 58%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 150px;
  height: 150px;
  pointer-events: none;
  z-index: 70;
}

.qte__ring {
  width: 100%;
  height: 100%;
  // Start the stroke at 12 o'clock and run clockwise
  transform: rotate(-90deg);

  circle { fill: none; }
}

.qte__track { stroke: rgba(0, 0, 0, 0.55); stroke-width: 12; }
.qte__window { stroke-width: 12; }
.qte__window--good { stroke: rgba(120, 200, 255, 0.55); }
.qte__window--perfect { stroke: rgba(255, 230, 140, 0.8); }
.qte__window--just { stroke: #fff6d6; }
.qte__fill {
  stroke: #ffb347;
  stroke-width: 6;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px rgba(255, 170, 60, 0.9));
}

.qte__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.qte__key {
  padding: 3px 10px;
  border: 2px solid #ffe2a8;
  border-radius: 6px;
  font: 700 14px/1 monospace;
  letter-spacing: 2px;
  color: #ffe2a8;
  background: rgba(0, 0, 0, 0.55);
}

.qte__hint {
  font-size: 11px;
  color: #ddd;
  text-shadow: 0 0 6px #000;
}

.qte__title {
  position: absolute;
  bottom: -26px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 6px;
  color: #ffd27a;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
}

.qte__grade {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 2px;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.9);
  animation: grade-pop 0.25s ease-out;
}
.qte__grade--just { color: #fff2b8; }
.qte__grade--perfect { color: #ffd27a; }
.qte__grade--good { color: #9fd8ff; }
.qte__grade--early,
.qte__grade--late { color: #ff6b5b; }

@keyframes grade-pop {
  0% { transform: scale(1.6); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
</style>
