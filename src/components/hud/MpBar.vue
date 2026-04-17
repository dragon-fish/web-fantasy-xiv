<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()

const show = computed(() => battle.playerMp.max > 0)
const pct = computed(() =>
  battle.playerMp.max > 0
    ? (battle.playerMp.current / battle.playerMp.max) * 100
    : 0
)
</script>

<template lang="pug">
.mp-bar(v-if="show")
  .mp-bar-fill(:style="{ width: pct + '%' }")
  span.mp-bar-text
    | {{ Math.floor(battle.playerMp.current) }} / {{ battle.playerMp.max }}
</template>

<style lang="scss" scoped>
.mp-bar {
  position: absolute;
  bottom: 108px;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 16px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;
}

.mp-bar-fill {
  height: 100%;
  background: #4488cc;
  transition: width 0.1s;
}

.mp-bar-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  z-index: 1;
  text-shadow: 1px 1px 2px #000;
}
</style>
