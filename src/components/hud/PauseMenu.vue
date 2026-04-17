<script setup lang="ts">
import { onKeyStroke } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useBattleStore } from '@/stores/battle'
import { getActiveScene } from '@/game/battle-runner'

const battle = useBattleStore()
const router = useRouter()
const emit = defineEmits<{ retry: []; resume: [] }>()

onKeyStroke('Escape', () => getActiveScene()?.togglePause())

function onResume() {
  getActiveScene()?.resume()
  emit('resume')
}

function onRetry() {
  emit('retry')
}

function onQuit() {
  router.push('/')
}
</script>

<template lang="pug">
.pause-menu(v-if="battle.paused && !battle.battleOver")
  h2.pause-menu__title PAUSED
  button.pause-menu__btn(@click="onResume") Resume
  button.pause-menu__btn(@click="onRetry") Retry
  button.pause-menu__btn(@click="onQuit") Quit to Menu
</template>

<style lang="scss" scoped>
.pause-menu {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 90;
  pointer-events: auto;
}

.pause-menu__title {
  font-size: 28px;
  color: #ddd;
  margin-bottom: 30px;
  font-weight: 300;
  letter-spacing: 6px;
}

.pause-menu__btn {
  padding: 10px 28px;
  font-size: 14px;
  margin: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #bbb;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  cursor: pointer;
  letter-spacing: 1px;
  min-width: 160px;
  pointer-events: auto;
}
</style>
