<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'
import { getActiveScene } from '@/game/battle-runner'

const battle = useBattleStore()
const pct = (hp: number, max: number) => `${Math.max(0, Math.min(1, hp / Math.max(1, max))) * 100}%`
const select = (id: string) => getActiveScene()?.selectAlly(id)
/** Enmity bar colour by standing: about to take aggro, or safe */
const enmityClass = (ratio: number) => (ratio >= 0.85 ? 'is-close' : 'is-safe')
</script>

<template lang="pug">
.party-list(v-if="battle.party.length")
  .party-list__title 轻锐小队
  .party-list__row(
    v-for="(m, i) in battle.party"
    :key="m.id"
    :class="{ 'is-selected': m.selected, 'is-down': !m.alive }"
    :title="`F${i + 1}`"
    @click="select(m.id)"
  )
    //- Enmity on your current enemy (FFXIV): the holder reads 引战, the others their rank
    .party-list__enmity
      template(v-if="m.enmity")
        span.party-list__enmity-label(v-if="m.enmity.rank === 1") 引战
        template(v-else)
          span.party-list__enmity-rank {{ m.enmity.rank }}
          .party-list__enmity-bar
            .party-list__enmity-fill(:class="enmityClass(m.enmity.ratio)" :style="{ width: `${m.enmity.ratio * 100}%` }")
    .party-list__icon
      img(v-if="m.icon" :src="m.icon" alt="")
    .party-list__main
      .party-list__head
        span.party-list__slot {{ i + 1 }}
        span.party-list__name {{ m.isPlayer ? `Player (${m.name})` : m.name }}
        span.party-list__hp.tabular-nums {{ m.alive ? m.hp : '' }}
      .party-list__bar
        .party-list__bar-fill(:style="{ width: pct(m.hp, m.maxHp) }")
      //- The cast line is always laid out so rows keep their height when casts come and go
      .party-list__cast(:class="{ 'is-idle': !m.cast }")
        template(v-if="m.cast")
          .party-list__cast-fill(:style="{ width: `${m.cast.progress * 100}%` }")
          span.party-list__cast-name {{ m.cast.name }}
    .party-list__buffs
      img.party-list__buff(v-for="(b, k) in m.buffs" :key="k" :src="b.icon" :alt="b.name" :title="b.name")
</template>

<style lang="scss" scoped>
.party-list {
  position: absolute;
  left: 12px;
  top: 44%;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
  user-select: none;
  font-size: 12px;
  color: #eef6ff;
  text-shadow: 0 0 2px #000, 0 1px 2px #000;
}

.party-list__title {
  margin-left: 30px;
  color: #f3d58a;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1px;
}

.party-list__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 0;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &.is-selected {
    background: rgba(120, 180, 255, 0.16);
    box-shadow: inset 0 0 0 1px rgba(140, 195, 255, 0.7);
  }

  &.is-down {
    filter: grayscale(1);
    opacity: 0.65;
  }
}

.party-list__enmity {
  width: 28px;
  height: 36px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  padding-bottom: 2px;
}

.party-list__enmity-label {
  color: #ffd2c8;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 8px;
}

.party-list__enmity-rank {
  font-size: 12px;
  font-weight: 700;
  line-height: 12px;
}

.party-list__enmity-bar {
  width: 24px;
  height: 4px;
  margin-top: 1px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 2px;
  overflow: hidden;
}

.party-list__enmity-fill {
  height: 100%;

  &.is-close { background: #ffc23a; }
  &.is-safe { background: #59c8ff; }
}

.party-list__icon {
  width: 36px;
  height: 36px;
  flex: none;

  img {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
  }
}

.party-list__main {
  flex: 1;
  min-width: 0;
}

.party-list__head {
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 16px;
}

.party-list__slot {
  flex: none;
  width: 14px;
  height: 14px;
  line-height: 14px;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  color: #2a2418;
  text-shadow: none;
  background: linear-gradient(180deg, #fffaf0, #d6ccb4);
  border: 1px solid #6b5a3a;
  border-radius: 2px;
}

.party-list__name {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.party-list__hp {
  font-size: 11px;
  color: #cfe9ff;
}

.party-list__bar {
  height: 5px;
  margin-top: 2px;
  background: rgba(10, 20, 30, 0.85);
  border: 1px solid rgba(220, 240, 255, 0.55);
  border-radius: 3px;
  overflow: hidden;
}

.party-list__bar-fill {
  height: 100%;
  background: linear-gradient(180deg, #c8f4ff, #4cc3ea);
}

.party-list__cast {
  position: relative;
  height: 9px;
  margin-top: 2px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;

  &.is-idle {
    visibility: hidden;
  }
}

.party-list__cast-fill {
  height: 100%;
  background: rgba(255, 190, 90, 0.7);
}

.party-list__cast-name {
  position: absolute;
  inset: 0;
  padding-left: 3px;
  font-size: 9px;
  line-height: 9px;
}

.party-list__buffs {
  display: flex;
  gap: 1px;
  min-width: 34px;
}

.party-list__buff {
  width: 16px;
  height: 20px;
}
</style>
