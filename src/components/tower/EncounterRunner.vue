<script setup lang="ts">
import { onMounted, onBeforeUnmount, useTemplateRef, watch } from 'vue'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useDebugStore } from '@/stores/debug'
import {
  startTimelineDemo,
  getActiveScene,
  disposeActiveScene,
  type BattleInitCallback,
} from '@/game/battle-runner'
import type { GameScene } from '@/game/game-scene'

interface Props {
  encounterUrl: string
  jobId: string
  onInit?: BattleInitCallback
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'combat-ended': [payload: { result: 'victory' | 'wipe'; elapsed: number }]
  'scene-ready': [scene: GameScene]
}>()

const { canvas } = useEngine()
const debug = useDebugStore()
const uiRootRef = useTemplateRef<HTMLDivElement>('ui-root')

let adapter: ReturnType<typeof useStateAdapter> | null = null
let combatEndedHandler: ((p: any) => void) | null = null

async function bootBattle() {
  adapter?.dispose()
  adapter = null
  disposeActiveScene()

  if (!canvas.value || !uiRootRef.value) return

  await startTimelineDemo(canvas.value, uiRootRef.value, props.encounterUrl, props.jobId, props.onInit)

  const scene = getActiveScene()
  if (!scene) return

  adapter = useStateAdapter(scene)

  // Bridge combat:ended bus event → Vue emit
  combatEndedHandler = (payload: { result: 'victory' | 'wipe'; elapsed: number }) => {
    emit('combat-ended', payload)
  }
  scene.bus.on('combat:ended', combatEndedHandler)

  // Notify host that scene is fully booted (for cosmetic flags like practiceMode)
  emit('scene-ready', scene)

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

onMounted(bootBattle)

onBeforeUnmount(() => {
  const scene = getActiveScene()
  if (scene && combatEndedHandler) {
    scene.bus.off('combat:ended', combatEndedHandler)
  }
  adapter?.dispose()
  adapter = null
  disposeActiveScene()
})

// Re-boot on encounterUrl / jobId change (host can also use :key to fully remount)
watch(
  () => [props.encounterUrl, props.jobId],
  () => { void bootBattle() },
)
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
  HudDebugInfo
  HudTimelineDisplay
  HudTooltip
  HudSkillPanel
  slot(name="overlay")
</template>

<style lang="scss" scoped>
#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
