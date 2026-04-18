<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useTowerStore } from '@/stores/tower'
import type { TowerNode } from '@/tower/types'

interface Props {
  node: TowerNode
}

const props = defineProps<Props>()

const emit = defineEmits<{
  scout: []
  enter: []
  cancel: []
}>()

const tower = useTowerStore()

const KIND_LABELS: Record<TowerNode['kind'], string> = {
  start: '起点',
  mob: '小怪战斗',
  elite: '精英战斗',
  boss: 'Boss 战斗',
  campfire: '篝火',
  reward: '奖励',
  event: '随机事件',
}

const kindLabel = computed(() => KIND_LABELS[props.node.kind] ?? props.node.kind)

const isBattleNode = computed(
  () => props.node.kind === 'mob' || props.node.kind === 'elite' || props.node.kind === 'boss',
)

const scoutInfo = computed(() => tower.run?.scoutedNodes?.[props.node.id])

const hasScoutInfo = computed(() => !!scoutInfo.value)

const canScout = computed(() => isBattleNode.value && !hasScoutInfo.value)

const canEnter = computed(() => {
  if (props.node.kind === 'mob') return true
  if (props.node.kind === 'elite' || props.node.kind === 'boss') return false
  return true
})

const enterLabel = computed(() => {
  if (props.node.kind === 'mob') return '进入战斗'
  if (props.node.kind === 'elite' || props.node.kind === 'boss') return '进入（phase 5 实装）'
  return '通过'
})

const crystalsInsufficient = computed(() => (tower.run?.crystals ?? 0) < 1)

function onScout() { emit('scout') }
function onEnter() { if (canEnter.value) emit('enter') }
function onCancel() { emit('cancel') }

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') onCancel()
}

onMounted(() => {
  window.addEventListener('keydown', handleKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey)
})
</script>

<template lang="pug">
.node-confirm-overlay(@click.self="onCancel")
  .panel(role="dialog")
    .panel-title {{ kindLabel }}
    .panel-body
      .scout-info(v-if="hasScoutInfo && scoutInfo?.enemySummary")
        .label 敌情
        .enemy-summary {{ scoutInfo.enemySummary }}
        .conditions(v-if="scoutInfo.conditions?.length")
          .label 场地机制
          ul
            li(v-for="(c, i) in scoutInfo.conditions" :key="i") {{ c.kind }}
      .unscouted(v-else-if="isBattleNode")
        | 情报未知，进入前可侦察。
      .non-battle-hint(v-else-if="node.kind === 'reward' || node.kind === 'campfire' || node.kind === 'event'")
        | 该节点将在后续 phase 实装；phase 4 通过即标记已完成。
    .panel-actions
      button.btn.scout(
        v-if="canScout"
        type="button"
        :disabled="crystalsInsufficient"
        @click="onScout"
      )
        span(v-if="!crystalsInsufficient") 侦察（1 💎）
        span(v-else) 水晶不足
      button.btn.enter(
        type="button"
        :disabled="!canEnter"
        @click="onEnter"
      ) {{ enterLabel }}
      button.btn.cancel(type="button" @click="onCancel") 取消
</template>

<style lang="scss" scoped>
.node-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 150;
}

.panel {
  min-width: 320px;
  max-width: 440px;
  padding: 20px 24px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #ddd;
  font-size: 13px;
}

.panel-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #fff;
}

.panel-body {
  margin-bottom: 16px;
  min-height: 60px;

  .label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .enemy-summary {
    font-size: 13px;
    color: #ddd;
    margin-bottom: 8px;
  }

  .unscouted, .non-battle-hint {
    color: #aaa;
    font-style: italic;
  }
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn {
  padding: 8px 14px;
  font-size: 13px;
  color: #aaa;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &.enter { background: rgba(120, 180, 120, 0.18); }
  &.scout { background: rgba(120, 160, 200, 0.18); }
}
</style>
