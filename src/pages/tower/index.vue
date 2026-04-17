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
  // Phase 3 将在这里连接职业选择流程.
  // P1: 按钮 disabled，不会被点击.
}

function onContinue() {
  if (!tower.savedRunExists) return
  void tower.continueLastRun()
}

function onTutorial() {
  // Phase 7 将在这里装载教程塔 hand-crafted graph.
}
</script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .tower-panel(v-if="tower.phase === 'no-run'")
    .tower-title 爬塔模式
    .tower-subtitle 选择一个入口开始你的攀登
    .tower-actions
      button.tower-btn.primary(
        type="button"
        disabled
        @click="onNewGame"
      ) 新游戏
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
      button.tower-btn.tertiary(
        type="button"
        @click="goHome"
      ) 返回主菜单
  .tower-panel(v-else)
    .tower-title 爬塔模式
    .tower-placeholder
      | Phase: {{ tower.phase }}
    .tower-placeholder
      | TODO: implemented in later phases
    button.tower-btn.tertiary(
      type="button"
      @click="tower.resetRun()"
    ) 重置并返回
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
</style>
