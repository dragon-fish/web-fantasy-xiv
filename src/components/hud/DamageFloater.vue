<script setup lang="ts">
import { watch } from 'vue'
import { useBattleStore } from '@/stores/battle'

const ANIMATION_DURATION_MS = 1000

const battle = useBattleStore()

watch(
  () => battle.damageEvents,
  (newList, oldList) => {
    const oldIds = new Set(oldList?.map((e) => e.id) ?? [])
    const added = newList.filter((e) => !oldIds.has(e.id))
    for (const ev of added) {
      setTimeout(() => {
        battle.damageEvents = battle.damageEvents.filter((x) => x.id !== ev.id)
      }, ANIMATION_DURATION_MS)
    }
  },
  { deep: false }
)
</script>

<template lang="pug">
.damage-floater
  .dmg-text(
    v-for="ev in battle.damageEvents"
    :key="ev.id"
    :class="{ heal: ev.isHeal, invulnerable: ev.isInvulnerable }"
    :style="{ left: ev.screenX + 'px', top: ev.screenY + 'px' }"
  )
    template(v-if="ev.isInvulnerable") 无效
    template(v-else-if="ev.isHeal") +{{ ev.amount }}
    template(v-else) {{ ev.amount }}
</template>

<style lang="scss" scoped>
.damage-floater {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.dmg-text {
  position: absolute;
  font-size: 18px;
  font-weight: bold;
  color: #ff4444;
  text-shadow: 1px 1px 3px #000;
  pointer-events: none;
  animation: float-up 1s ease-out forwards;

  &.heal {
    color: #4eff4e;
  }

  &.invulnerable {
    color: #999999;
  }
}

@keyframes float-up {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-60px) scale(0.8);
  }
}
</style>
