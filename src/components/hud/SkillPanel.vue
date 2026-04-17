<script setup lang="ts">
import { useSkillPanel, useSkillPanelHotkey } from '@/composables/use-skill-panel'
import { useBattleStore } from '@/stores/battle'

const { isOpen, close } = useSkillPanel()
useSkillPanelHotkey()

const battle = useBattleStore()

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template lang="pug">
.skill-panel-overlay(v-if="isOpen" @click="onOverlayClick")
  .skill-panel
    .skill-panel-header
      span.title 技能一览
      span.close-btn(@click="close") ✕
    .skill-panel-body
      MenuCompactSkillRow(
        v-for="entry in battle.skillBarEntries"
        :key="entry.key"
        :key-label="entry.key"
        :skill="entry.skill"
        :buff-defs="battle.buffDefs"
        :gcd-duration="battle.tooltipContext.gcdDuration"
      )
</template>

<style lang="scss" scoped>
.skill-panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  pointer-events: auto;
}

.skill-panel {
  background: linear-gradient(180deg, rgba(30, 28, 24, 0.97) 0%, rgba(18, 16, 14, 0.97) 100%);
  border: 2px solid #8b7440;
  border-radius: 6px;
  padding: 20px 24px;
  max-width: 500px;
  width: 90%;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow:
    0 0 1px rgba(184, 160, 106, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.6);
}

.skill-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(184, 160, 106, 0.2);
  padding-bottom: 8px;
}

.title {
  font-size: 16px;
  font-weight: bold;
  color: #b8a06a;
}

.close-btn {
  cursor: pointer;
  color: #888;
  font-size: 18px;
  line-height: 1;
}

.skill-panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
