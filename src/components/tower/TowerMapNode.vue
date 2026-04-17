<script setup lang="ts">
import { computed } from 'vue'
import type { TowerNode, TowerNodeKind } from '@/tower/types'

type NodeState = 'current' | 'completed' | 'reachable' | 'unreachable'

const props = defineProps<{
  node: TowerNode
  state: NodeState
}>()

const emit = defineEmits<{
  (e: 'select', nodeId: number): void
}>()

const ICON_MAP: Record<TowerNodeKind, string> = {
  start: '🚩',
  mob: '⚔️',
  elite: '💀',
  boss: '👑',
  campfire: '🔥',
  reward: '🎁',
  event: '❓',
}

const icon = computed(() => ICON_MAP[props.node.kind])
const disabled = computed(() => props.state !== 'reachable')

function onClick() {
  if (disabled.value) return
  emit('select', props.node.id)
}
</script>

<template lang="pug">
button.tower-map-node(
  :class="[state, `kind-${node.kind}`]"
  :disabled="disabled"
  type="button"
  @click="onClick"
)
  span.icon {{ icon }}
</template>

<style lang="scss" scoped>
.tower-map-node {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  background: #1a1a1a;
  cursor: pointer;
  font-size: 22px;
  transition: transform 0.12s ease, filter 0.12s ease, background 0.12s ease;
  user-select: none;

  .icon {
    line-height: 1;
  }

  &:disabled {
    cursor: not-allowed;
  }

  &.current {
    border-color: #ffd166;
    background: rgba(255, 209, 102, 0.2);
    box-shadow: 0 0 12px rgba(255, 209, 102, 0.4);
    transform: scale(1.15);
  }

  &.completed {
    filter: saturate(0.5);
    opacity: 0.6;
  }

  &.reachable {
    border-color: rgba(255, 255, 255, 0.6);
    animation: pulse 1.4s ease-in-out infinite;

    &:hover {
      transform: scale(1.08);
      background: rgba(255, 255, 255, 0.12);
    }
  }

  &.unreachable {
    filter: saturate(0.3);
    opacity: 0.5;
  }

  // kind-specific tints
  &.kind-elite { color: #ff7a7a; }
  &.kind-boss { color: #ff6680; }
  &.kind-campfire { color: #ff9955; }
  &.kind-reward { color: #ffd166; }
  &.kind-event { color: #9acbff; }
  &.kind-start { color: #c9c9ff; }
  &.kind-mob { color: #dddddd; }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
  50% { box-shadow: 0 0 10px 4px rgba(255, 255, 255, 0.2); }
}
</style>
