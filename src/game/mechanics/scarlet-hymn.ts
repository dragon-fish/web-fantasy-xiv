// src/game/mechanics/scarlet-hymn.ts
// 朱红旋律 / 红莲炎 ("鸳鸯锅"): a firebird circles the arena clockwise from the south, passing a
// column of icons on the west, then the east. Each icon it touches makes its floor quadrant erupt,
// launching anyone standing there. The whole order is visible before the first eruption.
// Quadrants (clockwise from north-east): 0 = NE 黑「り」, 1 = SE 黄「な」, 2 = SW 青「う」, 3 = NW 紫「ろ」.
import type { AoeZoneDef, SkillEffectDef, Vec2 } from '@/core/types'
import type { MechanicFactory } from './mechanic-host'

export type Quadrant = 0 | 1 | 2 | 3
export type HymnPattern = 'rotate' | 'diagonal'

/** Compass facing (deg) of each quadrant's centre line */
export const QUADRANT_FACING = [45, 135, 225, 315] as const

const q = (n: number) => (((n % 4) + 4) % 4) as Quadrant

/**
 * The fixed pseudo-random sets from the original fight.
 * rotate: clockwise one step at a time.
 * diagonal (8): A, opposite, A's counter-clockwise neighbour, A's clockwise neighbour, then mirrored.
 * diagonal (4): A, opposite, clockwise neighbour, counter-clockwise neighbour.
 */
export function hymnSequence(pattern: HymnPattern, start: number, length: number): Quadrant[] {
  if (pattern === 'rotate') return Array.from({ length }, (_, i) => q(start + i))
  if (length === 4) return [q(start), q(start + 2), q(start + 1), q(start - 1)]
  const half = [q(start), q(start + 2), q(start - 1), q(start + 1)]
  return [...half, ...[...half].reverse()]
}

/** Icon spots outside the ring: first half on the west arc (south→north), rest on the east (north→south). */
export function hymnIconAngles(count: number): number[] {
  const west = Math.ceil(count / 2), east = count - west
  const arc = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.5)) / n)
  return [...arc(195, 345, west), ...arc(375, 525, east)] // unwrapped clockwise compass angles
}

export interface ScarletHymnParams {
  pattern?: HymnPattern
  /** Starting quadrant or 'random' */
  start?: number | 'random'
  length?: number
  /** Explicit order (overrides pattern/start/length) */
  sequence?: Quadrant[]
  /** ms between eruptions */
  interval?: number
  /** ms from start until the first eruption (icons are readable during this time) */
  lead?: number
  /** Eruption telegraph time */
  windup?: number
  potency: number
  launchBuff: string
  vulnBuff?: string
  radius?: number
  /** Entity flown as the firebird */
  bird?: string
  /** Orbit radius of the bird and the icon columns */
  orbit?: number
  skillName?: string
  /** 之之之之: all four quadrants erupt every interval, forever */
  enrage?: boolean
}

export const scarletHymn: MechanicFactory = (ctx, raw, id) => {
  const p = raw as ScarletHymnParams
  const interval = p.interval ?? 1100
  const lead = p.lead ?? 5000
  const windup = p.windup ?? 600
  const radius = p.radius ?? 21
  const orbit = p.orbit ?? 25
  const start = p.start === 'random' || p.start === undefined ? Math.floor(Math.random() * 4) : p.start
  const order: Quadrant[] = p.enrage ? [] : p.sequence ?? hymnSequence(p.pattern ?? 'rotate', start, p.length ?? 8)
  const angles = hymnIconAngles(order.length)
  const icons = order.map((quadrant, i) => {
    const a = (angles[i] * Math.PI) / 180
    return { x: Math.sin(a) * orbit, y: Math.cos(a) * orbit, quadrant }
  })
  const boss = ctx.entities.get('boss')
  const bird = p.bird ? ctx.entities.get(p.bird) : undefined
  const skillId = p.enrage ? 'hotspot_enrage' : 'hotspot'
  ctx.combat.nameSkill(skillId, p.skillName ?? '红莲炎')

  const effects: SkillEffectDef[] = [
    { type: 'damage', potency: p.potency },
    { type: 'apply_buff', buffId: p.launchBuff, target: 'target' },
  ]
  if (p.vulnBuff) effects.push({ type: 'apply_buff', buffId: p.vulnBuff, target: 'target', when: { role: 'tank' } })
  const erupt = (quadrant: Quadrant) => {
    const def: AoeZoneDef = {
      anchor: { type: 'position', x: 0, y: 0 },
      direction: { type: 'fixed', angle: QUADRANT_FACING[quadrant] },
      shape: { type: 'fan', radius, angle: 90 },
      resolveDelay: windup,
      hitEffectDuration: 300,
      effects,
    }
    ctx.zones.spawn(def, skillId, { x: 0, y: 0 }, 0, null, boss?.id ?? null)
  }

  ctx.bus.emit('mechanic:hymn_start', { id, icons, enrage: !!p.enrage })
  if (bird) { bird.visible = true; bird.targetable = false }

  const birdAt = (deg: number): Vec2 => {
    const a = (deg * Math.PI) / 180
    return { x: Math.sin(a) * orbit, y: Math.cos(a) * orbit }
  }
  // Bird angle over time: south at (first eruption - interval), then linear through each icon angle
  const firstAt = lead
  const keyframes = p.enrage
    ? []
    : [{ t: firstAt - interval, a: 180 }, ...angles.map((a, i) => ({ t: firstAt + i * interval, a })), { t: firstAt + order.length * interval, a: 540 }]
  const birdAngle = (t: number) => {
    if (p.enrage) return 180 + ((t - lead) / (interval * 8)) * 360
    if (t <= keyframes[0].t) return keyframes[0].a
    for (let i = 1; i < keyframes.length; i++) {
      const k0 = keyframes[i - 1], k1 = keyframes[i]
      if (t <= k1.t) return k0.a + ((k1.a - k0.a) * (t - k0.t)) / (k1.t - k0.t)
    }
    return keyframes[keyframes.length - 1].a
  }

  let t = 0
  let next = 0
  return {
    update(dt) {
      t += dt
      if (bird) {
        const a0 = birdAngle(t), a1 = birdAngle(t + 50)
        const pos = birdAt(a0), ahead = birdAt(a1)
        bird.position.x = pos.x
        bird.position.y = pos.y
        bird.facing = ((Math.atan2(ahead.x - pos.x, ahead.y - pos.y) * 180) / Math.PI + 360) % 360
      }
      if (p.enrage) {
        // Every quadrant, every interval, until the battle ends
        while (t >= lead + next * interval - windup) {
          for (const quadrant of [0, 1, 2, 3] as Quadrant[]) erupt(quadrant)
          ctx.bus.emit('mechanic:hymn_burst', { id, index: next, quadrant: -1 })
          next++
        }
        return false
      }
      while (next < order.length && t >= lead + next * interval - windup) {
        erupt(order[next])
        ctx.bus.emit('mechanic:hymn_burst', { id, index: next, quadrant: order[next] })
        next++
      }
      if (t >= lead + order.length * interval + interval) {
        if (bird) bird.visible = false
        ctx.bus.emit('mechanic:hymn_end', { id })
        return true
      }
      return false
    },
  }
}
