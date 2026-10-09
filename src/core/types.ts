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

/**
 * Party marker selection (one zone per picked member):
 * - each: every living member
 * - count: `count` members; when fewer are alive, random members are picked again (someone takes two)
 * - role: the living members with `role`; a random member when none is left
 * - enmity: the caster's enmity ranks (1 = top); missing ranks are skipped
 */
export type PartySelect =
  | { select: 'each' }
  | { select: 'count'; count: number }
  | { select: 'role'; role: Role }
  | { select: 'enmity'; rank: number | number[] }

export type AnchorType =
  | { type: 'caster' }
  | { type: 'target' }
  | { type: 'target_live' }
  | { type: 'position'; x: number; y: number }
  /** `follow` (default true): the zone tracks its member until it resolves */
  | ({ type: 'party'; follow?: boolean } & PartySelect)

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

/** How a multi-hit attack's show plays out on the target: clean hits, blocked, deflected, perfectly deflected */
export type FlurryGuard = 'none' | 'block' | 'deflect' | 'perfect'

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
  | 'tankbuster' // 死刑: can be parried (see game/parry.ts)

/** Combat role, derived from the player's job category; encounters branch on it */
export type Role = 'tank' | 'healer' | 'dps'

/** Optional gate on an effect or timeline entry, evaluated against the affected entity / player */
export interface EffectCondition {
  role?: Role | Role[]
  /** Skip when the entity currently has this buff (e.g. already launched airborne) */
  notBuff?: string
}

export type SkillEffectDef = (
  /** `noRevive`: a player killed by this hit skips the revive ladder (e.g. add enrages).
   *  `hits`: presentation only — show the damage as N quick hits; it still resolves in one frame.
   *  `onUnparried` (resolved on the target, `tankbuster` damage only) is the encounter's own penalty
   *  for not parrying it — the parry system adds none. */
  | { type: 'damage'; potency: number; dmgType?: DamageType | DamageType[]; noRevive?: boolean; hits?: number; onUnparried?: SkillEffectDef[] }
  | { type: 'heal'; potency: number }
  /** Heal every living party member within `radius` of the caster; `onEffective` (on the caster) runs
   *  once when at least one of them was missing HP */
  | { type: 'party_heal'; potency: number; radius: number; onEffective?: SkillEffectDef[] }
  /** Apply a buff to every living party member within `radius` of the caster */
  | { type: 'party_buff'; buffId: string; radius: number }
  /** Bring a fallen party member back at this fraction of max HP */
  | { type: 'raise'; hpPercent: number }
  | { type: 'apply_buff'; buffId: string; stacks?: number; duration?: number; target?: 'caster' | 'target' }
  | { type: 'consume_buffs'; buffIds: string[] }                         // remove listed buffs from caster on resolve
  | { type: 'consume_all_buff_stacks'; buffId: string }                  // remove all stacks of a buff
  | { type: 'consume_buff_stacks'; buffId: string; stacks: number }      // remove N stacks from a buff
  | { type: 'restore_mp'; percent: number }                              // restore % of max MP to caster
  | { type: 'dash'; stopDistance?: number }                              // caster dashes toward target; stops `stopDistance` beyond its hitbox edge (default 0 → lands 0.1m inside the target ring, FFXIV-style)
  | { type: 'dash_forward'; distance: number }                          // caster dashes forward (toward facing direction)
  | { type: 'dash_to_ley_lines' }                                       // caster dashes to ley lines center
  | { type: 'backstep'; distance: number }                              // caster jumps backward from target
  | { type: 'knockback'; distance: number; source?: DisplacementSource } // push target away from source (default: caster)
  | { type: 'pull'; distance: number; source?: DisplacementSource }      // pull target toward source (default: caster)
  | { type: 'revive' }                                                   // wake dormant entities caught in the zone
) & { when?: EffectCondition }

/** Visual element of a skill's effects (renderer-only hint) */
export type VfxElement =
  | 'physical' | 'fire' | 'ice' | 'lightning' | 'holy' | 'dark'
  | 'wind' | 'water' | 'earth' | 'aether' | 'heal' | 'poison'

/** How a skill's visual reaches its target (renderer-only hint) */
export type VfxDelivery = 'melee' | 'projectile' | 'beam' | 'burst' | 'buff'

