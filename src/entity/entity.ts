// src/entity/entity.ts
import type { EntityType, Vec3, DamageType } from '@/core/types'

export interface CastState {
  skillId: string
  targetId: string | null
  elapsed: number    // ms elapsed
  castTime: number   // ms total
}

/** Periodic effect scheduling and snapshot; undefined for non-periodic buff instances */
export interface PeriodicState {
  /** Next tick's in-game timestamp (ms, aligned with GameLoop.logicTime) */
  nextTickAt: number
  /** Tick period (ms), copied from buff effect.interval at apply time */
  interval: number
  /** Current periodic effect type; determines tick behavior */
  effectType: 'dot' | 'hot' | 'mp_regen'
  /** Caster-side snapshot; target-side (mitigation/vulnerability) is read live at tick time */
  snapshot: {
    /** caster.attack at apply time (used by dot/hot; placeholder 0 for mp_regen) */
    attack: number
    /** All damage_increase buff values on caster at apply (part of the additive pool); used by dot/hot */
    casterIncreases: number[]
    /** Potency of this periodic effect, copied from buff effect.potency for tick-time access */
    potency: number
    /** mp_regen only: target.maxMp at apply (mp_regen amount = targetMaxMp × potency) */
    targetMaxMp?: number
  }
  /** dot only: damage type; omitted for hot/mp_regen */
  damageType?: DamageType | DamageType[]
  /** Caster entity id; caster death does not stop ticks, used for tracing / UI attribution */
  sourceCasterId: string
}

export interface BuffInstance {
  defId: string
  sourceId: string
  remaining: number  // ms remaining, 0 = permanent
  stacks: number
  /** Periodic effect scheduling; undefined for non-periodic buffs */
  periodic?: PeriodicState
}

export interface Entity {
  readonly id: string
  readonly type: EntityType
  readonly group: string    // grouping tag for phase triggers (e.g. 'boss', 'adds_group1')

  visible: boolean          // false = off-stage, not rendered (场外小怪)
  targetable: boolean       // false = cannot be selected/damaged (转场无敌)
  position: Vec3
  facing: number
  speed: number
  size: number

  hp: number
  maxHp: number
  mp: number
  maxMp: number
  attack: number

  autoAttackRange: number   // max range for auto-attack
  aggroRange: number        // proximity aggro detection range (boss/mob)

  alive: boolean
  inCombat: boolean
  casting: CastState | null
  gcdTimer: number
  gcdDuration: number       // per-entity GCD length in ms (default 2500)
  autoAttackTimer: number

  target: string | null
  buffs: BuffInstance[]
  skillIds: string[]
  /** Custom per-entity data (e.g. Ley Lines center position) */
  customData: Record<string, any>
}

export interface CreateEntityOptions {
  id: string
  type: EntityType
  group?: string
  visible?: boolean
  targetable?: boolean
  position?: Vec3
  facing?: number
  speed?: number
  size?: number
  hp?: number
  maxHp?: number
  mp?: number
  maxMp?: number
  attack?: number
  autoAttackRange?: number
  aggroRange?: number
  gcdDuration?: number
  skillIds?: string[]
}

export function createEntity(opts: CreateEntityOptions): Entity {
  const maxHp = opts.maxHp ?? opts.hp ?? 0
  const maxMp = opts.maxMp ?? opts.mp ?? 0
  return {
    id: opts.id,
    type: opts.type,
    group: opts.group ?? opts.type,
    visible: opts.visible ?? true,
    targetable: opts.targetable ?? true,
    position: opts.position ?? { x: 0, y: 0, z: 0 },
    facing: opts.facing ?? 0,
    speed: opts.speed ?? 5,
    size: opts.size ?? 0.5,
    hp: opts.hp ?? maxHp,
    maxHp,
    mp: opts.mp ?? maxMp,
    maxMp,
    attack: opts.attack ?? 0,
    autoAttackRange: opts.autoAttackRange ?? 0,
    aggroRange: opts.aggroRange ?? 0,
    alive: true,
    inCombat: false,
    casting: null,
    gcdTimer: 0,
    gcdDuration: opts.gcdDuration ?? 2500,
    autoAttackTimer: 0,
    target: null,
    buffs: [],
    skillIds: opts.skillIds ?? [],
    customData: {},
  }
}
