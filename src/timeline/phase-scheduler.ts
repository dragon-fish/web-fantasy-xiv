// src/timeline/phase-scheduler.ts
import type { EventBus } from '@/core/event-bus'
import type { PhaseDef, TimelineAction } from '@/config/schema'

interface ActivePhase {
  def: PhaseDef
  elapsed: number
  pointer: number
}

/**
 * Phase-based timeline scheduler.
 *
 * - `phase_default` (trigger: on_combat_start) starts automatically.
 * - Other phases activate when their trigger condition is met,
 *   checked each frame via `checkTriggers()`.
 * - Multiple phases can run concurrently, each with its own clock.
 */
export class PhaseScheduler {
  /** Total combat elapsed time */
  combatElapsed = 0

  private phases: PhaseDef[]
  private activePhases: ActivePhase[] = []
  private pendingPhases: Set<string>

  constructor(
    private bus: EventBus,
    phases: PhaseDef[],
  ) {
    this.phases = phases
    this.pendingPhases = new Set(phases.map((p) => p.id))

    // Auto-start on_combat_start phases (e.g. phase_default)
    for (const phase of phases) {
      if (phase.trigger.type === 'on_combat_start') {
        this.activatePhase(phase.id)
      }
    }
  }

  /**
   * Check trigger conditions each frame.
   * The caller provides callbacks to query game state.
   */
  checkTriggers(context: PhaseContext): void {
    for (const phase of this.phases) {
      if (!this.pendingPhases.has(phase.id)) continue

      const { trigger } = phase
      let met = false

      switch (trigger.type) {
        case 'on_combat_start':
          break // already handled in constructor
        case 'on_all_killed':
          met = context.allKilledInGroup?.(trigger.group) ?? false
          break
        case 'on_hp_below':
          met = context.groupHpBelow?.(trigger.group, trigger.percent) ?? false
          break
      }

      if (met) this.activatePhase(phase.id)
    }
  }

  activatePhase(phaseId: string): void {
    if (!this.pendingPhases.has(phaseId)) return
    this.pendingPhases.delete(phaseId)

    const def = this.phases.find((p) => p.id === phaseId)
    if (!def) return

    if (def.exclusive) {
      for (const a of this.activePhases) if (!a.def.background) this.bus.emit('phase:stopped', { phaseId: a.def.id })
      this.activePhases = this.activePhases.filter(a => a.def.background)
    }
    this.activePhases.push({ def, elapsed: 0, pointer: 0 })
    this.bus.emit('phase:activated', { phaseId })
  }

  /** The boss HP floor (percent) set by the running phases; null when none */
  hpFloor(): number | null {
    const floors = this.activePhases.map(a => a.def.hpFloor).filter((f): f is number => f != null)
    return floors.length ? Math.max(...floors) : null
  }

  /**
   * Dev/practice: jump the most recent phase to `ms`. Skipped actions are re-emitted once with
   * `fastForward: true` so listeners can restore lasting state (visibility, arena shape, positions)
   * without replaying casts.
   */
  seek(ms: number): void {
    const active = this.latest()
    if (!active) return
    if (ms > active.elapsed) {
      const actions = active.def.actions
      for (let i = active.pointer; i < actions.length && actions[i].at < ms; i++) {
        if (actions[i].action !== 'loop') this.bus.emit('timeline:action', { ...actions[i], fastForward: true })
      }
    }
    this.combatElapsed += ms - active.elapsed
    active.elapsed = ms
    active.pointer = active.def.actions.findIndex(a => a.at >= ms)
    if (active.pointer < 0) active.pointer = active.def.actions.length
    this.bus.emit('timeline:loop', { phaseId: active.def.id, to: ms })
  }

  update(dt: number): void {
    this.combatElapsed += dt

    for (const active of this.activePhases) {
      active.elapsed += dt

      while (active.pointer < active.def.actions.length) {
        const action = active.def.actions[active.pointer]
        if (action.at > active.elapsed) break

        if (action.action === 'loop') {
          // Jump back to the target time: resume at the first action scheduled at/after it.
          // Resetting the pointer to 0 would replay every earlier action in one frame.
          const target = action.loop ?? 0
          active.elapsed = target
          active.pointer = active.def.actions.findIndex(a => a.at >= target)
          if (active.pointer < 0) active.pointer = active.def.actions.length
          this.bus.emit('timeline:loop', { phaseId: active.def.id, to: target })
          continue
        }

        this.bus.emit('timeline:action', { ...action, phaseId: active.def.id })
        active.pointer++
      }
    }
  }

  /** The most recently activated phase that is not a background one (what the HUD calls "the" phase) */
  private latest(): ActivePhase | undefined {
    const main = this.activePhases.filter(a => !a.def.background)
    return main[main.length - 1] ?? this.activePhases[this.activePhases.length - 1]
  }

  /** Flat list of upcoming/recent actions from the latest active phase, with absolute times for display */
  getAllActions(): { action: TimelineAction; phaseId: string; absoluteAt: number }[] {
    // Only show actions from the most recently activated phase
    const active = this.latest()
    if (!active) return []

    const result: { action: TimelineAction; phaseId: string; absoluteAt: number }[] = []
    const phaseStart = this.combatElapsed - active.elapsed
    for (const action of active.def.actions) {
      // Skip non-skill actions (teleport, enable_ai, etc.)
      if (action.action !== 'use') continue
      const absoluteAt = action.at + phaseStart
      // Only include actions within a reasonable window (not ancient history)
      if (absoluteAt < this.combatElapsed - 5000) continue
      result.push({ action, phaseId: active.def.id, absoluteAt })
    }
    return result
  }

  /** Get the latest active phase info for UI display */
  getLatestPhase(): { id: string; name?: string; index: number; total: number } | null {
    const latest = this.latest()
    if (!latest) return null
    const main = this.phases.filter(p => !p.background)
    return { id: latest.def.id, name: latest.def.name, index: main.indexOf(latest.def) + 1, total: main.length }
  }

  getPhaseElapsed(phaseId: string): number | null {
    const active = this.activePhases.find((a) => a.def.id === phaseId)
    return active ? active.elapsed : null
  }

  isPhaseActive(phaseId: string): boolean {
    return this.activePhases.some((a) => a.def.id === phaseId)
  }

  reset(): void {
    this.activePhases = []
    this.pendingPhases = new Set(this.phases.map((p) => p.id))
    this.combatElapsed = 0
  }
}

/** Callbacks provided by the game scene to evaluate trigger conditions */
export interface PhaseContext {
  /** Are all entities in this group dead? (e.g. 'adds_group1') */
  allKilledInGroup?: (group: string) => boolean
  /** Is any entity in this group at or below the given HP%? (e.g. 'boss', 50) */
  groupHpBelow?: (group: string, percent: number) => boolean
}
