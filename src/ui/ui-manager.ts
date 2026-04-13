// src/ui/ui-manager.ts
import type { EventBus } from '@/core/event-bus'
import type { Entity } from '@/entity/entity'
import type { SkillDef } from '@/core/types'
import { HpBar } from './hp-bar'
import { SkillBar } from './skill-bar'
import { CastBar } from './cast-bar'
import { DamageFloater } from './damage-floater'
import { GCD_DURATION } from '@/skill/skill-resolver'

export class UIManager {
  private playerHp: HpBar
  private bossHp: HpBar
  private skillBar: SkillBar
  private castBar: CastBar
  private damageFloater: DamageFloater

  constructor(
    root: HTMLDivElement,
    bus: EventBus,
    skills: SkillDef[],
  ) {
    DamageFloater.injectStyles()

    this.bossHp = new HpBar(root, '', '#cc3333', 'top')
    this.playerHp = new HpBar(root, '', '#3388cc', 'bottom')
    this.skillBar = new SkillBar(root, skills)
    this.castBar = new CastBar(root)
    this.damageFloater = new DamageFloater(root)

    bus.on('damage:dealt', (payload: { target: Entity; amount: number }) => {
      // Simple: spawn at center of screen (proper world-to-screen in future)
      const x = window.innerWidth / 2 + (Math.random() - 0.5) * 100
      const y = window.innerHeight / 2 + (Math.random() - 0.5) * 50
      this.damageFloater.spawn(x, y, payload.amount, false)
    })

    bus.on('skill:cast_start', (payload: { skill: { name: string } }) => {
      this.castBar.show(payload.skill?.name ?? 'Casting...')
    })

    bus.on('skill:cast_complete', () => {
      this.castBar.hide()
    })

    bus.on('skill:cast_interrupted', () => {
      this.castBar.hide()
    })
  }

  update(player: Entity, boss: Entity, getCooldown: (skillId: string) => number): void {
    this.playerHp.update(player.hp, player.maxHp)
    this.bossHp.update(boss.hp, boss.maxHp)
    this.skillBar.update(player.gcdTimer, GCD_DURATION, getCooldown)

    if (player.casting) {
      this.castBar.updateProgress(player.casting.elapsed, player.casting.castTime)
    }
  }
}