export interface SkillVfxDef {
  element?: VfxElement
  delivery?: VfxDelivery
}

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
  /** false = no ground telegraph (raidwides: FFXIV shows only the cast bar). Default true. */
  telegraph?: boolean
  /** Overhead marker on the anchored entity while the zone is pending (renderer-only) */
  marker?: 'spread' | 'stack' | 'buster' | 'knockback' | 'pull'
  /**
   * Damage split among everyone hit: `even` divides it equally; `{ front }` (lines / fans) puts
   * `front` of it on the member nearest the origin and splits the rest among the others.
   * A shared zone aimed `toward_target` keeps turning to its target until it resolves (line stacks).
   */
  share?: 'even' | { front: number }
  /** Splash of a single-target skill: skips the caster's target, which takes the skill's own hit */
  exceptTarget?: boolean
}

export interface SkillDef {
  id: string
  name: string
  /** Icon image URL; falls back to text abbreviation when absent */
  icon?: string
  type: SkillType
  castTime: number // ms
  cooldown: number // ms; with `charges`, the recharge time of one charge
  /** Max charges (> 1 = charge-based skill: usable while any charge is left) */
  charges?: number
  gcd: boolean
  targetType: TargetType
  requiresTarget: boolean  // true = must have a locked enemy target to cast
  /** Friendly target picked at cast start among party members within `range` (enemy target ignored):
   *  'lowest-hp' = lowest HP ratio, falling back to the caster; 'fallen' = nearest fallen member,
   *  the skill cannot be used without one */
  allyTarget?: 'lowest-hp' | 'fallen'
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
  /** Visual style override; inferred from targeting/effects when omitted */
  vfx?: SkillVfxDef
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
  | { type: 'damage_immunity' }              // all non-special damage negated, but displacement still applies
  | { type: 'mp_regen'; potency: number; interval: number }
  | { type: 'next_cast_instant'; consumeOnCast: boolean }
  | { type: 'attack_modifier'; value: number }   // base attack × (1 + sum)
  | { type: 'max_hp_modifier'; value: number }   // base maxHp × (1 + sum)
  /** Parry stance: a tankbuster landing now is spent on it. `byStacks[stacks - 1]` is the outcome at the
   *  current stack count — damage × damageTaken, optional reward buff. */
  | { type: 'parry'; byStacks: { guard: Exclude<FlurryGuard, 'none'>; damageTaken: number; grantBuff?: string }[] }

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
  /** Renderer hint: 'airborne' lifts the model in an arc for the buff's duration */
  visual?: 'airborne'
  duration: number // ms, 0 = permanent
  /** Timed-buff input grace in ms; defaults to 500. Use 0 for precise defensive windows. */
  durationGrace?: number
  stackable: boolean
  maxStacks: number
  /** Shield buff: stacks = shield HP, absorbs damage before HP.
   *  Re-application only replaces if new shield has both more stacks AND longer duration. */
  shield?: boolean
  /** Effects resolved on the holder (as caster and target) whenever the buff ends — expired,
   *  broken or consumed — while alive. Not on death clearing, nor on in-place refresh/replacement. */
  onRemove?: SkillEffectDef[]
  /** Stacks run down one at a time: when the timer ends with more than one stack, drop a stack and run
   *  `stackDurations[stacks - 1]` ms (time past the end carried over) instead of ending. */
  stackDurations?: number[]
  /** Tracked elsewhere (e.g. the job gauge): kept out of the buff bar and status fly text */
  hidden?: boolean
  /**
   * If true, this buff survives entity death and remains on the entity.
   * Default false (buff is cleared on death, matching FF14 Raise semantics).
   * Use true for battlefield mechanics (The Echo), tank stances, or "weakness"-style
   * debuffs that intentionally persist across death/revive.
   *
   * NOTE: The actual "clear on death" runtime handler is phase 4/5 work;
   * in phase 3 this flag has no runtime consumer. All buffs currently persist
   * across death regardless of this flag. Adding the flag now so phase 3 buff
   * definitions can declare their intent without requiring later migration.
   */
  preserveOnDeath?: boolean
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
  /** Visual theme id (renderer-only; see renderer/arena-theme.ts) */
  theme?: string
  /** Initial death zones loaded from encounter YAML */
  deathZones?: DeathZoneDef[]
}

export type FacingQuadrant = 'forward' | 'back' | 'left' | 'right'
