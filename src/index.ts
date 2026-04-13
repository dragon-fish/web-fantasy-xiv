// Core
export { EventBus } from './core/event-bus'
export { GameLoop, LOGIC_TICK } from './core/game-loop'
export type {
  Vec2,
  Vec3,
  EntityType,
  SkillType,
  TargetType,
  BuffType,
  AnchorType,
  DirectionType,
  AoeShapeDef,
  SkillEffectDef,
  AoeZoneDef,
  SkillDef,
  BuffEffectDef,
  BuffDef,
  ArenaShape,
  BoundaryType,
  ArenaDef,
  FacingQuadrant,
} from './core/types'

// Entity
export { createEntity } from './entity/entity'
export type { Entity, CastState, BuffInstance, CreateEntityOptions } from './entity/entity'
export { EntityManager } from './entity/entity-manager'

// Arena
export { Arena } from './arena/arena'
export { pointInCircle, pointInFan, pointInRing, pointInRect } from './arena/geometry'

// Combat
export { calculateDamage } from './combat/damage'
export type { DamageParams } from './combat/damage'
export { BuffSystem } from './combat/buff'

// Skill
export { isPointInAoeShape } from './skill/aoe-shape'
export { AoeZoneManager } from './skill/aoe-zone'
export type { ActiveAoeZone } from './skill/aoe-zone'
export { SkillResolver, GCD_DURATION } from './skill/skill-resolver'
