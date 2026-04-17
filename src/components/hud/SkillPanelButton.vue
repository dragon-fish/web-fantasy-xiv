<script setup lang="ts">
import { useSkillPanel } from '@/composables/use-skill-panel'

const { toggle } = useSkillPanel()
</script>

<template lang="pug">
.skill-panel-button(title="技能一览 (P)" @click="toggle") ?
</template>

<style lang="scss" scoped>
.skill-panel-button {
  position: absolute;
  bottom: 74px;
  left: 50%;
  transform: translateX(calc(-50% + 180px));
  pointer-events: auto;
  cursor: pointer;
  width: 24px;
  height: 24px;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #aaa;
}
</style>
