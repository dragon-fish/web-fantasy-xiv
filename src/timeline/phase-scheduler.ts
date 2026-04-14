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

    this.activePhases.push({ def, elapsed: 0, pointer: 0 })
    this.bus.emit('phase:activated', { phaseId })
  }

  update(dt: number): void {
    this.combatElapsed += dt

    for (const active of this.activePhases) {
      active.elapsed += dt

      while (active.pointer < active.def.actions.length) {
        const action = active.def.actions[active.pointer]
        if (action.at > active.elapsed) break

        if (action.action === 'loop') {
          active.elapsed = action.loop ?? 0
          active.pointer = 0
          continue
        }

        this.bus.emit('timeline:action', action)
        active.pointer++
      }
    }
  }

  /** Flat list of upcoming/recent actions from the latest active phase, with absolute times for display */
  getAllActions(): { action: TimelineAction; phaseId: string; absoluteAt: number }[] {
    // Only show actions from the most recently activated phase
    const active = this.activePhases[this.activePhases.length - 1]
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
    if (this.activePhases.length === 0) return null
    const latest = this.activePhases[this.activePhases.length - 1]
    const index = this.phases.indexOf(latest.def)
    return { id: latest.def.id, name: latest.def.name, index: index + 1, total: this.phases.length }
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
  /** Is any entity in this group below the given HP%? (e.g. 'boss', 50) */
  groupHpBelow?: (group: string, percent: number) => boolean
}
