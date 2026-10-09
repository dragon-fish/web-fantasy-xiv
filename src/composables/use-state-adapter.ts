import { useBattleStore } from '@/stores/battle'
import type { GameScene } from '@/game/game-scene'
import type { Entity } from '@/entity/entity'
import type { BuffDef } from '@/core/types'
import { pickControlStatus } from '@/game/control-status'
import { REVIVE_BUFFS, type ReviveTier } from '@/game/player-revive'

/** How long the new Weakness / Brink icon flashes over the head after a revive */
const REVIVE_FLASH_MS = 2600
/** Status fly text lifetime and how many may float at once */
const POPUP_MS = 1600
const MAX_POPUPS = 6

export function useStateAdapter(scene: GameScene) {
  const battle = useBattleStore()
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

  let reviveFlash: { icon?: string; name: string; until: number } | null = null
  const onRevived = ({ tier }: { tier: ReviveTier }) => {
    const def = REVIVE_BUFFS[tier]
    reviveFlash = { icon: def.icon, name: def.name, until: performance.now() + REVIVE_FLASH_MS }
  }

  let popupKey = 0
  let popups: { key: number; icon?: string; name: string; gained: boolean; debuff: boolean; born: number }[] = []
  const pushPopup = (target: Entity, buff: BuffDef | undefined, gained: boolean) => {
    if (!buff || buff.hidden || target.id !== scene.player.id) return
    popups.push({ key: ++popupKey, icon: buff.icon, name: buff.name, gained, debuff: buff.type === 'debuff', born: performance.now() })
    if (popups.length > MAX_POPUPS) popups = popups.slice(-MAX_POPUPS)
  }
  const onBuffApplied = ({ target, buff }: { target: Entity; buff?: BuffDef }) => pushPopup(target, buff, true)
  const onBuffRemoved = ({ target, buff }: { target: Entity; buff?: BuffDef }) => pushPopup(target, buff, false)

  /** Head-anchored status; null when there is nothing to say */
  function overhead(player: Entity) {
    const now = performance.now()
    const control = player.alive ? pickControlStatus(player.buffs, id => scene.buffSystem.getDef(id)) : null
    if (reviveFlash && now > reviveFlash.until) reviveFlash = null
    popups = popups.filter(p => now - p.born < POPUP_MS)
    if (!control && !reviveFlash && !popups.length) return null
    const height = scene.entityRenderer.getHeight?.(player) ?? 1.8
    const pos = scene.sceneManager.worldToCss(player.position.x, player.position.y, height + 0.6)
    if (!pos) return null
    return {
      ...pos,
      control,
      flash: reviveFlash && { icon: reviveFlash.icon, name: reviveFlash.name },
      popups: popups.map(({ born, ...p }) => ({ ...p, t: (now - born) / POPUP_MS })),
    }
  }

  scene.bus.on('damage:dealt', onDamage)
  scene.bus.on('player:revived', onRevived)
  scene.bus.on('buff:applied', onBuffApplied)
  scene.bus.on('buff:removed', onBuffRemoved)
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
      qte: scene.qte ? { ...scene.qte } : null,
      overhead: overhead(player),
      gaugeArt: scene.jobGaugeArt,
      buffStacks: Object.fromEntries(player.buffs.map((b) => [b.defId, b.stacks])),
      gauge: scene.jobGauge.map((item) => {
        const stacks = scene.buffSystem.getStacks(player, item.buffId)
        return item.kind === 'stacks'
          ? { kind: 'stacks' as const, buffId: item.buffId, label: item.label, count: stacks, max: item.max, shape: item.shape, color: item.color }
          : { kind: 'timer' as const, buffId: item.buffId, label: item.label, color: item.color,
              progress: stacks >= item.max ? 1 : scene.playerDriver.passiveProgress(item.buffId) }
      }),
      timelineEntries: scene.timelineEntries,
      currentPhaseInfo: scene.currentPhaseInfo,
      damageLog: scene.damageLog,
      practiceMode: scene.practiceMode,
      // Charge-based skills: the bar reads live charge counts off the entry
      skillBarEntries: scene.skillBarEntries.map((e) => (e.skill.charges ?? 1) > 1
        ? { ...e, charges: scene.skillResolver.getCharges(player.id, e.skill), maxCharges: e.skill.charges }
        : e),
      buffDefs: scene.buffDefs,
      combatElapsed: elapsed,
      playerHp: {
        feedback: scene.entityFeedback.healthState(player),
        current: player.hp,
        max: scene.buffSystem.getMaxHp(player),
        shield: shield > 0 ? shield : undefined,
      },
      playerMp: player.maxMp > 0 ? { current: player.mp, max: player.maxMp } : battle.playerMp,
      bossHp: { current: boss.hp, max: scene.buffSystem.getMaxHp(boss), feedback: scene.entityFeedback.healthState(boss) },
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
      buffs: player.buffs.filter((inst) => !scene.buffSystem.getDef(inst.defId)?.hidden).map((inst) => {
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
    scene.bus.off('player:revived', onRevived)
    scene.bus.off('buff:applied', onBuffApplied)
    scene.bus.off('buff:removed', onBuffRemoved)
    scene.bus.off('skill:cast_start', onCastStart)
    scene.bus.off('skill:cast_complete', onCastComplete)
    scene.bus.off('skill:cast_interrupted', onCastInterrupted)
    playerDamageBySkill.clear()
    battle.$reset()
  }

  return { writeFrame, dispose }
}
