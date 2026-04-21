<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useTemplateRef, watch, provide } from 'vue'
import { SKILL_TRIGGER_KEY } from '@/components/hud/skill-trigger-key'
import { useEngine } from '@/composables/use-engine'
import { useStateAdapter } from '@/composables/use-state-adapter'
import { useDebugStore } from '@/stores/debug'
import { useTowerStore } from '@/stores/tower'
import {
  startTimelineDemo,
  getActiveScene,
  disposeActiveScene,
  type BattleInitCallback,
  type BattleInitContext,
} from '@/game/battle-runner'
import { activateConditionsForEncounter } from '@/tower/conditions/activate-for-encounter'
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
const tower = useTowerStore()
const uiRootRef = useTemplateRef<HTMLDivElement>('ui-root')

let adapter: ReturnType<typeof useStateAdapter> | null = null
let combatEndedHandler: ((p: any) => void) | null = null

// Reactive scene reference — template uses this to mount scene-bus-dependent
// overlays (e.g. HudDeathWindowVignette) only after booting completes.
const sceneRef = ref<GameScene | null>(null)

// Provide skill trigger function to HUD components (e.g. SkillBar click)
const triggerSkill = ref<(idx: number) => void>(() => {})
provide(SKILL_TRIGGER_KEY, triggerSkill)

/**
 * Compose the caller-provided `onInit` with battlefield-condition activation
 * (phase 5 spec §7.1). Condition activation runs FIRST so that any buffs it
 * applies are in place before the caller's hook (e.g. practice_immunity). The
 * tower store's determination is read live at init time; non-tower routes
 * (tutorial / practice) will typically load encounters without a `conditions`
 * field, making the call a no-op. If determination is unavailable (no active
 * run), we fall back to Infinity — echo's `determination > threshold` guard
 * then always skips, which is the desired non-tower behavior.
 *
 * NOTE: determination is read once at scene-init, not reactively. Conditions
 * fire exactly once and are NOT re-evaluated if determination changes mid-combat
 * (e.g. a death-window decrement inside the same scene). This is intentional —
 * conditions are mount-time configuration, not live predicates.
 */
function composeInit(userInit?: BattleInitCallback): BattleInitCallback {
  return async (ctx: BattleInitContext) => {
    const determination = tower.run?.determination ?? Number.POSITIVE_INFINITY
    // Activate battlefield conditions BEFORE the caller's hook so any applied
    // buffs (e.g. echo) land before practice_immunity etc. Awaited — the
    // battle-runner blocks engage on onInit so frame 0 sees the applied buffs.
    await activateConditionsForEncounter(
      ctx.encounter,
      { player: ctx.player, buffSystem: ctx.buffSystem, gameTime: 0 },
      { determination },
    )
    await userInit?.(ctx)
  }
}

async function bootBattle() {
  adapter?.dispose()
  adapter = null
  disposeActiveScene()

  if (!canvas.value || !uiRootRef.value) return

  await startTimelineDemo(
    canvas.value,
    uiRootRef.value,
    props.encounterUrl,
    props.jobId,
    composeInit(props.onInit),
  )

  const scene = getActiveScene()
  if (!scene) return
  sceneRef.value = scene
  triggerSkill.value = (idx: number) => scene.triggerSkill(idx)

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
  sceneRef.value = null
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
  HudDeathWindowVignette(
    v-if="sceneRef"
    :bus="sceneRef.bus"
  )
  slot(name="overlay")
</template>

<style lang="scss" scoped>
#ui-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
