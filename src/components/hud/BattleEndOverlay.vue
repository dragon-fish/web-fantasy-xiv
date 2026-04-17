<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
const router = useRouter()
const emit = defineEmits<{ retry: [] }>()

const visible = computed(
  () => battle.battleResult === 'victory' || battle.battleResult === 'wipe'
)
const isWipe = computed(() => battle.battleResult === 'wipe')
const isPractice = computed(() => battle.practiceMode)
const recentLog = computed(() => battle.damageLog.slice(-5))

function formatTime(ms: number): string {
  const sec = ms / 1000
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function formatClearTime(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const frac = (ms % 1000).toString().padStart(3, '0')
  return `${m}'${s.toString().padStart(2, '0')}.${frac}''`
}

function formatMitigation(value: number): string {
  return value > 0 ? ` 减伤${(value * 100).toFixed(0)}%` : ''
}

function onRetry() {
  emit('retry')
}

function onOfficialChallenge() {
  const path = location.pathname
  router.push(path)
}

function onBackToMenu() {
  router.push('/')
}
</script>

<template lang="pug">
.battle-end(v-if="visible")
  h2.battle-end__title(
    :class="isWipe ? 'battle-end__title--wipe' : 'battle-end__title--victory'"
    :style="{ marginBottom: (isPractice && !isWipe) ? '6px' : '16px' }"
  )
    | {{ isWipe ? 'DEFEATED' : 'VICTORY' }}

  .battle-end__practice-badge(v-if="isPractice && !isWipe") 练习模式

  .battle-end__log(v-if="isWipe && recentLog.length > 0")
    div(v-for="(d, i) in recentLog" :key="i")
      span.battle-end__log-time {{ formatTime(d.time) }}
      |  [
      span.battle-end__log-source {{ d.sourceName }}
      | ] {{ d.skillName }}&nbsp;
      span.battle-end__log-amount {{ d.amount }}
      |  (HP:{{ Math.max(0, d.hpAfter) }}
      span.battle-end__log-mit(v-if="d.mitigation > 0") {{ formatMitigation(d.mitigation) }}
      | )
      span.battle-end__log-tag(v-if="i === recentLog.length - 1")  【致命】

  p.battle-end__clear-time(v-if="!isWipe && battle.combatElapsed !== null")
    | 通关用时 {{ formatClearTime(battle.combatElapsed) }}

  .battle-end__actions
    button.battle-end__btn(
      :class="isWipe ? 'battle-end__btn--wipe-primary' : 'battle-end__btn--secondary'"
      @click="onRetry"
    ) 重试
    button.battle-end__btn.battle-end__btn--practice(
      v-if="isPractice && !isWipe"
      @click="onOfficialChallenge"
    ) 开始正式挑战
    button.battle-end__btn(
      :class="isPractice ? 'battle-end__btn--secondary' : (isWipe ? 'battle-end__btn--secondary' : 'battle-end__btn--victory-primary')"
      @click="onBackToMenu"
    ) 返回首页
</template>

<style lang="scss" scoped>
.battle-end {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 80;
  pointer-events: auto;
}

.battle-end__title {
  font-size: 32px;
  font-weight: 300;
  letter-spacing: 6px;

  &--wipe {
    color: #ff4444;
  }

  &--victory {
    color: #44ff44;
  }
}

.battle-end__practice-badge {
  font-size: 14px;
  color: #c86;
  letter-spacing: 4px;
  margin-bottom: 16px;
  border: 1px solid rgba(200, 136, 96, 0.4);
  padding: 4px 16px;
  border-radius: 4px;
}

.battle-end__log {
  font-family: monospace;
  font-size: 12px;
  line-height: 1.8;
  color: #aaa;
  margin-bottom: 16px;
  text-align: left;
  background: rgba(0, 0, 0, 0.4);
  padding: 10px 16px;
  border-radius: 4px;
  max-width: 500px;
}

.battle-end__log-time {
  color: #666;
}

.battle-end__log-source {
  color: #ff8888;
}

.battle-end__log-amount {
  color: #ff6666;
}

.battle-end__log-mit {
  color: #88ccff;
}

.battle-end__log-tag {
  color: #ff4444;
  font-weight: bold;
}

.battle-end__clear-time {
  font-size: 18px;
  color: #ccc;
  margin-bottom: 16px;
  letter-spacing: 2px;
}

.battle-end__actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.battle-end__btn {
  border: none;
  border-radius: 4px;
  cursor: pointer;
  letter-spacing: 2px;
  font-weight: 500;
  padding: 8px 20px;
  font-size: 13px;

  &--wipe-primary {
    padding: 10px 32px;
    font-size: 16px;
    background: rgba(255, 68, 68, 0.25);
    color: #ff6666;
  }

  &--secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #888;
  }

  &--victory-primary {
    padding: 10px 32px;
    font-size: 16px;
    background: rgba(68, 255, 68, 0.2);
    color: #44ff44;
  }

  &--practice {
    padding: 10px 32px;
    font-size: 16px;
    background: rgba(200, 136, 96, 0.2);
    color: #c86;
  }
}
</style>
