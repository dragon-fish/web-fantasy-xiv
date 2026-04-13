export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type EntityType = 'player' | 'boss' | 'mob' | 'object'

export type SkillType = 'weaponskill' | 'spell' | 'ability'

export type TargetType = 'single' | 'aoe'

export type BuffType = 'buff' | 'debuff'

export type AnchorType =
  | { type: 'caster' }
  | { type: 'target' }
  | { type: 'target_live' }
  | { type: 'position'; x: number; y: number }

export type DirectionType =
  | { type: 'caster_facing' }
  | { type: 'toward_target' }
  | { type: 'fixed'; angle: number }
  | { type: 'none' }

export type AoeShapeDef =
  | { type: 'circle'; radius: number }
  | { type: 'fan'; radius: number; angle: number }
  | { type: 'ring'; innerRadius: number; outerRadius: number }
  | { type: 'rect'; length: number; width: number }

export type DisplacementSource =
  | { type: 'caster' }
  | { type: 'position'; x: number; y: number }

export type SkillEffectDef =
  | { type: 'damage'; potency: number }
  | { type: 'heal'; potency: number }
  | { type: 'apply_buff'; buffId: string }
  | { type: 'dash' }                                                    // caster dashes to 1m from target
  | { type: 'backstep'; distance: number }                              // caster jumps backward from target
  | { type: 'knockback'; distance: number; source?: DisplacementSource } // push target away from source (default: caster)
  | { type: 'pull'; distance: number; source?: DisplacementSource }      // pull target toward source (default: caster)

export interface AoeZoneDef {
  anchor: AnchorType
  direction: DirectionType
  shape: AoeShapeDef
  telegraphDuration: number // ms
  resolveDelay: number // ms
  hitEffectDuration: number // ms, default 500
  effects: SkillEffectDef[]
}

export interface SkillDef {
  id: string
  name: string
  type: SkillType
  castTime: number // ms
  cooldown: number // ms
  gcd: boolean
  targetType: TargetType
  requiresTarget: boolean  // true = must have a locked enemy target to cast
  range: number            // max cast distance (only checked when requiresTarget=true)
  zones?: AoeZoneDef[]
  effects?: SkillEffectDef[]
}

export type BuffEffectDef =
  | { type: 'damage_increase'; value: number }
  | { type: 'mitigation'; value: number }
  | { type: 'speed_modify'; value: number }
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'silence' }
  | { type: 'stun' }

export interface BuffDef {
  id: string
  name: string
  type: BuffType
  duration: number // ms, 0 = permanent
  stackable: boolean
  maxStacks: number
  effects: BuffEffectDef[]
}

export type ArenaShape =
  | { type: 'circle'; radius: number }
  | { type: 'rect'; width: number; height: number }

export type BoundaryType = 'lethal' | 'wall'

export interface ArenaDef {
  name: string
  shape: ArenaShape
  boundary: BoundaryType
}

export type FacingQuadrant = 'forward' | 'back' | 'left' | 'right'
