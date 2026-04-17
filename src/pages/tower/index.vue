<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTimeAgo } from '@vueuse/core'
import { useTowerStore } from '@/stores/tower'
import type { BaseJobId } from '@/tower/types'
import { getJob, type PlayerJob } from '@/jobs'

const router = useRouter()
const tower = useTowerStore()

const showAbandonDialog = ref(false)

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

function onStartDescent() {
  tower.startDescent()
}

function onAbandon(): void {
  // TODO(phase 6): hook up settlement system per GDD §2.16 —
  // compute gold reward from run.level / run.crystals / run.materia,
  // and show a settlement screen. For phase 3 we just clear the save.
  tower.resetRun()
  showAbandonDialog.value = false
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .schema-reset-notice(v-if="tower.schemaResetNotice")
    span.notice-text 本迷宫版本已更新，之前的下潜已关闭
    button.notice-dismiss(type="button" @click="tower.dismissSchemaNotice()") 知道了

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

  //- ─────────────────── selecting-job (phase 3 new: job picker) ───────────────────
  TowerJobPicker(
    v-else-if="tower.phase === 'selecting-job'"
    @pick="onJobPick"
    @back="tower.setPhase('no-run')"
  )

  //- ─────────────────── ready-to-descend ───────────────────
  .tower-panel(v-else-if="tower.phase === 'ready-to-descend' && tower.run")
    .tower-title 准备下潜
    .tower-subtitle 确认你的装备后点击开始
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
    TowerMap
    .tower-actions-inline
      button.tower-btn.tertiary(type="button" @click="tower.resetRun()") 放弃本局

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
