<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const props = defineProps<{ mode: 'player' | 'boss' }>()
const battle = useBattleStore()
const cast = computed(() =>
  props.mode === 'player' ? battle.playerCast : battle.bossCast
)
const pct = computed(() =>
  cast.value && cast.value.total > 0
    ? Math.min(100, (cast.value.elapsed / cast.value.total) * 100)
    : 0
)
</script>

<template lang="pug">
.cast-bar(v-if="cast" :class="mode")
  .cast-bar-fill(:style="{ width: pct + '%' }")
  span.cast-bar-name {{ cast.name }}
</template>

<style lang="scss" scoped>
.cast-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 250px;
  height: 18px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;

  &.player {
    bottom: 120px;
  }

  &.boss {
    top: 50px;
  }
}

.cast-bar-fill {
  height: 100%;
  transition: width 0.05s;

  .cast-bar.player & {
    background: linear-gradient(90deg, #4a9eff, #82c0ff);
  }

  .cast-bar.boss & {
    background: linear-gradient(90deg, #cc5533, #ff7744);
  }
}

.cast-bar-name {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 11px;
  text-shadow: 1px 1px 2px #000;
}
</style>
