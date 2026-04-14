// src/timeline/timeline-parser.ts
import type { PhaseDef, PhaseTrigger, TimelineAction } from '@/config/schema'

export function flattenTimeline(rawEntries: any[]): TimelineAction[] {
  const result: TimelineAction[] = []

  for (const entry of rawEntries) {
    flattenEntry(entry, 0, result)
  }

  result.sort((a, b) => a.at - b.at)
  return result
}

/**
 * Parse phases from encounter YAML.
 * Supports two formats:
 *
 * 1) Object format (phases key in YAML):
 *    phases:
 *      phase_default:
 *        actions: [...]
 *      phase_mob:
 *        trigger:
 *          on_all_killed: { group: adds_group1 }
 *        actions: [...]
 *
 * 2) Backward-compatible: if rawPhases is undefined/null but rawTimeline
 *    is provided, wraps it into a single phase_default.
 */
export function parsePhases(
  rawPhases: Record<string, any> | undefined | null,
  rawTimeline?: any[],
): PhaseDef[] {
  // Backward compat: no phases defined, wrap flat timeline as phase_default
  if (!rawPhases) {
    const actions = flattenTimeline(rawTimeline ?? [])
    return [{ id: 'phase_default', trigger: { type: 'on_combat_start' }, actions }]
  }

  const phases: PhaseDef[] = []
  for (const [id, raw] of Object.entries(rawPhases)) {
    const trigger = id === 'phase_default'
      ? ({ type: 'on_combat_start' } as PhaseTrigger)
      : parseTrigger(raw.trigger)
    const actions = flattenTimeline(raw.actions ?? [])
    phases.push({ id, name: raw.name, trigger, actions })
  }
  return phases
}

/**
 * Parse trigger from YAML single-key object format:
 *   trigger:
 *     on_all_killed: { group: adds_group1 }
 *   trigger:
 *     on_hp_below: { group: boss, percent: 50 }
 */
function parseTrigger(raw: any): PhaseTrigger {
  if (!raw) return { type: 'manual' }

  if (raw.on_all_killed) {
    return { type: 'on_all_killed', group: raw.on_all_killed.group ?? 'mob' }
  }
  if (raw.on_hp_below) {
    return {
      type: 'on_hp_below',
      group: raw.on_hp_below.group ?? 'boss',
      percent: raw.on_hp_below.percent ?? 50,
    }
  }
  return { type: 'manual' }
}

function flattenEntry(entry: any, baseTime: number, out: TimelineAction[]): void {
  const at = (entry.at ?? 0) + baseTime
  const entity = entry.entity as string | undefined

  if (entry.use != null) {
    out.push({ at, action: 'use', use: entry.use, entity })
  } else if (entry.loop != null) {
    out.push({ at, action: 'loop', loop: entry.loop })
  } else if (entry.action === 'switch_arena') {
    out.push({ at, action: 'switch_arena', arena: entry.arena })
  } else if (entry.action === 'spawn_entity') {
    out.push({
      at, action: 'spawn_entity',
      spawnId: entry.spawnId ?? entry.entity,
      spawnType: entry.spawnType ?? 'mob',
      spawnGroup: entry.spawnGroup ?? entry.spawnType ?? 'mob',
      spawnHp: entry.spawnHp,
      spawnAttack: entry.spawnAttack,
      spawnSpeed: entry.spawnSpeed,
      spawnSize: entry.spawnSize,
      position: entry.position,
    })
  } else if (entry.action === 'lock_facing') {
    out.push({ at, action: 'lock_facing', facing: entry.facing, locked: entry.locked, entity })
  } else if (entry.action === 'enable_ai') {
    out.push({ at, action: 'enable_ai', entity })
  } else if (entry.action === 'disable_ai') {
    out.push({ at, action: 'disable_ai', entity })
  } else if (entry.action === 'teleport') {
    out.push({ at, action: 'teleport', position: entry.position, entity })
  } else if (entry.action === 'set_visible') {
    out.push({ at, action: 'set_visible', entity, value: entry.value ?? true })
  } else if (entry.action === 'set_targetable') {
    out.push({ at, action: 'set_targetable', entity, value: entry.value ?? true })
  } else if (entry.action === 'add_death_zone') {
    out.push({ at, action: 'add_death_zone', deathZone: entry.deathZone })
  } else if (entry.action === 'remove_death_zone') {
    out.push({ at, action: 'remove_death_zone', deathZoneId: entry.deathZoneId })
  } else if (entry.action === 'camera_roll') {
    out.push({ at, action: 'camera_roll', angle: entry.angle, snapMs: entry.snapMs, returnMs: entry.returnMs })
  } else if (entry.action === 'show_dialog') {
    out.push({ at, action: 'show_dialog', dialogText: entry.text })
  } else if (entry.action === 'hide_dialog') {
    out.push({ at, action: 'hide_dialog' })
  } else if (entry.action === 'run_script') {
    out.push({ at, action: 'run_script', script: entry.script })
  }

  if (entry.then) {
    for (const child of entry.then) {
      const childAt = at + (child.after ?? 0)
      flattenEntry({ ...child, at: 0, after: undefined }, childAt, out)
    }
  }
}
