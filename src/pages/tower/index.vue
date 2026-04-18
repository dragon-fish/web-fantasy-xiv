<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTimeAgo } from '@vueuse/core'
import { useTowerStore } from '@/stores/tower'
import type { BaseJobId, TowerNode } from '@/tower/types'
import { getJob, type PlayerJob } from '@/jobs'
import { resolveEncounter } from '@/tower/pools/encounter-pool'

const router = useRouter()
const tower = useTowerStore()

const showAbandonDialog = ref(false)

// ───────── in-path node selection ─────────
const selectedNodeId = ref<number | null>(null)

const selectedNode = computed<TowerNode | null>(() => {
  if (selectedNodeId.value === null) return null
  if (!tower.run) return null
  return tower.run.towerGraph.nodes[selectedNodeId.value] ?? null
})

// ───────── in-combat state ─────────
// The mob node being fought is tracked by the store via run.pendingCombatNodeId
// (GDD §2.4 route-lock: persistent so browser refresh cannot bypass the commit).
// The store's currentNodeId stays on the PREVIOUS node until victory/abandon.
const currentEncounterUrl = ref<string | null>(null)
const currentRewardCrystals = ref(0)
const combatInstanceKey = ref(0)
const showResultOverlay = ref(false)
const lastCombatResult = ref<'victory' | 'wipe'>('victory')

const runJobId = computed<string>(() => {
  return tower.run?.advancedJobId ?? tower.run?.baseJobId ?? 'default'
})

const showStatusBar = computed<boolean>(() => {
  if (!tower.run) return false
  // Excluded from in-combat: would collide with boss HP bar / cast bar in HUD.
  return (
    tower.phase === 'ready-to-descend' ||
    tower.phase === 'in-path' ||
    tower.phase === 'ended'
  )
})

const displayJobName = computed(() => {
  if (!tower.run) return ''
  const id = tower.run.advancedJobId ?? tower.run.baseJobId
  return getJob(id).name
})

const startedAtText = computed(() => {
  if (!tower.run) return ''
  return useTimeAgo(tower.run.startedAt).value
})

onMounted(async () => {
  await tower.hydrate()
})

function goHome() {
  router.push('/')
}

