<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  result: 'victory' | 'wipe'
  encounterRewardCrystals: number
  currentDetermination: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  retry: []
  abandon: []
  continue: []
}>()

const canRetry = computed(() => props.currentDetermination > 0)
const abandonCrystals = computed(() => Math.floor(props.encounterRewardCrystals / 2))
</script>

<template lang="pug">
.result-overlay(role="dialog")
  .result-card
    .result-title.victory(v-if="result === 'victory'") 击败！
    .result-title.wipe(v-else) 你失败了
    .result-body
      template(v-if="result === 'victory'")
        .reward 获得 💎 {{ encounterRewardCrystals }}
      template(v-else)
        .status 当前决心：{{ currentDetermination }} ❤️
        .hint 已消耗 1 决心
    .result-actions
      template(v-if="result === 'victory'")
        button.btn.primary(type="button" @click="emit('continue')") 继续
      template(v-else)
        button.btn.primary(
          type="button"
          :disabled="!canRetry"
          @click="emit('retry')"
        )
          span(v-if="canRetry") 重试
          span(v-else) 决心已耗尽
        button.btn.secondary(type="button" @click="emit('abandon')")
          | 放弃（+{{ abandonCrystals }} 💎）
</template>

<style lang="scss" scoped>
.result-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 160;
  pointer-events: auto;
}

.result-card {
  min-width: 320px;
  padding: 28px 32px;
  background: rgba(20, 20, 20, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  text-align: center;
}

.result-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 16px;

  &.victory { color: #ffd700; }
  &.wipe { color: #ff6666; }
}

.result-body {
  margin-bottom: 20px;
  color: #ccc;
  font-size: 14px;
  line-height: 1.6;

  .reward { font-size: 16px; color: #ffdd88; }
  .status { font-size: 15px; }
  .hint { font-size: 12px; color: #888; margin-top: 4px; }
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn {
  padding: 10px 16px;
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

  &.primary { background: rgba(255, 255, 255, 0.1); }
  &.secondary { background: rgba(255, 255, 255, 0.04); }
}
</style>
