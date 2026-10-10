<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'

const props = defineProps<{ bus: EventBus }>()
const active = ref(false)

/** A death that will be revived flashes harder and clears once the player stands up */
const reviving = ref(false)

function onDied() {
  active.value = true
}
function onEnded() {
  active.value = false
  reviving.value = false
}
// Raises also stand NPC allies up through these events: only the player's own count here
function onReviving({ entity }: { entity: Entity }) {
  if (!entity.npc) reviving.value = true
}
function onRevived({ entity }: { entity: Entity }) {
  if (entity.npc) return
  active.value = false
  reviving.value = false
}

onMounted(() => {
  props.bus.on('player:died', onDied)
  props.bus.on('combat:ended', onEnded)
  props.bus.on('player:reviving', onReviving)
  props.bus.on('player:revived', onRevived)
})
onUnmounted(() => {
  props.bus.off('player:died', onDied)
  props.bus.off('combat:ended', onEnded)
  props.bus.off('player:reviving', onReviving)
  props.bus.off('player:revived', onRevived)
})
</script>

<template lang="pug">
Transition(name="vignette")
  .death-vignette(v-if="active && !reviving")
Transition(name="vignette")
  .death-vignette.death-vignette--reviving(v-if="reviving")
</template>

<style lang="scss" scoped>
.death-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 80px rgba(255, 0, 0, 0.45);
  animation: death-pulse 1.2s ease-in-out infinite alternate;
  z-index: 500;
}

.death-vignette--reviving {
  animation: revive-flash 0.45s ease-in-out infinite alternate;
}

@keyframes revive-flash {
  from {
    box-shadow: inset 0 0 50px rgba(255, 20, 20, 0.35);
  }
  to {
    box-shadow: inset 0 0 160px rgba(255, 20, 20, 0.8);
  }
}

@keyframes death-pulse {
  from {
    box-shadow: inset 0 0 60px rgba(255, 0, 0, 0.3);
  }
  to {
    box-shadow: inset 0 0 120px rgba(255, 0, 0, 0.6);
  }
}

.vignette-enter-active,
.vignette-leave-active {
  transition: opacity 200ms ease;
}

.vignette-enter-from,
.vignette-leave-to {
  opacity: 0;
}
</style>
