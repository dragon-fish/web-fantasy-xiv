import type { Entity } from '@/entity/entity'
import type { BuffSystem } from '@/combat/buff'
import type { DisplacementAnimator } from '@/game/displacement-animator'
import { COMMON_BUFFS } from '@/jobs/commons/buffs'
import type { BuffDef } from '@/core/types'

export const DASH_GUARD: BuffDef = {
  ...COMMON_BUFFS.damage_immunity!, id: 'sv_dash_guard', name: '前冲步',
  description: '前冲起始的短暂无敌。', duration: 250, durationGrace: 0,
}
export class Dash {
  charges = 1
  max = 1
  cooldown = 12000
  remaining = 0
  constructor(private player: Entity, private buffs: BuffSystem, private displacer: DisplacementAnimator) {}
  configure(max: number, cooldown: number) {
    this.charges = Math.min(max, this.charges + Math.max(0, max - this.max))
    this.remaining *= cooldown / this.cooldown
    this.max = max
    this.cooldown = cooldown
  }
  use(): boolean {
    if (!this.player.alive || this.charges <= 0 || this.displacer.isAnimating(this.player.id) || this.buffs.isStunned(this.player)) return false
    if (this.charges === this.max) this.remaining = this.cooldown
    this.charges--
    this.buffs.applyBuff(this.player, DASH_GUARD, this.player.id)
    const rad = this.player.facing * Math.PI / 180
    this.displacer.start(this.player, this.player.position.x + Math.sin(rad) * 6, this.player.position.y + Math.cos(rad) * 6, 200)
    return true
  }
  tick(dt: number) {
    if (this.charges >= this.max) return
    this.remaining -= dt
    while (this.remaining <= 0 && this.charges < this.max) {
      this.charges++
      this.remaining += this.cooldown
    }
    if (this.charges === this.max) this.remaining = 0
  }
}
