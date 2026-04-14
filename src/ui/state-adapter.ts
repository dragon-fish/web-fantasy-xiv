import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SceneManager } from '@/renderer/scene-manager'
import type { BuffSystem } from '@/combat/buff'
import * as state from './state'

let dmgIdCounter = 0
const playerDamageBySkill = new Map<string, number>()

export interface StateAdapterDeps {
  bus: EventBus
  sceneManager: SceneManager
  buffSystem: BuffSystem
}

export function createStateAdapter(deps: StateAdapterDeps) {
  const { bus, sceneManager, buffSystem } = deps

  const onDamage = (payload: { target: Entity; amount: number; source?: Entity; skill?: { name: string } | null }) => {
    // Accumulate player damage for DPS meter
    if (payload.source?.type === 'player' && payload.amount > 0 && payload.skill?.name) {
      const name = payload.skill.name
      playerDamageBySkill.set(name, (playerDamageBySkill.get(name) ?? 0) + payload.amount)
    }
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2

    const projected = sceneManager.worldToScreen(
      payload.target.position.x,
      payload.target.position.y,
      2,
    )
    if (projected) {
      sx = projected.x
      sy = projected.y
    }

    sx += (Math.random() - 0.5) * 40
    sy += (Math.random() - 0.5) * 20
    const isHeal = payload.amount < 0

    state.damageEvents.value = [
      ...state.damageEvents.value,
      { id: ++dmgIdCounter, screenX: sx, screenY: sy, amount: Math.abs(payload.amount), isHeal },
    ]
  }

  const onCastStart = (payload: { caster: Entity; skill: { name: string } }) => {
    const name = payload.skill?.name ?? 'Casting...'
    if (payload.caster.type === 'player') {
      state.playerCast.value = { name, elapsed: 0, total: 0 }
    } else {
      state.bossCast.value = { name, elapsed: 0, total: 0 }
    }
  }

  const onCastComplete = (payload: { caster: Entity }) => {
    if (payload.caster.type === 'player') state.playerCast.value = null
    else state.bossCast.value = null
  }

  const onCastInterrupted = (payload: { caster: Entity }) => {
    if (payload.caster?.type === 'player') state.playerCast.value = null
    else state.bossCast.value = null
  }

  bus.on('damage:dealt', onDamage)
  bus.on('skill:cast_start', onCastStart)
  bus.on('skill:cast_complete', onCastComplete)
  bus.on('skill:cast_interrupted', onCastInterrupted)

  function writeFrame(player: Entity, boss: Entity, getCooldown: (skillId: string) => number): void {
    const shield = buffSystem.getShieldTotal(player)
    state.playerHp.value = { current: player.hp, max: player.maxHp, shield: shield > 0 ? shield : undefined }
    if (player.maxMp > 0) state.playerMp.value = { current: player.mp, max: player.maxMp }
    state.bossHp.value = { current: boss.hp, max: boss.maxHp }
    state.gcdState.value = { remaining: player.gcdTimer, total: player.gcdDuration }

    if (player.casting) {
      state.playerCast.value = {
        name: state.playerCast.value?.name ?? '',
        elapsed: player.casting.elapsed,
        total: player.casting.castTime,
      }
    }
    if (boss.casting) {
      state.bossCast.value = {
        name: state.bossCast.value?.name ?? '',
        elapsed: boss.casting.elapsed,
        total: boss.casting.castTime,
      }
    } else {
      state.bossCast.value = null
    }

    state.buffs.value = player.buffs.map((inst) => {
      const def = buffSystem.getDef(inst.defId)
      return {
        defId: inst.defId,
        name: def?.name ?? inst.defId,
        description: def?.description,
        icon: def?.icon,
        iconPerStack: def?.iconPerStack,
        type: (def?.type ?? 'buff') as 'buff' | 'debuff',
        stacks: inst.stacks,
        remaining: inst.remaining,
        effects: def?.effects ?? [],
      }
    })

    const cdMap = new Map<string, number>()
    for (const entry of state.skillBarEntries.value) {
      cdMap.set(entry.skill.id, getCooldown(entry.skill.id))
    }
    state.cooldowns.value = cdMap

    state.debugPlayerPos.value = { x: player.position.x, y: player.position.y }

    // Tooltip context: actual GCD + haste for real-time tooltip display
    const haste = buffSystem.getHaste(player)
    state.tooltipContext.value = { gcdDuration: player.gcdDuration, haste }

    // DPS meter
    const totalDamage = [...playerDamageBySkill.values()].reduce((s, v) => s + v, 0)
    const elapsed = state.combatElapsed.value
    const dps = elapsed && elapsed > 0 ? totalDamage / (elapsed / 1000) : 0
    const sorted = [...playerDamageBySkill.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    const skills = sorted.map(([name, total]) => ({
      name,
      total,
      percent: totalDamage > 0 ? total / totalDamage : 0,
    }))
    state.dpsMeter.value = { skills, totalDamage, dps }
  }

  function dispose(): void {
    bus.off('damage:dealt', onDamage)
    bus.off('skill:cast_start', onCastStart)
    bus.off('skill:cast_complete', onCastComplete)
    bus.off('skill:cast_interrupted', onCastInterrupted)
    playerDamageBySkill.clear()
    state.resetState()
  }

  return { writeFrame, dispose }
}
