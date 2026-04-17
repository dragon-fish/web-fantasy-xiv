<script setup lang="ts">
import { computed } from 'vue'
import { useBattleStore } from '@/stores/battle'
import { useTooltip } from '@/composables/use-tooltip'
import { buildBuffTooltip } from './tooltip-builders'
import type { BuffSnapshot } from '@/stores/battle'

const battle = useBattleStore()
const tooltip = useTooltip()

interface BuffView {
  buff: BuffSnapshot
  isDebuff: boolean
  borderColor: string
  arrowColor: string
  iconSrc: string | null
  showStackText: boolean
  remainingLabel: string
}

function resolveBuffIcon(buff: BuffSnapshot): { src: string | null; showStackText: boolean } {
  const { icon, iconPerStack, stacks } = buff

  if (iconPerStack) {
    const exact = iconPerStack[stacks]
    if (exact) return { src: exact, showStackText: false }
    const fallback = iconPerStack[0]
    if (fallback) return { src: fallback, showStackText: stacks > 1 }
  }

  if (icon) return { src: icon, showStackText: stacks > 1 }

  return { src: null, showStackText: false }
}

const buffViews = computed<BuffView[]>(() =>
  battle.buffs.map((buff) => {
    const isDebuff = buff.type === 'debuff'
    const { src: iconSrc, showStackText } = resolveBuffIcon(buff)
    return {
      buff,
      isDebuff,
      borderColor: isDebuff ? 'rgba(255,80,80,0.4)' : 'rgba(80,255,80,0.4)',
      arrowColor: isDebuff ? '#ff6666' : '#66ff66',
      iconSrc,
      showStackText,
      remainingLabel:
        buff.remaining > 0 ? (buff.remaining / 1000).toFixed(0) : '\u221E',
    }
  })
)

function onHover(buff: BuffSnapshot, event: MouseEvent) {
  tooltip.show(buildBuffTooltip(buff as any), event.clientX, event.clientY)
}

function onLeave() {
  tooltip.hide()
}
</script>

<template lang="pug">
.buff-bar
  .buff-icon(
    v-for="view in buffViews"
    :key="view.buff.defId"
    @mouseenter="onHover(view.buff, $event)"
    @mousemove="onHover(view.buff, $event)"
    @mouseleave="onLeave"
  )
    .buff-icon__box(
      :style="{ background: view.iconSrc ? 'transparent' : 'rgba(0,0,0,0.7)', border: view.iconSrc ? 'none' : `1px solid ${view.borderColor}` }"
    )
      img.buff-icon__img(v-if="view.iconSrc" :src="view.iconSrc")
      template(v-else)
        span.buff-icon__arrow(:style="{ color: view.arrowColor }")
          | {{ view.isDebuff ? '▼' : '▲' }}
        span.buff-icon__stack(v-if="view.buff.stacks > 1") {{ view.buff.stacks }}
      span.buff-icon__stack(v-if="view.iconSrc && view.showStackText") {{ view.buff.stacks }}
    span.buff-icon__duration {{ view.remainingLabel }}
</template>

<style lang="scss" scoped>
.buff-bar {
  position: absolute;
  bottom: 145px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  pointer-events: none;
}

.buff-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: auto;
  cursor: default;
}

.buff-icon__box {
  width: 28px;
  height: 28px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.buff-icon__img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  pointer-events: none;
}

.buff-icon__arrow {
  font-size: 12px;
  line-height: 1;
}

.buff-icon__stack {
  position: absolute;
  top: -1px;
  right: 1px;
  font-size: 9px;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 0 2px #000, 0 0 2px #000;
  line-height: 1;
}

.buff-icon__duration {
  font-size: 9px;
  color: #aaa;
  line-height: 1;
  text-align: center;
}
</style>
