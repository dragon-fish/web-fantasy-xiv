// src/ui/ui-manager.ts
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import type { SceneManager } from '@/renderer/scene-manager'
import { HpBar } from './hp-bar'
import { SkillBar } from './skill-bar'
import { CastBar } from './cast-bar'
import { DamageFloater } from './damage-floater'
import { GCD_DURATION } from '@/skill/skill-resolver'

export interface SkillBarEntry {
  key: string     // display label, e.g. "1", "Q"
  skill: SkillDef
}

export class UIManager {
  private playerHp: HpBar
  private bossHp: HpBar
  private skillBar: SkillBar
  private playerCastBar: CastBar
  private bossCastBar: CastBar
  private damageFloater: DamageFloater
  private sceneManager: SceneManager | null = null

  constructor(
    root: HTMLDivElement,
    bus: EventBus,
    entries: SkillBarEntry[],
  ) {
    DamageFloater.injectStyles()

    this.bossHp = new HpBar(root, '', '#cc3333', 'top')
    this.playerHp = new HpBar(root, '', '#3388cc', 'bottom')
    this.skillBar = new SkillBar(root, entries)
    this.playerCastBar = new CastBar(root, {
      position: 'bottom: 120px',
      color: 'linear-gradient(90deg, #4a9eff, #82c0ff)',
    })
    this.bossCastBar = new CastBar(root, {
      position: 'top: 50px',
      color: 'linear-gradient(90deg, #cc5533, #ff7744)',
    })
    this.damageFloater = new DamageFloater(root)

    bus.on('damage:dealt', (payload: { target: Entity; amount: number }) => {
      let sx = window.innerWidth / 2
      let sy = window.innerHeight / 2

      if (this.sceneManager) {
        const projected = this.sceneManager.worldToScreen(
          payload.target.position.x,
          payload.target.position.y,
          2, // above head
        )
        if (projected) {
          sx = projected.x
          sy = projected.y
        }
      }

      // Add slight random offset so overlapping numbers are readable
      sx += (Math.random() - 0.5) * 40
      sy += (Math.random() - 0.5) * 20
      this.damageFloater.spawn(sx, sy, payload.amount, false)
    })

    bus.on('skill:cast_start', (payload: { caster: Entity; skill: { name: string } }) => {
      const bar = payload.caster.type === 'player' ? this.playerCastBar : this.bossCastBar
      bar.show(payload.skill?.name ?? 'Casting...')
    })

    bus.on('skill:cast_complete', (payload: { caster: Entity }) => {
      if (payload.caster.type === 'player') {
        this.playerCastBar.hide()
      } else {
        this.bossCastBar.hide()
      }
    })

    bus.on('skill:cast_interrupted', (payload: { caster: Entity }) => {
      if (payload.caster?.type === 'player') {
        this.playerCastBar.hide()
      } else {
        this.bossCastBar.hide()
      }
    })
  }

  /** Bind to SceneManager for world-to-screen projection (damage floater positioning) */
  bindScene(sceneManager: SceneManager): void {
    this.sceneManager = sceneManager
  }

  update(player: Entity, boss: Entity, getCooldown: (skillId: string) => number): void {
    this.playerHp.update(player.hp, player.maxHp)
    this.bossHp.update(boss.hp, boss.maxHp)
    this.skillBar.update(player.gcdTimer, GCD_DURATION, getCooldown)

    if (player.casting) {
      this.playerCastBar.updateProgress(player.casting.elapsed, player.casting.castTime)
    }
    if (boss.casting) {
      this.bossCastBar.updateProgress(boss.casting.elapsed, boss.casting.castTime)
    } else {
      this.bossCastBar.hide()
    }
  }
}
