// src/game/encounter-loader.ts
import { parse as parseYaml } from 'yaml'
import { parseArenaConfig, parseSkillConfig } from '@/config/schema'
import { flattenTimeline, parsePhases } from '@/timeline/timeline-parser'
import type { ArenaDef, BuffDef, SkillDef } from '@/core/types'
import type { PhaseDef, TimelineAction } from '@/config/schema'
import type { BossBehaviorConfig } from '@/ai/boss-behavior'
import type { CreateEntityOptions } from '@/entity/entity'

export interface EncounterData {
  arena: ArenaDef
  /** All entity definitions (boss, player, mobs, objects) keyed by id */
  entities: Map<string, CreateEntityOptions>
  /** Shortcut to the boss entity options (= entities.get('boss')) */
  boss: CreateEntityOptions
  /** Shortcut to the player overrides */
  player: Partial<CreateEntityOptions>
  bossAI: Partial<BossBehaviorConfig>
  skills: Map<string, SkillDef>
  /** Buff definitions local to this encounter; registered into combatResolver at scene init. */
  localBuffs: Record<string, BuffDef>
  /** Flat timeline (backward compat — equals phase_default actions) */
  timeline: TimelineAction[]
  /** Phase definitions (always has at least phase_default) */
  phases: PhaseDef[]
}

/**
 * Load an encounter from a YAML file (fetched via URL).
 * The YAML is self-contained: arena, entities, skills, and timeline all inline.
 */
export async function loadEncounter(url: string): Promise<EncounterData> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load encounter: ${url} (${response.status})`)
  const text = await response.text()
  return parseEncounterYaml(text)
}

/**
 * Parse encounter YAML string into runtime data.
 * Exported for testing without network.
 */
export function parseEncounterYaml(yamlText: string): EncounterData {
  const raw = parseYaml(yamlText)

  // Arena
  const arena = parseArenaConfig(raw.arena)

  // --- Entities ---
  const entities = new Map<string, CreateEntityOptions>()

  if (raw.entities) {
    // New unified format: entities: { boss: {...}, mob1: {...}, ... }
    for (const [id, def] of Object.entries(raw.entities as Record<string, any>)) {
      entities.set(id, parseEntityOpts(id, def))
    }
  }

  // Legacy format: boss: / player: top-level keys → merge into entities map
  if (raw.boss && !entities.has('boss')) {
    entities.set('boss', {
      id: 'boss',
      type: 'boss',
      group: raw.boss.group ?? 'boss',
      hp: raw.boss.hp,
      maxHp: raw.boss.hp,
      attack: raw.boss.attack ?? 1,
      speed: raw.boss.speed ?? 0,
      size: raw.boss.size ?? 1.5,
      autoAttackRange: raw.boss.autoAttackRange ?? 5,
      aggroRange: raw.boss.aggroRange ?? raw.boss_ai?.aggroRange ?? 0,
      facing: raw.boss.facing ?? 180,
    })
  }

  const boss = entities.get('boss') ?? {
    id: 'boss', type: 'boss' as const, hp: 1, maxHp: 1, attack: 1,
  }

  // Player overrides (always from top-level player: for now)
  const player: Partial<CreateEntityOptions> = {
    hp: raw.player?.hp ?? 10000,
    maxHp: raw.player?.hp ?? 10000,
    mp: raw.player?.mp ?? 10000,
    maxMp: raw.player?.mp ?? 10000,
    attack: raw.player?.attack ?? 1000,
    speed: raw.player?.speed ?? 5,
    size: raw.player?.size ?? 0.5,
    autoAttackRange: raw.player?.autoAttackRange ?? 3.5,
    position: raw.player?.position,
  }

  // Boss AI config
  const bossAI: Partial<BossBehaviorConfig> = raw.boss_ai ?? {}

  // Skills
  const skills = new Map<string, SkillDef>()
  if (raw.skills) {
    for (const [id, def] of Object.entries(raw.skills)) {
      const parsed = parseSkillConfig({ id, ...(def as any) })
      skills.set(id, parsed)
    }
  }
  // Local skills (defined inline in encounter YAML)
  if (raw.local_skills) {
    for (const [id, def] of Object.entries(raw.local_skills)) {
      const parsed = parseSkillConfig({ id, ...(def as any) })
      skills.set(id, parsed)
    }
  }

  // Local buffs (defined inline in encounter YAML)
  const localBuffs: Record<string, BuffDef> = {}
  if (raw.local_buffs) {
    for (const [id, def] of Object.entries(raw.local_buffs as Record<string, any>)) {
      localBuffs[id] = {
        id,
        name: def.name ?? id,
        type: def.type ?? 'buff',
        duration: def.duration ?? 0,
        stackable: def.stackable ?? false,
        maxStacks: def.maxStacks ?? 1,
        effects: def.effects ?? [],
        ...(def.icon != null ? { icon: def.icon } : {}),
        ...(def.preserveOnDeath != null ? { preserveOnDeath: def.preserveOnDeath } : {}),
      }
    }
  }

  // Timeline & Phases
  const phases = parsePhases(raw.phases, raw.timeline)
  const timeline = phases.find((p) => p.id === 'phase_default')?.actions ?? []

  return { arena, entities, boss, player, bossAI, skills, timeline, phases, localBuffs }
}

/** Parse a single entity definition from YAML into CreateEntityOptions */
function parseEntityOpts(id: string, raw: any): CreateEntityOptions {
  return {
    id,
    type: raw.type ?? 'mob',
    group: raw.group ?? raw.type ?? 'mob',
    visible: raw.visible ?? true,
    targetable: raw.targetable ?? true,
    position: raw.position,
    facing: raw.facing,
    hp: raw.hp,
    maxHp: raw.hp,
    attack: raw.attack ?? 1,
    speed: raw.speed ?? 0,
    size: raw.size ?? 0.5,
    autoAttackRange: raw.autoAttackRange ?? 5,
    aggroRange: raw.aggroRange ?? 0,
  }
}
