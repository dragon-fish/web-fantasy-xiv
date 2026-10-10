import type { ArenaDef, SkillDef, AoeZoneDef, SkillEffectDef, DeathZoneDef, EffectCondition } from '@/core/types'

// --- Arena ---
export interface RawArenaConfig {
  name: string
  shape: string
  radius?: number
  width?: number
  height?: number
  boundary: string
  theme?: string
  deathZones?: { id?: string; center: { x: number; y: number }; facing?: number; shape?: any; radius?: number }[]
}

export function parseArenaConfig(raw: RawArenaConfig): ArenaDef {
  const shape = raw.shape === 'circle'
    ? { type: 'circle' as const, radius: raw.radius! }
    : { type: 'rect' as const, width: raw.width!, height: raw.height! }
  const deathZones: DeathZoneDef[] | undefined = raw.deathZones?.map((z, i) => ({
    id: z.id ?? `static_${i}`,
    center: { x: z.center.x, y: z.center.y },
    facing: z.facing ?? 0,
    shape: z.shape ?? { type: 'circle' as const, radius: z.radius ?? 1 },
    behavior: (z as any).behavior ?? 'lethal',
  }))
  return { name: raw.name, shape, boundary: raw.boundary as ArenaDef['boundary'], theme: raw.theme, deathZones }
}

// --- Entity ---
export interface EntityConfig {
  name: string
  type: string
  model?: string
  size: number
  hp: number
  attack: number
  autoAttackInterval: number
  autoAttackRange: number
  skills: string[]
}

export function parseEntityConfig(raw: any): EntityConfig {
  return {
    name: raw.name,
    type: raw.type,
    model: raw.model,
    size: raw.size ?? 0.5,
    hp: raw.hp ?? 0,
    attack: raw.attack ?? 0,
    autoAttackInterval: raw.autoAttackInterval ?? 3000,
    autoAttackRange: raw.autoAttackRange ?? 5,
    skills: raw.skills ?? [],
  }
}

// --- Skill ---
export function parseSkillConfig(raw: any): SkillDef {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    castTime: raw.castTime ?? 0,
    cooldown: raw.cooldown ?? 0,
    gcd: raw.gcd ?? false,
    targetType: raw.targetType ?? 'single',
    requiresTarget: raw.requiresTarget ?? false,
    range: raw.range ?? 0,
    mpCost: raw.mpCost ?? 0,
    zones: raw.zones?.map((z: any) => parseZone(z)),
    effects: raw.effects as SkillEffectDef[] | undefined,
    vfx: raw.vfx,
  }
}

function parseZone(raw: any): AoeZoneDef {
  let { anchor, direction, shape } = raw

  // Rect sugar: { type: rect, from: {x,y}, to: {x,y}, width }
  // Normalized to anchor + direction + shape(length, width)
  if (shape?.type === 'rect' && shape.from && shape.to) {
    const dx = shape.to.x - shape.from.x
    const dy = shape.to.y - shape.from.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

    anchor = { type: 'position', x: shape.from.x, y: shape.from.y }
    direction = { type: 'fixed', angle }
    shape = { type: 'rect', length, width: shape.width }
  }

  // Party marker sugar: `anchor: { select: each }` → `{ type: 'party', select: 'each' }`
  if (anchor && anchor.type == null && anchor.select != null) anchor = { type: 'party', ...anchor }

  // Targeted skills have no area
  if (raw.targeted) {
    shape ??= { type: 'circle', radius: 0 }
    direction ??= { type: 'none' }
  }

  return {
    anchor,
    direction,
    shape,
    resolveDelay: raw.resolveDelay ?? 0,
    telegraphBefore: raw.telegraphBefore,
    hitEffectDuration: raw.hitEffectDuration ?? 500,
    effects: raw.effects ?? [],
    displacementHint: raw.displacementHint,
    marker: raw.marker,
    telegraph: raw.targeted ? false : raw.telegraph,
    share: raw.share,
    targeted: raw.targeted,
  }
}

