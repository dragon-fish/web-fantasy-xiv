// src/renderer/vfx/vfx-style.ts
import type { SkillDef, VfxDelivery, VfxElement } from '@/core/types'

export interface SkillVfx {
  element: VfxElement
  delivery: VfxDelivery
}

/** Melee reach: anything farther than this is drawn as a projectile. */
const MELEE_RANGE = 6

/**
 * Resolve a skill's visual style. Explicit `skill.vfx` fields win; the rest is
 * inferred from what the skill does: zones → burst, damage → melee/projectile
 * by range, heal-only → heal buff, everything else → buff aura.
 */
export function resolveSkillVfx(skill: SkillDef, fallbackElement: VfxElement = 'physical'): SkillVfx {
  const effects = skill.effects ?? []
  const deals = effects.some(e => e.type === 'damage')
  const heals = effects.some(e => e.type === 'heal')

  let delivery: VfxDelivery
  if (skill.zones?.length) delivery = 'burst'
  else if (deals) delivery = skill.range > MELEE_RANGE ? 'projectile' : 'melee'
  else delivery = 'buff'

  let element: VfxElement
  if (heals && !deals) element = 'heal'
  else if (skill.type === 'spell') element = fallbackElement === 'physical' ? 'aether' : fallbackElement
  else element = fallbackElement

  return { element: skill.vfx?.element ?? element, delivery: skill.vfx?.delivery ?? delivery }
}
