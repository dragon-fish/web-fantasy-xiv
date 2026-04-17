<script setup lang="ts">
import { ref, watch } from 'vue'
import { useBattleStore } from '@/stores/battle'

interface AnnounceItem {
  id: number
  text: string
}

const battle = useBattleStore()
const items = ref<AnnounceItem[]>([])
let announceCounter = 0

watch(
  () => battle.announceText,
  (text) => {
    if (!text) return
    const id = ++announceCounter
    items.value = [...items.value, { id, text }]
    setTimeout(() => {
      items.value = items.value.filter((item) => item.id !== id)
    }, 2000)
  }
)
</script>

<template lang="pug">
.combat-announce
  .combat-announce__text(v-for="item in items" :key="item.id") {{ item.text }}
</template>

<style lang="scss" scoped>
.combat-announce {
  position: absolute;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 60;
}

.combat-announce__text {
  font-size: 28px;
  font-weight: 300;
  letter-spacing: 6px;
  color: #e0e0e0;
  text-shadow: 0 0 12px rgba(0, 0, 0, 0.8);
  animation: announceIn 2s ease-out forwards;
}

@keyframes announceIn {
  0% {
    opacity: 1;
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
</style>