// --- Timeline ---
export interface TimelineAction {
  at: number          // ms relative to phase start
  action: string      // 'use' | 'loop' | 'switch_arena' | 'spawn_entity' | 'lock_facing' | 'enable_ai' | 'disable_ai' | 'teleport' | 'set_visible' | 'set_targetable'
  use?: string        // skill id
  entity?: string     // entity id to act on (default: boss)
  loop?: number       // target time ms
  arena?: string      // arena alias
  position?: { x: number; y: number }
  facing?: number
  locked?: boolean
  value?: boolean     // for set_visible / set_targetable
  speed?: number      // for set_speed (0 = rooted; AI still turns and auto-attacks)
  // death zone fields
  deathZone?: { id: string; center: { x: number; y: number }; facing?: number; shape: any } & Partial<Pick<DeathZoneDef, 'behavior' | 'damage' | 'color'>>
  deathZoneId?: string   // for remove_death_zone
  // dialog fields
  dialogText?: string     // for show_dialog
  // spawn_entity fields
  spawnId?: string
  spawnType?: string
  spawnGroup?: string
  spawnHp?: number
  spawnAttack?: number
  spawnSpeed?: number
  spawnSize?: number
  spawnModel?: string
  spawnAutoAttackRange?: number
  spawnAggroRange?: number
  // camera_roll fields
  angle?: number     // roll angle in degrees (positive = clockwise)
  snapMs?: number    // ms for snap phase
  returnMs?: number  // ms for return phase
  // script fields
  script?: string   // for run_script
  /** Only dispatched when the player matches (e.g. role-specific mechanics) */
  when?: EffectCondition
  // mechanic fields (timeline `mechanic:` entries)
  mechanic?: string
  params?: Record<string, any>
  /** Re-emitted by a timeline seek: only lasting state changes should be applied */
  fastForward?: boolean
  /** Set on actions inside a `choose:` block; only the variant picked for the group runs */
  variant?: { group: string; index: number; count: number }
  /** Party mode: where NPCs stand for this mechanic (see game/party) */
  npc?: NpcSpotHint
}

/**
 * Preset spots NPCs claim for a mechanic; `tolerance` = radius of the random stand point (m).
 * `frame`: `arena` (default) = arena coordinates; `boss` = relative to the caster when the entry
 * fires (+y = the way it faces, +x = its right), for mechanics that follow the boss around.
 */
export interface NpcSpotHint {
  spots: { x: number; y: number; tolerance?: number }[]
  frame?: 'arena' | 'boss'
  tolerance?: number
  /** ms the spots hold from dispatch (default: until the action's zones resolve) */
  hold?: number
}

// --- Phase system ---
export type PhaseTrigger =
  | { type: 'on_combat_start' }
  | { type: 'on_all_killed'; group: string }
  | { type: 'on_hp_below'; group: string; percent: number }
  | { type: 'manual' }

export interface PhaseDef {
  id: string
  name?: string
  trigger: PhaseTrigger
  actions: TimelineAction[]
  /** Activating it stops every other running phase except background ones (HP-pushed bosses: the
   *  old timeline is cut short) */
  exclusive?: boolean
  /** Runs alongside the HP phases and survives exclusive ones (e.g. an enrage timed from the pull) */
  background?: boolean
  /** While it runs, the boss's HP cannot drop below this percent (it waits there for the push) */
  hpFloor?: number
}

export interface TimelineConfig {
  arenas: Record<string, string>
  entities: Record<string, string>
  localSkills: Record<string, SkillDef>
  timeline: TimelineAction[]
  enrage: { time: number; castTime: number; skill: string }
}

export function parseTimelineConfig(raw: any): TimelineConfig {
  const timeline: TimelineAction[] = []

  for (const entry of raw.timeline ?? []) {
    const action = parseTimelineEntry(entry)
    timeline.push(...action)
  }

  // Sort by absolute time
  timeline.sort((a, b) => a.at - b.at)

  const localSkills: Record<string, SkillDef> = {}
  for (const [key, val] of Object.entries(raw.local_skills ?? {})) {
    localSkills[key] = parseSkillConfig({ id: key, ...(val as any) })
  }

  return {
    arenas: raw.arenas ?? { default: raw.arena },
    entities: raw.entities ?? { boss: raw.entity },
    localSkills,
    timeline,
    enrage: raw.enrage ?? { time: 0, castTime: 0, skill: '' },
  }
}

function parseTimelineEntry(entry: any, baseTime = 0): TimelineAction[] {
  const at = (entry.at ?? 0) + baseTime
  const results: TimelineAction[] = []

  if (entry.use != null) {
    results.push({ at, action: 'use', use: entry.use })
  } else if (entry.loop != null) {
    results.push({ at, action: 'loop', loop: entry.loop })
  } else if (entry.action === 'switch_arena') {
    results.push({ at, action: 'switch_arena', arena: entry.arena })
  } else if (entry.action === 'spawn_entity') {
    results.push({ at, action: 'spawn_entity', entity: entry.entity, position: entry.position })
  } else if (entry.action === 'lock_facing') {
    results.push({ at, action: 'lock_facing', facing: entry.facing, locked: entry.locked })
  }

  // Process then/after children (relative time sugar)
  if (entry.then) {
    for (const child of entry.then) {
      const childBase = at + (child.after ?? 0)
      const childEntry = { ...child, at: 0 }
      delete childEntry.after
      results.push(...parseTimelineEntry(childEntry, childBase))
    }
  }

  return results
}
