<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { useTooltip } from '@/composables/use-tooltip'
import { buildSkillTooltip } from '@/components/hud/tooltip-builders'
import { SKILL_TRIGGER_KEY } from '@/components/hud/skill-trigger-key'
import type { SkillBarEntry } from '@/jobs/shared'

const battle = useBattleStore()
const tooltip = useTooltip()
const triggerSkill = inject<Ref<(idx: number) => void>>(SKILL_TRIGGER_KEY)

const activeBuffIds = computed(() => new Set(battle.buffs.map((b) => b.defId)))

function isLocked(entry: { skill: any }) {
  const skill = entry.skill
  const reqBuffs = (skill as any).requiresBuffs as string[] | undefined
  const reqStacks = (skill as any).requiresBuffStacks as { buffId: string; stacks: number } | undefined
  const lockedByBuffs = reqBuffs ? !reqBuffs.every((id) => activeBuffIds.value.has(id)) : false
  const lockedByStacks = reqStacks
    ? (battle.buffs.find((b) => b.defId === reqStacks.buffId)?.stacks ?? 0) < reqStacks.stacks
    : false
  const lockedByMp = skill.mpCost > 0 && battle.playerMp.current < skill.mpCost
  return lockedByBuffs || lockedByStacks || lockedByMp
}

function cdTotal(entry: { skill: any }) {
  return entry.skill.gcd ? battle.gcdState.total : entry.skill.cooldown ?? 0
}
function activeCd(entry: { skill: any }) {
  return entry.skill.gcd ? battle.gcdState.remaining : battle.cooldowns.get(entry.skill.id) ?? 0
}
function cdPct(entry: { skill: any }) {
  const t = cdTotal(entry)
  const a = activeCd(entry)
  return t > 0 && a > 0 ? (a / t) * 100 : 0
}
function cdText(entry: { skill: any }) {
  const a = activeCd(entry)
  return a > 0 ? (a / 1000).toFixed(1) : null
}

function onEnter(e: MouseEvent, entry: SkillBarEntry) {
  let html = buildSkillTooltip(
    entry.skill,
    battle.buffDefs.size > 0 ? battle.buffDefs : undefined,
    battle.tooltipContext
  )
  if (entry.description) html += `<p style="color:#d7c9a8;max-width:280px">${entry.description}</p>`
  tooltip.show(html, e.clientX, e.clientY)
}
function onLeave() {
  tooltip.hide()
}

function keyToIndex(key: string): number {
  if (key === 'Q') return 100
  if (key === 'E') return 101
  const n = parseInt(key)
  return Number.isNaN(n) ? -1 : n - 1
}

function onClick(entry: SkillBarEntry) {
  if (entry.automatic) return
  const idx = entry.triggerIndex ?? keyToIndex(entry.key)
  if (idx < 0) return
  triggerSkill?.value(idx)
}
</script>

<template lang="pug">
.skill-bar
  button.skill-slot(
    v-for="entry in battle.skillBarEntries"
    :key="entry.skill.id"
    :class="{ locked: isLocked(entry), automatic: entry.automatic, evolved: entry.level === 5 }"
    :aria-label="entry.skill.name"
    type="button"
    @click="() => onClick(entry)"
    @mouseenter="(e) => onEnter(e, entry)"
    @mousemove="(e) => onEnter(e, entry)"
    @mouseleave="onLeave"
  )
    span.slot-key {{ entry.key }}
    img.slot-icon(v-if="entry.skill.icon" :src="entry.skill.icon")
    span.slot-fallback(v-else) {{ entry.skill.name.slice(0, 3) }}
    .slot-cd-overlay(v-if="cdPct(entry) > 0" :style="{ height: cdPct(entry) + '%' }")
    span.slot-cd-text(v-if="cdText(entry)") {{ cdText(entry) }}
    span.slot-level(v-if="entry.level") {{ entry.level === 5 ? '★' : entry.level }}
    span.slot-charges(v-if="entry.maxCharges") {{ entry.charges }}/{{ entry.maxCharges }}
</template>

<style lang="scss" scoped>
.skill-bar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  pointer-events: auto;
  user-select: none;
}

.skill-slot {
  padding: 0;
  color: inherit;
  width: 48px;
  height: 48px;
  background: rgba(0, 0, 0, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-size: 12px;
  cursor: pointer;

  &.locked {
    border-color: rgba(255, 50, 50, 0.4);
    opacity: 0.5;
  }
}

.automatic { cursor: help; }
.evolved { border-color: #dfc27f; box-shadow: 0 0 12px #dfc27f44; }
.slot-level, .slot-charges { position: absolute; right: 2px; bottom: -2px; z-index: 2; color: #ffe3a1; font-size: 12px; text-shadow: 0 1px 3px #000; }
.slot-key { z-index: 2; text-shadow: 0 1px 3px #000; }

.slot-key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.slot-icon {
  width: 40px;
  height: 40px;
  object-fit: contain;
  pointer-events: none;
}

.slot-fallback {
  font-size: 9px;
  text-align: center;
}

.slot-cd-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  background: rgba(0, 0, 0, 0.7);
}

.slot-cd-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  font-weight: bold;
  z-index: 1;
  text-shadow: 1px 1px 2px #000;
}
</style>
