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
export { calcDash, calcBackstep, calcKnockback, calcPull } from './combat/displacement'

// Skill
export { isPointInAoeShape } from './skill/aoe-shape'
export { AoeZoneManager } from './skill/aoe-zone'
export type { ActiveAoeZone } from './skill/aoe-zone'
export { SkillResolver, GCD_DURATION } from './skill/skill-resolver'

// Config
export { parseArenaConfig, parseEntityConfig, parseSkillConfig, parseTimelineConfig } from './config/schema'
export type { EntityConfig, TimelineAction, TimelineConfig } from './config/schema'
export { ResourceLoader } from './config/resource-loader'
export type { FetchFn } from './config/resource-loader'

// Timeline
export { flattenTimeline } from './timeline/timeline-parser'
export { TimelineScheduler } from './timeline/timeline-scheduler'

// AI
export { BossBehavior } from './ai/boss-behavior'

// Renderer
export { SceneManager } from './renderer/scene-manager'
export { EntityRenderer } from './renderer/entity-renderer'
export { AoeRenderer } from './renderer/aoe-renderer'
export { ArenaRenderer } from './renderer/arena-renderer'
export { HitEffectRenderer } from './renderer/hit-effect-renderer'

// Input
export { InputManager, computeMoveDirection, computeFacingAngle } from './input/input-manager'

// UI
export { UIManager } from './ui/ui-manager'
export { MainMenu } from './ui/main-menu'
export { PauseMenu } from './ui/pause-menu'

// Game (reusable components)
export { CameraController } from './game/camera-controller'
export type { CameraFollowConfig } from './game/camera-controller'
export { CombatResolver } from './game/combat-resolver'
export { PlayerInputDriver } from './game/player-input-driver'
export type { PlayerInputConfig } from './game/player-input-driver'
export { DisplacementAnimator, EASING } from './game/displacement-animator'
export { GameScene } from './game/game-scene'
export type { GameSceneConfig } from './game/game-scene'
export { loadEncounter, parseEncounterYaml } from './game/encounter-loader'
export type { EncounterData } from './game/encounter-loader'

// DevTools
export { DevTerminal } from './devtools/dev-terminal'
export { CommandRegistry } from './devtools/commands'

// Demo
export { startDemo } from './demo/demo-scene'
