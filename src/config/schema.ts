import type { ArenaDef, SkillDef, AoeZoneDef, SkillEffectDef } from '@/core/types'

// --- Arena ---
export interface RawArenaConfig {
  name: string
  shape: string
  radius?: number
  width?: number
  height?: number
  boundary: string
}

export function parseArenaConfig(raw: RawArenaConfig): ArenaDef {
  const shape = raw.shape === 'circle'
    ? { type: 'circle' as const, radius: raw.radius! }
    : { type: 'rect' as const, width: raw.width!, height: raw.height! }
  return { name: raw.name, shape, boundary: raw.boundary as ArenaDef['boundary'] }
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
    zones: raw.zones?.map((z: any) => parseZone(z)),
    effects: raw.effects as SkillEffectDef[] | undefined,
  }
}

function parseZone(raw: any): AoeZoneDef {
  return {
    anchor: raw.anchor,
    direction: raw.direction,
    shape: raw.shape,
    resolveDelay: raw.resolveDelay ?? 0,
    telegraphBefore: raw.telegraphBefore,
    hitEffectDuration: raw.hitEffectDuration ?? 500,
    effects: raw.effects ?? [],
    displacementHint: raw.displacementHint,
  }
}

// --- Timeline ---
export interface TimelineAction {
  at: number          // absolute ms
  action: string      // 'use' | 'loop' | 'switch_arena' | 'spawn_entity' | 'lock_facing'
  use?: string        // skill id
  loop?: number       // target time ms
  arena?: string      // arena alias
  entity?: string     // entity alias
  position?: { x: number; y: number }
  facing?: number
  locked?: boolean
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
