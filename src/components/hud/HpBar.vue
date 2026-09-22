<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'

const props = defineProps<{ mode: 'player' | 'boss' }>()
const battle = useBattleStore()
const hp = computed(() => (props.mode === 'player' ? battle.playerHp : battle.bossHp))
const pct = computed(() => (hp.value.max > 0 ? (hp.value.current / hp.value.max) * 100 : 0))
const feedback = computed(() => hp.value.feedback)
const trailEnd = computed(() => (feedback.value?.damageEnd ?? pct.value / 100) * 100)
const healStart = computed(() => (feedback.value?.healStart ?? pct.value / 100) * 100)
const edgeStyle = computed(() => ({ left: pct.value + '%', opacity: feedback.value?.pulse ?? 0 }))
const rawShieldPct = computed(() =>
  hp.value.shield && hp.value.max > 0 ? (hp.value.shield / hp.value.max) * 100 : 0
)
// Cap combined HP + shield at 100%
const shieldPct = computed(() => Math.min(rawShieldPct.value, 100 - pct.value))
const shieldRaw = computed(() => hp.value.shield ?? 0)
</script>

<template lang="pug">
.hp-bar(:class="mode" :style="{ '--shake': ((feedback?.shake ?? 0) * 1.7) + 'px' }")
  .hp-bar-trail(:style="{ left: pct + '%', width: Math.max(0, trailEnd - pct) + '%' }")
  .hp-bar-fill(:style="{ width: pct + '%' }")
  .hp-bar-heal(:style="{ left: healStart + '%', width: Math.max(0, pct - healStart) + '%' }")
  .hp-bar-edge(:class="{ healing: feedback?.kind === 'heal' }" :style="edgeStyle")
  .hp-bar-shield(v-if="shieldPct > 0" :style="{ left: pct + '%', width: shieldPct + '%' }")
  span.hp-bar-text
    template(v-if="shieldRaw > 0") {{ Math.floor(hp.current) }}+{{ shieldRaw }} / {{ hp.max }}
    template(v-else) {{ Math.floor(hp.current) }} / {{ hp.max }}
</template>

<style lang="scss" scoped>
.hp-bar {
  position: absolute;
  left: 50%;
  transform: translateX(calc(-50% + var(--shake, 0px)));
  width: 300px;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  overflow: hidden;

  &.player {
    bottom: 80px;
    --hp-fill: #44aa44;
    --hp-trail: #244e36;
    --hp-hit: #e8e69b;
  }
  &.boss {
    top: 20px;
    --hp-fill: #cc3333;
    --hp-trail: #682c2c;
    --hp-hit: #ffb477;
  }
}

.hp-bar-fill {
  height: 100%;
  background: var(--hp-fill);
}
.hp-bar-trail, .hp-bar-heal { position: absolute; top: 0; height: 100%; pointer-events: none; }
.hp-bar-trail { background: var(--hp-trail); transition: width 60ms linear, left 60ms linear; }
.hp-bar-heal { background: #98ffb0; transition: width 60ms linear, left 60ms linear; }
.hp-bar-edge {
  position: absolute; top: 0; bottom: 0; width: 3px;
  transform: translateX(-50%);
  background: var(--hp-hit);
  box-shadow: 0 0 8px 3px var(--hp-hit);
  pointer-events: none;
  &.healing { background: #beffd0; box-shadow: 0 0 8px 3px #79efa0; }
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
