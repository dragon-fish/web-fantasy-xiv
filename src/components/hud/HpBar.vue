<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const props = defineProps<{ mode: 'player' | 'boss' }>()
const battle = useBattleStore()
const hp = computed(() => (props.mode === 'player' ? battle.playerHp : battle.bossHp))
const pct = computed(() => (hp.value.max > 0 ? (hp.value.current / hp.value.max) * 100 : 0))
const rawShieldPct = computed(() =>
  hp.value.shield && hp.value.max > 0 ? (hp.value.shield / hp.value.max) * 100 : 0
)
// Cap combined HP + shield at 100%
const shieldPct = computed(() => Math.min(rawShieldPct.value, 100 - pct.value))
const shieldRaw = computed(() => hp.value.shield ?? 0)
</script>

<template lang="pug">
.hp-bar(:class="mode")
  .hp-bar-fill(:style="{ width: pct + '%' }")
  .hp-bar-shield(v-if="shieldPct > 0" :style="{ left: pct + '%', width: shieldPct + '%' }")
  span.hp-bar-text
    template(v-if="shieldRaw > 0") {{ Math.floor(hp.current) }}+{{ shieldRaw }} / {{ hp.max }}
    template(v-else) {{ Math.floor(hp.current) }} / {{ hp.max }}
</template>

<style lang="scss" scoped>
.hp-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 300px;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;

  &.player {
    bottom: 80px;
  }
  &.boss {
    top: 20px;
  }
}

.hp-bar-fill {
  height: 100%;
  transition: width 0.1s;

  .hp-bar.player & {
    background: #44aa44;
  }
  .hp-bar.boss & {
    background: #cc3333;
  }
}

.hp-bar-shield {
  position: absolute;
  top: 0;
  height: 100%;
  background: #ddcc44;
  transition: width 0.1s, left 0.1s;
}

.hp-bar-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  z-index: 1;
  text-shadow: 1px 1px 2px #000;
}
</style>
