<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useJobStore } from '@/stores/job'
import { useDebugStore } from '@/stores/debug'
import {
  startTimelineDemo,
  getActiveScene,
  disposeActiveScene,
  type BattleInitCallback,
} from '@/game/battle-runner'
import { getJob, COMMON_BUFFS } from '@/jobs'

const route = useRoute('/encounter/[id]')
const router = useRouter()
const { canvas } = useEngine()
const jobStore = useJobStore()
const debug = useDebugStore()
const uiRootRef = useTemplateRef<HTMLDivElement>('ui-root')
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')
const gameKey = ref(0)

const isTutorial = computed(() => route.params.id === 'tutorial')
const isPractice = computed(() => {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).has('practice')
})

let adapter: ReturnType<typeof useStateAdapter> | null = null

async function bootBattle() {
  // Clean up any existing battle
  adapter?.dispose()
  adapter = null
  disposeActiveScene()

  if (!canvas.value || !uiRootRef.value) return

  const id = route.params.id
  const base = import.meta.env.BASE_URL
  const encounterUrl = `${base}encounters/${id}.yaml`

  // Resolve job: tutorial forces default; else use stored; fix invalid
  let jobId: string | undefined
  if (isTutorial.value) {
    jobId = 'default'
  } else {
    const j = getJob(jobStore.selectedJobId)
    if (j.id === 'default' && jobStore.selectedJobId !== 'default') {
      jobStore.select('default')
    }
    jobId = jobStore.selectedJobId
  }

  // Practice mode onInit callback
  let onInit: BattleInitCallback | undefined
  if (isPractice.value) {
    onInit = (ctx) => {
      const buff = COMMON_BUFFS.practice_immunity
      ctx.registerBuffs({ practice_immunity: buff })
      ctx.buffSystem.applyBuff(ctx.player, buff, 'system')
    }
  }

  await startTimelineDemo(canvas.value, uiRootRef.value, encounterUrl, jobId, onInit)

  const scene = getActiveScene()
  if (!scene) return

  scene.practiceMode = isPractice.value

  adapter = useStateAdapter(scene)
  let lastFpsUpdate = 0
  scene.onRenderTick = (delta) => {
    adapter!.writeFrame(delta)
    const now = performance.now()
    if (now - lastFpsUpdate > 250) {
      debug.fps = Math.round(scene.sceneManager.engine.getFps())
      lastFpsUpdate = now
    }
  }
}

onMounted(() => {
  bootBattle()
  if (isTutorial.value) {
    tutorialSeen.value = '1'
  }
})

onBeforeUnmount(() => {
  adapter?.dispose()
  adapter = null
  disposeActiveScene()
})

// Re-boot on id change or retry
watch([() => route.params.id, gameKey], () => {
  bootBattle()
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
</script>

<template lang="pug">
#ui-root(ref="ui-root")
  HudHpBar(mode="boss")
  HudHpBar(mode="player")
  HudMpBar
  HudCastBar(mode="player")
  HudCastBar(mode="boss")
  HudSkillBar
  HudSkillPanelButton
  HudBuffBar
  HudDamageFloater
  HudCombatAnnounce
  HudDialogBox
  HudPauseMenu(@resume="handleResume" @retry="handleRetry")
  HudBattleEndOverlay(@retry="handleRetry")
  HudDebugInfo
  HudTimelineDisplay
  HudTooltip
  HudSkillPanel
  .skip-tutorial(v-if="isTutorial" @click="handleSkipTutorial") 跳过教程 &gt;
</template>

<style lang="scss" scoped>
#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
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
