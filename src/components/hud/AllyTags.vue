<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const pct = (hp: number, max: number) => `${Math.max(0, Math.min(1, hp / Math.max(1, max))) * 100}%`
</script>

<template lang="pug">
.ally-tag(
  v-for="t in battle.allyTags"
  :key="t.id"
  :class="{ 'is-down': !t.alive }"
  :style="{ left: `${t.x}px`, top: `${t.y}px` }"
)
  .ally-tag__name {{ t.name }}
  //- HP only while it says something: hurt, or down (an empty bar stays up)
  .ally-tag__bar(v-if="!t.alive || t.hp < t.maxHp")
    .ally-tag__fill(:style="{ width: t.alive ? pct(t.hp, t.maxHp) : '0%' }")
</template>

<style lang="scss" scoped>
.ally-tag {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.ally-tag__name {
  color: #bfe9ff;
  font-size: 11px;
  text-shadow: 0 0 2px #000, 0 0 4px #000;
  white-space: nowrap;
}

.ally-tag__bar {
  width: 46px;
  height: 4px;
  margin-top: 1px;
  background: rgba(20, 14, 10, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.6);
  border-radius: 2px;
  overflow: hidden;
}

.ally-tag__fill {
  height: 100%;
  background: #6fe08a;
}

.is-down .ally-tag__name {
  color: #999;
}
</style>
