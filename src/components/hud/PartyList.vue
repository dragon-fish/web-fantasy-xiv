<script setup lang="ts">
import { useBattleStore } from '@/stores/battle'
import { getActiveScene } from '@/game/battle-runner'

const battle = useBattleStore()
const pct = (hp: number, max: number) => `${Math.max(0, Math.min(1, hp / Math.max(1, max))) * 100}%`
const select = (id: string) => getActiveScene()?.selectAlly(id)
</script>

<template lang="pug">
.party-list(v-if="battle.party.length")
  .party-list__row(
    v-for="(m, i) in battle.party"
    :key="m.id"
    :class="{ 'is-selected': m.selected, 'is-down': !m.alive, 'is-player': m.isPlayer }"
    :title="`F${i + 1}`"
    @click="select(m.id)"
  )
    .party-list__slot {{ i + 1 }}
    img.party-list__icon(v-if="m.icon" :src="m.icon" alt="")
    .party-list__main
      .party-list__head
        span.party-list__name {{ m.name }}
        span.party-list__hp.tabular-nums {{ m.alive ? m.hp : '倒地' }}
      .party-list__bar
        .party-list__bar-fill(:style="{ width: pct(m.hp, m.maxHp) }")
      .party-list__cast(v-if="m.cast")
        .party-list__cast-fill(:style="{ width: `${m.cast.progress * 100}%` }")
        span.party-list__cast-name {{ m.cast.name }}
    .party-list__buffs
      img.party-list__buff(v-for="(b, k) in m.buffs" :key="k" :src="b.icon" :alt="b.name" :title="b.name")
</template>

<style lang="scss" scoped>
.party-list {
  position: absolute;
  left: 12px;
  top: 46%;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: auto;
  user-select: none;
  font-size: 12px;
}

.party-list__row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  cursor: pointer;

  &.is-selected {
    border-color: rgba(120, 180, 255, 0.9);
    box-shadow: 0 0 6px rgba(80, 150, 255, 0.6);
  }

  &.is-down {
    filter: grayscale(1);
    opacity: 0.7;
  }
}

.party-list__slot {
  width: 10px;
  color: #888;
  font-size: 10px;
}

.party-list__icon {
  width: 22px;
  height: 22px;
}

.party-list__main {
  flex: 1;
  min-width: 0;
}

.party-list__head {
  display: flex;
  justify-content: space-between;
  color: #eee;
  line-height: 14px;
}

.party-list__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.party-list__hp {
  color: #cfe;
}

.party-list__bar {
  height: 5px;
  margin-top: 2px;
  background: #2b2018;
  border-radius: 3px;
  overflow: hidden;
}

.party-list__bar-fill {
  height: 100%;
  background: linear-gradient(180deg, #9ff2a8, #3fae58);
}

.party-list__cast {
  position: relative;
  height: 10px;
  margin-top: 2px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
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
  line-height: 10px;
  color: #fff;
}

.party-list__buffs {
  display: flex;
  gap: 1px;
}

.party-list__buff {
  width: 16px;
  height: 20px;
}
</style>
