<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useJobStore } from '@/stores/job'
import { getJob, COMMON_BUFFS } from '@/jobs'
import type { BattleInitCallback } from '@/game/battle-runner'
import type { GameScene } from '@/game/game-scene'

const route = useRoute('/encounter/[id]')
const router = useRouter()
const jobStore = useJobStore()
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')
const gameKey = ref(0)

const isTutorial = computed(() => route.params.id === 'tutorial')
const isPractice = computed(() => {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).has('practice')
})

const encounterUrl = computed(() => {
  const base = import.meta.env.BASE_URL
  return `${base}encounters/${route.params.id}.yaml`
})

const jobId = computed(() => {
  if (isTutorial.value) return 'default'
  const j = getJob(jobStore.selectedJobId)
  if (j.id === 'default' && jobStore.selectedJobId !== 'default') {
    jobStore.select('default')
  }
  return jobStore.selectedJobId
})

const onInit = computed<BattleInitCallback | undefined>(() => {
  if (!isPractice.value) return undefined
  return (ctx) => {
    const buff = COMMON_BUFFS.practice_immunity
    ctx.registerBuffs({ practice_immunity: buff })
    ctx.buffSystem.applyBuff(ctx.player, buff, 'system')
  }
})

function handleRetry() {
  gameKey.value += 1
}

function handleResume() {
  // no-op; PauseMenu handles scene.resume() itself
}

function handleSkipTutorial() {
  tutorialSeen.value = '1'
  router.push('/')
}

function onSceneReady(scene: GameScene) {
  scene.practiceMode = isPractice.value
}

// Mark tutorial as seen on route entry
if (isTutorial.value) tutorialSeen.value = '1'
</script>

<template lang="pug">
TowerEncounterRunner(
  :key="gameKey"
  :encounter-url="encounterUrl"
  :job-id="jobId"
  :on-init="onInit"
  @scene-ready="onSceneReady"
)
  template(#overlay)
    HudPauseMenu(@resume="handleResume" @retry="handleRetry")
    HudBattleEndOverlay(@retry="handleRetry")
    .skip-tutorial(v-if="isTutorial" @click="handleSkipTutorial") 跳过教程 &gt;
</template>

<style lang="scss" scoped>
.skip-tutorial {
  position: absolute;
  top: 16px;
  right: 16px;
  pointer-events: auto;
  cursor: pointer;
  padding: 6px 16px;
  font-size: 13px;
  color: #aaa;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}
</style>
</content>
</invoke>