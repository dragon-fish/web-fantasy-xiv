import { useBattleStore, type DamageEvent } from '@/stores/battle'
import type { GameScene } from '@/game/game-scene'
import type { Entity } from '@/entity/entity'

export function useStateAdapter(scene: GameScene) {
  const battle = useBattleStore()
  let dmgIdCounter = 0
  const playerDamageBySkill = new Map<string, number>()

  const onDamage = (payload: {
    target: Entity
    amount: number
    source?: Entity
    skill?: { name: string } | null
  }) => {
    if (payload.source?.type === 'player' && payload.amount > 0 && payload.skill?.name) {
      const name = payload.skill.name
      playerDamageBySkill.set(name, (playerDamageBySkill.get(name) ?? 0) + payload.amount)
    }
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2
    const projected = scene.sceneManager.worldToScreen(
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
    const ev: DamageEvent = {
      id: ++dmgIdCounter,
      screenX: sx,
      screenY: sy,
      amount: Math.abs(payload.amount),
      isHeal,
    }
    battle.damageEvents = [...battle.damageEvents, ev]
  }

  const onInvulnerable = (payload: { target: Entity }) => {
    let sx = window.innerWidth / 2
    let sy = window.innerHeight / 2
    const projected = scene.sceneManager.worldToScreen(
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
    const ev: DamageEvent = {
      id: ++dmgIdCounter,
      screenX: sx,
      screenY: sy,
      amount: 0,
      isHeal: false,
      isInvulnerable: true,
    }
    battle.damageEvents = [...battle.damageEvents, ev]
  }

  const onCastStart = (payload: { caster: Entity; skill: { name: string } }) => {
    const name = payload.skill?.name ?? 'Casting...'
    if (payload.caster.type === 'player') {
      battle.playerCast = { name, elapsed: 0, total: 0 }
    } else {
      battle.bossCast = { name, elapsed: 0, total: 0 }
    }
  }

  const onCastComplete = (payload: { caster: Entity }) => {
    if (payload.caster.type === 'player') battle.playerCast = null
    else battle.bossCast = null
  }

  const onCastInterrupted = (payload: { caster: Entity }) => {
    if (payload.caster?.type === 'player') battle.playerCast = null
    else battle.bossCast = null
  }

  scene.bus.on('damage:dealt', onDamage)
  scene.bus.on('damage:invulnerable', onInvulnerable)
  scene.bus.on('skill:cast_start', onCastStart)
  scene.bus.on('skill:cast_complete', onCastComplete)
  scene.bus.on('skill:cast_interrupted', onCastInterrupted)

  function writeFrame(_delta: number): void {
    const player = scene.player
    const boss = scene.bossEntity ?? scene.player
    const shield = scene.buffSystem.getShieldTotal(player)
    const haste = scene.buffSystem.getHaste(player)

    const cdMap = new Map<string, number>()
    for (const entry of scene.skillBarEntries) {
      cdMap.set(entry.skill.id, scene.skillResolver.getCooldown(player.id, entry.skill.id))
    }

    const totalDamage = [...playerDamageBySkill.values()].reduce((s, v) => s + v, 0)
    const elapsed = scene.getCombatElapsed()
    const dps = elapsed && elapsed > 0 ? totalDamage / (elapsed / 1000) : 0
    const sortedSkills = [...playerDamageBySkill.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, total]) => ({
        name,
        total,
        percent: totalDamage > 0 ? total / totalDamage : 0,
      }))

    battle.$patch({
      paused: scene.paused,
      battleOver: scene.battleOver,
      battleResult: scene.battleResult,
      announceText: scene.announceText,
      dialogText: scene.dialogText,
      timelineEntries: scene.timelineEntries,
      currentPhaseInfo: scene.currentPhaseInfo,
      damageLog: scene.damageLog,
      practiceMode: scene.practiceMode,
      skillBarEntries: scene.skillBarEntries,
      buffDefs: scene.buffDefs,
      combatElapsed: elapsed,
      playerHp: {
        current: player.hp,
        max: player.maxHp,
        shield: shield > 0 ? shield : undefined,
      },
      playerMp: player.maxMp > 0 ? { current: player.mp, max: player.maxMp } : battle.playerMp,
      bossHp: { current: boss.hp, max: boss.maxHp },
      gcdState: { remaining: player.gcdTimer, total: player.gcdDuration },
      playerCast: player.casting
        ? {
            name: battle.playerCast?.name ?? '',
            elapsed: player.casting.elapsed,
            total: player.casting.castTime,
          }
        : battle.playerCast,
      bossCast: boss.casting
        ? {
            name: battle.bossCast?.name ?? '',
            elapsed: boss.casting.elapsed,
            total: boss.casting.castTime,
          }
        : null,
      buffs: player.buffs.map((inst) => {
        const def = scene.buffSystem.getDef(inst.defId)
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
      }),
      cooldowns: cdMap,
      tooltipContext: { gcdDuration: player.gcdDuration, haste },
      debugPlayerPos: { x: player.position.x, y: player.position.y },
      dpsMeter: { skills: sortedSkills, totalDamage, dps },
    })
  }

  function dispose(): void {
    scene.bus.off('damage:dealt', onDamage)
    scene.bus.off('damage:invulnerable', onInvulnerable)
    scene.bus.off('skill:cast_start', onCastStart)
    scene.bus.off('skill:cast_complete', onCastComplete)
    scene.bus.off('skill:cast_interrupted', onCastInterrupted)
    playerDamageBySkill.clear()
    battle.$reset()
  }

  return { writeFrame, dispose }
}
