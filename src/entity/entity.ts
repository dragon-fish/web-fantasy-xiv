// src/entity/entity.ts
import type { EntityType, Vec3 } from '@/core/types'

export interface CastState {
  skillId: string
  targetId: string | null
  elapsed: number    // ms elapsed
  castTime: number   // ms total
}

export interface BuffInstance {
  defId: string
  sourceId: string
  remaining: number  // ms remaining, 0 = permanent
  stacks: number
}

export interface Entity {
  readonly id: string
  readonly type: EntityType

  position: Vec3
  facing: number
  speed: number
  size: number

  hp: number
  maxHp: number
  attack: number

  autoAttackRange: number   // max range for auto-attack
  aggroRange: number        // proximity aggro detection range (boss/mob)

  alive: boolean
  inCombat: boolean
  casting: CastState | null
  gcdTimer: number
  autoAttackTimer: number

  target: string | null
  buffs: BuffInstance[]
  skillIds: string[]
}

export interface CreateEntityOptions {
  id: string
  type: EntityType
  position?: Vec3
  facing?: number
  speed?: number
  size?: number
  hp?: number
  maxHp?: number
  attack?: number
  autoAttackRange?: number
  aggroRange?: number
  skillIds?: string[]
}

export function createEntity(opts: CreateEntityOptions): Entity {
  const maxHp = opts.maxHp ?? opts.hp ?? 0
  return {
    id: opts.id,
    type: opts.type,
    position: opts.position ?? { x: 0, y: 0, z: 0 },
    facing: opts.facing ?? 0,
    speed: opts.speed ?? 5,
    size: opts.size ?? 0.5,
    hp: opts.hp ?? maxHp,
    maxHp,
    attack: opts.attack ?? 0,
    autoAttackRange: opts.autoAttackRange ?? 0,
    aggroRange: opts.aggroRange ?? 0,
    alive: true,
    inCombat: false,
    casting: null,
    gcdTimer: 0,
    autoAttackTimer: 0,
    target: null,
    buffs: [],
    skillIds: opts.skillIds ?? [],
  }
}
