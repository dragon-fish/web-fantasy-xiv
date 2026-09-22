import type { AoeShapeDef, ArenaShape, Vec2 } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { SurvivorDeps } from './runtime'

export const BOSS_ARENA_RADIUS = 14
export interface BossCast { name: string; hint: string; elapsed: number; total: number }

/** Uses the shared zone manager for both orange telegraphs and real damage resolution. */
export class SurvivorBoss {
  readonly entity: Entity
  readonly name: string
  cast: BossCast | null = null
  private originalShape: ArenaShape
  private time = 0
  private nextCast = 1000
  private step = 0
  private puddles = 0
  private nextPuddle = 0
  constructor(readonly stage: 1 | 2, private deps: SurvivorDeps) {
    this.name = stage === 1 ? '以太守门人' : '终末裁决者'
    this.originalShape = deps.arena.def.shape
    deps.arena.def.shape = { type: 'circle', radius: BOSS_ARENA_RADIUS }
    deps.displacer.cancel(deps.player.id)
    deps.player.position.x = 0
    deps.player.position.y = -9
    this.entity = deps.entityMgr.create({
      id: `sv_boss_${stage}`, type: 'boss', group: 'sentinel', position: { x: 0, y: 0, z: 0 },
      hp: stage === 1 ? 18000 : 50000, attack: stage === 1 ? 120 : 180, speed: 0, size: 1.7,
    })
  }
  tick(dt: number) {
    this.time += dt
    if (this.cast) {
      this.cast.elapsed = Math.min(this.cast.total, this.cast.elapsed + dt)
      if (this.cast.elapsed >= this.cast.total) this.cast = null
    }
    if (this.puddles && this.time >= this.nextPuddle) {
      this.zone({ type: 'circle', radius: 3 }, 1700, 1.5, this.deps.player.position)
      this.puddles--
      this.nextPuddle = this.time + 650
    }
    if (this.time < this.nextCast) return
    const phase = this.step++ % (this.stage === 2 ? 5 : 4)
    const fast = this.stage === 2 && this.entity.hp < this.entity.maxHp / 2
    const duration = fast ? 1700 : 2400
    const position = this.entity.position
    let name: string, hint: string
    if (phase === 0) {
      name = '钢铁裁决'; hint = '远离 Boss · 圆形范围攻击'
      this.zone({ type: 'circle', radius: 6 }, duration, 3)
    } else if (phase === 1) {
      name = '月环裁决'; hint = '靠近 Boss · 内圈安全'
      this.zone({ type: 'ring', innerRadius: 5, outerRadius: 20 }, duration, 3)
    } else if (phase === 2) {
      name = '追踪落雷'; hint = '持续移动 · 落点锁定后离开橙圈'
      this.zone({ type: 'circle', radius: 3 }, 1700, 1.5, this.deps.player.position)
      this.puddles = this.stage === 1 ? 2 : 4
      this.nextPuddle = this.time + 650
    } else if (phase === 3) {
      name = '裂地顺劈'; hint = '绕到背面 · 扇形方向已锁定'
      const p = this.deps.player.position
      const facing = Math.atan2(p.x - position.x, p.y - position.y) * 180 / Math.PI
      this.entity.facing = facing
      this.zone({ type: 'fan', radius: 22, angle: 150 }, duration, 3.5, position, facing)
    } else {
      name = '十字终焉'; hint = '进入四角安全区 · 避开脚下落雷'
      this.zone({ type: 'rect', width: 5, length: 32 }, duration, 2.5, { x: 0, y: -16 })
      this.zone({ type: 'rect', width: 5, length: 32 }, duration, 2.5, { x: -16, y: 0 }, 90)
      this.zone({ type: 'circle', radius: 3 }, duration, 1.5, this.deps.player.position)
    }
    const total = phase === 2 ? 1700 + this.puddles * 650 : duration
    this.cast = { name, hint, elapsed: 0, total }
    this.nextCast = this.time + total + (fast ? 700 : 1300)
  }
  dispose() {
    this.deps.zoneMgr.cancelAllByCaster(this.entity.id)
    this.deps.arena.def.shape = this.originalShape
    this.cast = null
    this.puddles = 0
  }
  private zone(shape: AoeShapeDef, delay: number, potency: number, center: Vec2 = this.entity.position, facing = 0) {
    this.deps.zoneMgr.spawn({
      anchor: { type: 'position', x: center.x, y: center.y }, direction: { type: 'fixed', angle: facing },
      shape, resolveDelay: delay, hitEffectDuration: 300,
      effects: [{ type: 'damage', potency, dmgType: 'magical' }],
    }, `sv_boss_mechanic_${this.step}`, this.entity.position, facing, null, this.entity.id)
  }
}
