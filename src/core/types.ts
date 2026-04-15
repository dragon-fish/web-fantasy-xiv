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

export type DamageType =
  | 'special'    // ignores mitigation, shields, undying
  | 'physical'   // 物理
  | 'magical'    // 魔法
  | 'piercing'   // 穿刺
  | 'blunt'      // 打击
  | 'slashing'   // 斩击
  | 'ice'        // 冰
  | 'fire'       // 火
  | 'lightning'  // 雷
  | 'water'      // 水
  | 'earth'      // 土
  | 'wind'       // 风

export type SkillEffectDef =
  | { type: 'damage'; potency: number; dmgType?: DamageType | DamageType[] }
  | { type: 'heal'; potency: number }
  | { type: 'apply_buff'; buffId: string; stacks?: number; duration?: number }
  | { type: 'consume_buffs'; buffIds: string[] }                         // remove listed buffs from caster on resolve
  | { type: 'consume_all_buff_stacks'; buffId: string }                  // remove all stacks of a buff
  | { type: 'consume_buff_stacks'; buffId: string; stacks: number }      // remove N stacks from a buff
  | { type: 'restore_mp'; percent: number }                              // restore % of max MP to caster
  | { type: 'dash'; stopDistance?: number }                              // caster dashes toward target (stops at stopDistance or autoAttackRange)
  | { type: 'dash_forward'; distance: number }                          // caster dashes forward (toward facing direction)
  | { type: 'dash_to_ley_lines' }                                       // caster dashes to ley lines center
  | { type: 'backstep'; distance: number }                              // caster jumps backward from target
  | { type: 'knockback'; distance: number; source?: DisplacementSource } // push target away from source (default: caster)
  | { type: 'pull'; distance: number; source?: DisplacementSource }      // pull target toward source (default: caster)

export interface AoeZoneDef {
  anchor: AnchorType
  direction: DirectionType
  shape: AoeShapeDef
  resolveDelay: number // ms from zone creation to damage resolve
  telegraphBefore?: number // ms before resolve to show telegraph (default = resolveDelay = show immediately)
  hitEffectDuration: number // ms, default 500
  effects: SkillEffectDef[]
  /** Visual hint for displacement direction in telegraph */
  displacementHint?: 'knockback' | 'pull'
}

export interface SkillDef {
  id: string
  name: string
  /** Icon image URL; falls back to text abbreviation when absent */
  icon?: string
  type: SkillType
  castTime: number // ms
  cooldown: number // ms
  gcd: boolean
  targetType: TargetType
  requiresTarget: boolean  // true = must have a locked enemy target to cast
  range: number            // max cast distance (only checked when requiresTarget=true)
  mpCost: number           // MP consumed on use (0 = free)
  /** HP consumed on use (0 = free). Skill cannot be used if HP <= hpCost */
  hpCost?: number
  /** If caster has this buff, pay MP cost instead of HP cost */
  hpCostSwapBuff?: string
  /** If caster has this buff, HP cost becomes HP recovery instead */
  hpCostReverseBuff?: string
  /** Buff IDs that must ALL be present on caster to use this skill */
  requiresBuffs?: string[]
  /** Minimum stacks of a specific buff required to use this skill */
  requiresBuffStacks?: { buffId: string; stacks: number }
  /** Override castTime when caster has this buff; consumes 1 stack if consumeStack is true */
  castTimeWithBuff?: { buffId: string; castTime: number; consumeStack?: boolean }
  /** If caster has this buff, consume 1 stack instead of paying MP cost */
  mpCostAbsorbBuff?: string
  /** Bonus potency per stack of a buff (only affects this skill's damage effects) */
  potencyPerStack?: { buffId: string; bonus: number }
  /** Consume 1 buff stack for additive damage increase + optional MP restore (only affects this skill) */
  potencyWithBuff?: { buffId: string; damageIncrease: number; consumeStack: boolean; restoreMp?: number }
  zones?: AoeZoneDef[]
  effects?: SkillEffectDef[]
}

export type BuffEffectDef =
  | { type: 'damage_increase'; value: number }
  | { type: 'mitigation'; value: number }
  | { type: 'speed_modify'; value: number }
  | { type: 'dot'; potency: number; interval: number }
  | { type: 'hot'; potency: number; interval: number }
  | { type: 'vulnerability'; value: number }  // per-stack damage taken increase (additive)
  | { type: 'haste'; value: number }    // reduce cast time, GCD, and AA interval (0.15 = 15%)
  | { type: 'lifesteal'; value: number }    // heal caster for % of damage dealt (0.2 = 20%)
  | { type: 'mp_on_hit'; value: number }    // restore flat MP when taking damage
  | { type: 'undying' }                     // HP cannot drop below 1
  | { type: 'silence' }
  | { type: 'stun' }
  | { type: 'invulnerable' }                 // all non-special attacks are fully negated (no damage, no displacement)

export interface BuffDef {
  id: string
  name: string
  /** Human-readable description shown in buff tooltip */
  description?: string
  /** Icon image URL; falls back to arrow text when absent */
  icon?: string
  /**
   * Per-stack icon overrides. Key = stack count, value = image URL.
   * Use key 0 as fallback when the current stack count has no matching entry
   * (stack count will be rendered as text in top-right corner).
   */
  iconPerStack?: Record<number, string>
  type: BuffType
  duration: number // ms, 0 = permanent
  stackable: boolean
  maxStacks: number
  /** Shield buff: stacks = shield HP, absorbs damage before HP.
   *  Re-application only replaces if new shield has both more stacks AND longer duration. */
  shield?: boolean
  effects: BuffEffectDef[]
}

export type ArenaShape =
  | { type: 'circle'; radius: number }
  | { type: 'rect'; width: number; height: number }

export type BoundaryType = 'lethal' | 'wall'

export interface DeathZoneDef {
  id: string
  center: Vec2
  facing: number
  shape: AoeShapeDef
  /** 'lethal' = instant death, 'wall' = blocks movement (death if already inside) */
  behavior: 'lethal' | 'wall'
}

export interface ArenaDef {
  name: string
  shape: ArenaShape
  boundary: BoundaryType
  /** Initial death zones loaded from encounter YAML */
  deathZones?: DeathZoneDef[]
}

export type FacingQuadrant = 'forward' | 'back' | 'left' | 'right'