function onJobPick(job: PlayerJob): void {
  tower.startNewRun(job.id as BaseJobId)
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

async function onStartDescent() {
  await tower.startDescent()
}

function onAbandon(): void {
  // TODO(phase 6): hook up settlement system per GDD §2.16 —
  // compute gold reward from run.level / run.crystals / run.materia,
  // and show a settlement screen. For phase 3 we just clear the save.
  tower.resetRun()
  showAbandonDialog.value = false
}

// ───────────── in-path flow ─────────────
function onMapNodeClick(nodeId: number): void {
  if (!tower.run) return
  // GDD §2.4: if locked to a pending battle, only accept the pending node click
  if (tower.run.pendingCombatNodeId != null) {
    if (nodeId === tower.run.pendingCombatNodeId) {
      selectedNodeId.value = nodeId
    }
    return
  }
  const current = tower.run.towerGraph.nodes[tower.run.currentNodeId]
  if (!current) return
  // Only allow selecting nodes reachable from current (in current.next)
  if (!current.next.includes(nodeId)) return
  selectedNodeId.value = nodeId
}

async function onScout() {
  if (selectedNodeId.value === null) return
  await tower.scoutNode(selectedNodeId.value)
}

function onCancelConfirm() {
  selectedNodeId.value = null
}

function onEnter() {
  if (selectedNodeId.value === null) return
  if (!tower.run) return
  const nodeId = selectedNodeId.value
  const node = tower.run.towerGraph.nodes[nodeId]
  if (!node) return
  if (node.kind === 'reward' || node.kind === 'campfire' || node.kind === 'event' || node.kind === 'start') {
    tower.advanceTo(nodeId)
    selectedNodeId.value = null
    return
  }
  if (node.kind === 'mob') {
    tower.enterCombat(nodeId)
    selectedNodeId.value = null
    return
  }
  // elite / boss: panel disables the button; nothing to do here.
}

// ───────────── in-combat flow ─────────────
async function prepareCombat() {
  if (!tower.run || tower.phase !== 'in-combat') return
  const nodeId = tower.run.pendingCombatNodeId
  if (nodeId === null || nodeId === undefined) return
  const node = tower.run.towerGraph.nodes[nodeId]
  if (!node || !node.encounterId) {
    console.error('[tower/index] prepareCombat: node or encounterId missing', { nodeId })
    return
  }
  const entry = await resolveEncounter(node.encounterId)
  currentEncounterUrl.value = `${import.meta.env.BASE_URL}${entry.yamlPath}`
  currentRewardCrystals.value = entry.rewards.crystals
  combatInstanceKey.value++
  showResultOverlay.value = false
}

watch(
  () => tower.phase,
  (p, prev) => {
    if (p === 'in-combat' && prev !== 'in-combat') {
      void prepareCombat()
    }
  },
)

// GDD §2.4 resume UX: if a run has a committed pending battle, auto-open the
// confirm panel pre-selected to that node so the player immediately sees
// where they committed to.
watch(
  () => [tower.phase, tower.run?.pendingCombatNodeId] as const,
  ([p, pending]) => {
    if (p === 'in-path' && typeof pending === 'number') {
      selectedNodeId.value = pending
    }
  },
  { immediate: true },
)

function onCombatEnded(payload: { result: 'victory' | 'wipe'; elapsed: number }) {
  lastCombatResult.value = payload.result
  if (payload.result === 'wipe') {
    tower.deductDeterminationOnWipe(1)
  }
  showResultOverlay.value = true
}

function onRetryCombat() {
  if (!tower.run) return
  if (tower.run.determination <= 0) return
  showResultOverlay.value = false
  combatInstanceKey.value++ // remount runner → fresh battle
}

function onAbandonCombat() {
  if (!tower.run) return
  const nodeId = tower.run.pendingCombatNodeId
  if (nodeId === null || nodeId === undefined) return
  // abandonCurrentCombat flips phase in-combat → in-path and clears pendingCombatNodeId.
  // Read nodeId BEFORE the store clears it.
  tower.abandonCurrentCombat(nodeId, currentRewardCrystals.value)
  tower.advanceTo(nodeId)
  showResultOverlay.value = false
  tower.checkEndedCondition()
}

function onContinueAfterVictory() {
  if (!tower.run) return
  const nodeId = tower.run.pendingCombatNodeId
  if (nodeId === null || nodeId === undefined) return
  // resolveVictory flips phase in-combat → in-path and clears pendingCombatNodeId.
  // Read nodeId BEFORE the store clears it.
  tower.resolveVictory(nodeId, currentRewardCrystals.value)
  tower.advanceTo(nodeId)
  showResultOverlay.value = false
}

function onExitEnded() {
  tower.resetRun()
  router.push('/')
}
</script>

<template lang="pug">
//- In-combat: render OUTSIDE MenuShell so the canvas is not obscured by
//- MenuShell's full-screen black background. Status bar omitted here —
//- it would collide with boss HP / cast bar HUD components.
template(v-if="tower.phase === 'in-combat' && tower.run && currentEncounterUrl")
  TowerEncounterRunner(
    :encounter-url="currentEncounterUrl"
    :job-id="runJobId"
    :key="combatInstanceKey"
    @combat-ended="onCombatEnded"
  )
  TowerBattleResultOverlay(
    v-if="showResultOverlay"
    :result="lastCombatResult"
    :encounter-reward-crystals="currentRewardCrystals"
    :current-determination="tower.run.determination"
    @retry="onRetryCombat"
    @abandon="onAbandonCombat"
    @continue="onContinueAfterVictory"
  )

//- All other phases: inside MenuShell (hide the brand title when a run is active).
template(v-else)
  MenuShell(:hide-title="showStatusBar")
    MenuBackButton(to="/")
    .schema-reset-notice(v-if="tower.schemaResetNotice")
      span.notice-text 本迷宫版本已更新，之前的下潜已关闭
      button.notice-dismiss(type="button" @click="tower.dismissSchemaNotice()") 知道了

    TowerRunStatusBar(v-if="showStatusBar")

    //- ───────────────── no-run no save ─────────────────
    .tower-panel(v-if="tower.phase === 'no-run' && !tower.savedRunExists")
      .tower-title 爬塔模式
      .tower-subtitle 选择一个入口开始你的攀登
      .tower-actions
        button.tower-btn.primary(type="button" @click="tower.enterJobPicker()") 新游戏
        button.tower-btn.secondary(type="button" disabled) 教程
        button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单

    //- ───────────────── no-run with save ─────────────────
    .tower-panel(v-else-if="tower.phase === 'no-run' && tower.savedRunExists && tower.run")
      .tower-title 爬塔模式
      .tower-subtitle 进行中的下潜
      .run-summary
        .summary-row
          span.label 职业
          span.value {{ displayJobName }}
        .summary-row
          span.label 等级
          span.value {{ tower.run.level }}
        .summary-row
          span.label 水晶
          span.value {{ tower.run.crystals }}
        .summary-row
          span.label 开始于
          span.value {{ startedAtText }}
      .tower-actions
        button.tower-btn.primary(type="button" @click="onContinue") 继续
        button.tower-btn.secondary(type="button" @click="showAbandonDialog = true") 放弃并结算
        button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单
      CommonConfirmDialog(
        v-if="showAbandonDialog"
        title="确定放弃这次攀登吗？"
        message="所有进度将丢失。"
        confirm-text="放弃"
        cancel-text="取消"
        variant="danger"
        @confirm="onAbandon"
        @cancel="showAbandonDialog = false"
      )

    //- ─────────────────── selecting-job ───────────────────
    TowerJobPicker(
      v-else-if="tower.phase === 'selecting-job'"
      @pick="onJobPick"
      @back="tower.setPhase('no-run')"
    )

    //- ─────────────────── ready-to-descend ───────────────────
    .tower-panel(v-else-if="tower.phase === 'ready-to-descend' && tower.run")
      .tower-subtitle 准备下潜 — 确认你的装备后点击开始
      .tower-preview
        .preview-row
          span.label 基础职业
          span.value {{ tower.run.baseJobId }}
        .preview-row
          span.label 种子
          span.value.seed {{ tower.run.seed }}
      .tower-actions
        button.tower-btn.primary(type="button" @click="onStartDescent") 开始下潜
        button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 重置

    //- ───────────────────────── in-path ────────────────────────
    .tower-inpath(v-else-if="tower.phase === 'in-path' && tower.run")
      .tower-subtitle 点击可达节点前进
      TowerMap(@node-click="onMapNodeClick")
      .tower-actions-inline
        button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 放弃本局
      TowerNodeConfirmPanel(
        v-if="selectedNode"
        :node="selectedNode"
        @scout="onScout"
        @enter="onEnter"
        @cancel="onCancelConfirm"
      )

    //- ───────────────────────── ended ────────────────────────
    TowerEndedScreen(
      v-else-if="tower.phase === 'ended'"
      @exit="onExitEnded"
    )

    //- ─────────────────────── fallback ─────────────────────────
    .tower-panel(v-else)
      .tower-title 爬塔模式
      .tower-placeholder
        | Phase: {{ tower.phase }}
      .tower-placeholder
        | TODO: implemented in later phases
      button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 重置并返回
</template>

<style lang="scss" scoped>
.tower-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  max-width: 420px;
  width: 90%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.tower-inpath {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.tower-title {
  font-size: 18px;
  color: #ddd;
  font-weight: bold;
}

.tower-subtitle {
  font-size: 12px;
  color: #888;
  margin-bottom: 8px;
}

.tower-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.tower-actions-inline {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 12px;
}

.tower-btn {
  padding: 10px 20px;
  font-size: 13px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    color: #fff;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.primary { background: rgba(255, 255, 255, 0.1); }
  &.secondary { background: rgba(255, 255, 255, 0.06); }
  &.tertiary { background: rgba(255, 255, 255, 0.02); }
}

.tower-placeholder {
  font-size: 12px;
  color: #888;
  font-family: monospace;
}

.tower-preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  margin-bottom: 6px;

  .preview-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;

    .label { color: #888; }
    .value { color: #ddd; }
    .value.seed {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.run-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  margin-bottom: 12px;

  .summary-row {
    display: flex;
    justify-content: space-between;

    .label { color: #888; }
    .value { color: #ddd; }
  }
}

.schema-reset-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  max-width: 420px;
  width: 90%;
  margin-bottom: 12px;
  background: rgba(255, 140, 80, 0.15);
  border: 1px solid rgba(255, 140, 80, 0.4);
  border-radius: 6px;
  font-size: 12px;
  color: #ffd0b0;

  .notice-text {
    flex: 1;
  }

  .notice-dismiss {
    padding: 4px 10px;
    font-size: 11px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    color: inherit;
    cursor: pointer;

    &:hover { background: rgba(255, 255, 255, 0.16); }
  }
}
</style>
