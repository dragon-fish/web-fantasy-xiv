<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core'
import { useBattleStore } from '@/stores/battle'
import { getActiveScene } from '@/game/battle-runner'

const battle = useBattleStore()
const collapsed = useLocalStorage('xiv-enemy-list-collapsed', false)
const pct = (hp: number, max: number) => `${Math.max(0, Math.min(1, hp / Math.max(1, max))) * 100}%`
const letter = (i: number) => String.fromCharCode(65 + i)
const select = (id: string) => getActiveScene()?.selectEnemy(id)
</script>

<template lang="pug">
.enemy-list(v-if="battle.enemies.length")
  .enemy-list__header(@click="collapsed = !collapsed")
    span 敌对列表
    span {{ collapsed ? '▸' : '▾' }}
  template(v-if="!collapsed")
    .enemy-list__row(
      v-for="(e, i) in battle.enemies"
      :key="e.id"
      :class="{ 'is-selected': e.selected, 'is-faded': !e.targetable }"
      @click="select(e.id)"
    )
      //- Your enmity on it (FFXIV): green low, yellow mid, orange high, red = it is on you
      .enemy-list__gem(:class="e.enmity ? `is-${e.enmity}` : 'is-none'")
      .enemy-list__main
        .enemy-list__head
          span.enemy-list__letter {{ letter(i) }}
          span.enemy-list__name {{ e.name }}
          span.enemy-list__cast-name(v-if="e.cast") {{ e.cast.name }}
        .enemy-list__bars
          .enemy-list__hp
            .enemy-list__hp-fill(:style="{ width: pct(e.hp, e.maxHp) }")
          .enemy-list__cast(v-if="e.cast")
            .enemy-list__cast-fill(:style="{ width: `${e.cast.progress * 100}%` }")
</template>

<style lang="scss" scoped>
.enemy-list {
  position: absolute;
  right: 20px;
  top: 32%;
  width: 230px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
  user-select: none;
  font-size: 12px;
  color: #f4ead6;
  text-shadow: 0 0 2px #000, 0 1px 2px #000;
}

.enemy-list__header {
  display: flex;
  justify-content: space-between;
  padding: 1px 6px;
  color: #f3d58a;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
}

.enemy-list__row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px 3px 4px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.12) 75%, transparent);
  cursor: pointer;

  &:hover {
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03) 75%, transparent);
  }

  &.is-selected {
    background: linear-gradient(90deg, rgba(196, 150, 80, 0.55), rgba(160, 120, 60, 0.18) 75%, transparent);
    box-shadow: inset 0 0 0 1px rgba(255, 220, 150, 0.55);
  }

  // Untargetable: listed so its cast can be watched, but it can't be picked
  &.is-faded {
    opacity: 0.45;
    cursor: default;
  }
}

.enemy-list__gem {
  flex: none;
  width: 13px;
  height: 13px;
  filter: drop-shadow(0 0 1px #000) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8));

  &.is-low {
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #c8fff0, #2fc9a8 45%, #0d6f5c);
  }
  &.is-mid {
    clip-path: polygon(50% 4%, 96% 92%, 4% 92%);
    background: radial-gradient(circle at 50% 40%, #fff6b8, #f2d23a 50%, #a8800c);
  }
  &.is-high {
    clip-path: polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%);
    background: radial-gradient(circle at 45% 35%, #ffe0b0, #f08a2a 50%, #9c4a0c);
  }
  &.is-top {
    border-radius: 3px;
    background: radial-gradient(circle at 35% 30%, #ffd0c8, #e84a3a 50%, #8c1610);
  }
  &.is-none {
    visibility: hidden;
  }
}

.enemy-list__main {
  flex: 1;
  min-width: 0;
}

.enemy-list__head {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 15px;
}

.enemy-list__letter {
  flex: none;
  width: 13px;
  height: 13px;
  line-height: 13px;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  color: #2a2418;
  text-shadow: none;
  background: linear-gradient(180deg, #fffaf0, #d6ccb4);
  border: 1px solid #6b5a3a;
  border-radius: 2px;
}

.enemy-list__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.enemy-list__cast-name {
  flex: none;
  max-width: 50%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #ffe6b8;
}

.enemy-list__bars {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.enemy-list__hp {
  flex: none;
  width: 72px;
  height: 5px;
  background: rgba(10, 10, 10, 0.85);
  border: 1px solid rgba(240, 230, 210, 0.6);
  border-radius: 3px;
  overflow: hidden;
}

.enemy-list__hp-fill {
  height: 100%;
  background: linear-gradient(180deg, #ffffff, #c9c4ba);
}

.enemy-list__cast {
  flex: 1;
  height: 5px;
  background: rgba(10, 10, 10, 0.85);
  border: 1px solid rgba(255, 220, 160, 0.55);
  border-radius: 3px;
  overflow: hidden;
}

.enemy-list__cast-fill {
  height: 100%;
  background: linear-gradient(180deg, #ffe2a0, #e09a3a);
}
</style>
