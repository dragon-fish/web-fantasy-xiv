// src/game/parry-prompt.ts
// Drives the parry (拼刀) prompt from the `parry_ready` buff an encounter grants ahead of a tankbuster:
// while it is up, one press of the action key (Space) spends it and enters the parry stance
// (game/parry.ts). The ring tracks the ready buff, freezes where the player pressed and shows the
// verdict when the tankbuster lands. Present in every encounter; idle until the buff appears.
import type { EventBus } from '@/core/event-bus'
import type { BuffSystem } from '@/combat/buff'
import type { BuffInstance, Entity } from '@/entity/entity'
import type { FlurryGuard } from '@/core/types'
import type { QtePrompt } from './game-scene'
import { PARRY_BUFFS, PARRY_ENTRY, PARRY_READY, PARRY_WINDOWS } from './parry'

export type ClashGrade = 'just' | 'perfect' | 'good' | 'early' | 'late'

const LABEL: Record<ClashGrade, string> = { just: 'JUST!', perfect: 'PERFECT', good: 'GOOD', early: 'EARLY', late: 'LATE' }
const GRADE: Record<FlurryGuard, ClashGrade> = { perfect: 'just', deflect: 'perfect', block: 'good', none: 'late' }

/** Verdict stays on screen this long */
const SHOW_MS = 800
/** Close quietly if the strike never lands (boss died, cast interrupted) */
const ABANDON_AFTER_MS = 2000

export interface ParryPromptDeps {
  bus: EventBus
  player: Entity
  buffs: BuffSystem
  input: { actionPresses: number }
  setQte: (prompt: QtePrompt | null) => void
}

interface Open {
  elapsed: number
  windup: number
  pressedAt: number | null
  grade: ClashGrade | null
  shownUntil: number
}

export function createParryPrompt({ bus, player, buffs, input, setQte }: ParryPromptDeps) {
  let open: Open | null = null
  /** The ready buff the current/last prompt was opened for — each grant opens one prompt only */
  let handled: BuffInstance | null = null
  let seenPresses = input.actionPresses

  // Whoever granted the ready buff (often an invisible helper) doesn't matter; the clash plays against
  // the tankbuster's own attacker
  bus.on('combat:parry', (e: { sourceId: string; targetId: string; guard: FlurryGuard }) => {
    if (!open || open.grade || e.targetId !== player.id) return
    // A stance that ran out before the strike is "early"; never pressing is "late"
    open.grade = e.guard === 'none' && open.pressedAt !== null ? 'early' : GRADE[e.guard]
    open.shownUntil = open.elapsed + SHOW_MS
    bus.emit('mechanic:clash_result', { id: 'parry', grade: open.grade, sourceId: e.sourceId, targetId: player.id })
  })

  const close = () => {
    open = null
    setQte(null)
  }

  return {
    update(dt: number): void {
      // Presses only count while the ready buff is up; never carried over from before
      const pressed = input.actionPresses > seenPresses
      seenPresses = input.actionPresses
      const ready = player.buffs.find(b => b.defId === PARRY_READY)

      if (!open) {
        if (!ready || ready === handled) return
        handled = ready
        open = { elapsed: 0, windup: ready.remaining, pressedAt: null, grade: null, shownUntil: 0 }
        bus.emit('mechanic:clash_start', { id: 'parry', sourceId: null, targetId: player.id, windup: open.windup })
      } else {
        open.elapsed += dt
      }

      if (pressed && ready && open.pressedAt === null && !open.grade && player.alive) {
        open.pressedAt = open.elapsed
        buffs.removeBuff(player, PARRY_READY, 'consumed')
        buffs.applyBuff(player, PARRY_BUFFS[PARRY_ENTRY], player.id)
      }

      if (open.grade && open.elapsed >= open.shownUntil) return close()
      if (!open.grade && open.elapsed > open.windup + ABANDON_AFTER_MS) return close()
      setQte({
        elapsed: open.elapsed, windup: open.windup, windows: PARRY_WINDOWS,
        grade: open.grade && LABEL[open.grade], pressedAt: open.pressedAt,
      })
    },
  }
}
