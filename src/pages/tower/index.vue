<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTowerStore } from '@/stores/tower'

const router = useRouter()
const tower = useTowerStore()

onMounted(async () => {
  await tower.hydrate()
})

function goHome() {
  router.push('/')
}

function onNewGame() {
  // Phase 3 将在这里接"真正的职业选择流程".
  // P2 的临时桥：硬编码 'swordsman'，让流程跑通到 selecting-job.
  tower.startNewRun('swordsman')
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

function onTutorial() {
  // Phase 7 将在这里装载教程塔 hand-crafted graph.
}

function onStartDescent() {
  tower.startDescent()
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .schema-reset-notice(v-if="tower.schemaResetNotice")
    span.notice-text 本迷宫版本已更新，之前的下潜已关闭
    button.notice-dismiss(type="button" @click="tower.dismissSchemaNotice()") 知道了

  //- ───────────────────────── no-run ─────────────────────────
  .tower-panel(v-if="tower.phase === 'no-run'")
    .tower-title 爬塔模式
    .tower-subtitle 选择一个入口开始你的攀登
    .tower-actions
      button.tower-btn.primary(type="button" @click="onNewGame") 新游戏
      button.tower-btn.secondary(
        type="button"
        :disabled="!tower.savedRunExists"
        @click="onContinue"
      ) 继续
      button.tower-btn.secondary(
        type="button"
        disabled
        @click="onTutorial"
      ) 教程
      button.tower-btn.tertiary(type="button" @click="goHome") 返回主菜单

  //- ───────────────────── selecting-job ─────────────────────
  .tower-panel(v-else-if="tower.phase === 'selecting-job' && tower.run")
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
