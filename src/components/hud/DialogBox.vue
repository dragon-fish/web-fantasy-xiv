<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'

const battle = useBattleStore()
</script>

<template lang="pug">
.dialog-box(v-if="battle.dialogText") {{ battle.dialogText }}
</template>

<style lang="scss" scoped>
.dialog-box {
  position: absolute;
  bottom: 22%;
  left: 50%;
  transform: translateX(-50%);
  width: 70%;
  max-width: 700px;
  min-height: 60px;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #e8e8e8;
  font-size: 16px;
  line-height: 1.6;
  letter-spacing: 1px;
  white-space: pre-wrap;
  pointer-events: none;
  z-index: 55;
}
</style>
