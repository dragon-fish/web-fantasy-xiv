// src/renderer/characters/animation-state.ts
import type { AnimRole } from './model-catalog'

export interface OneShot {
  role: Extract<AnimRole, 'attack' | 'castRelease' | 'shoot' | 'hit'>
  /** Render-clock ms when the one-shot finishes */
  until: number
}

export interface AnimInput {
  alive: boolean
  casting: boolean
  moving: boolean
  inCombat: boolean
  oneShot: OneShot | null
  now: number
}

/**
 * Pick the animation role for this frame.
 * Priority: death > attack/release one-shots > casting > hit flinch > movement > idle.
 * A hit flinch never interrupts a cast or an attack swing; moving cancels a flinch
 * (so dodging stays responsive) but not an attack.
 */
export function selectAnimation(s: AnimInput): AnimRole {
  if (!s.alive) return 'death'
  const shot = s.oneShot && s.oneShot.until > s.now ? s.oneShot : null
  if (shot && shot.role !== 'hit') return shot.role
  if (s.casting) return 'castLoop'
  if (shot && !s.moving) return 'hit'
  if (s.moving) return 'move'
  return s.inCombat ? 'combatIdle' : 'idle'
}

/** Resolve a role to a concrete clip, falling back through related roles. */
const FALLBACK: Record<AnimRole, AnimRole[]> = {
  idle: [],
  combatIdle: ['idle'],
  move: ['idle'],
  attack: ['castRelease'],
  castLoop: ['combatIdle', 'idle'],
  castRelease: ['attack'],
  shoot: ['attack', 'castRelease'],
  hit: [],
  death: [],
}

export function resolveClip(
  role: AnimRole,
  clips: Partial<Record<AnimRole, string[]>>,
  has: (clip: string) => boolean,
  variant = 0,
): string | null {
  for (const r of [role, ...FALLBACK[role]]) {
    const list = (clips[r] ?? []).filter(has)
    if (list.length) return list[variant % list.length]
  }
  return null
}
