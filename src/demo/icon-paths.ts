function iconPath(dir: string, id: number): string {
  return `${import.meta.env.BASE_URL}assets/images/${dir}/${String(id).padStart(6, '0')}_hr1.png`
}

/** Status effect icon (e.g. 15005 → "assets/images/effects/015005_hr1.png") */
export function effectIcon(id: number): string {
  return iconPath('effects', id)
}

/** Player skill effect icon (e.g. 10152 → "assets/images/player_skill_effects/010152_hr1.png") */
export function skillEffectIcon(id: number): string {
  return iconPath('player_skill_effects', id)
}

/**
 * Build a Record<number, string> for per-stack icons from a contiguous range.
 * @param iconFn  - icon path builder (effectIcon or skillEffectIcon)
 * @param baseId  - the icon ID for stack 1
 * @param count   - number of stacks (e.g. 16 produces keys 1–16)
 * @param fallbackId - optional icon ID for key 0 (fallback when stack count exceeds range)
 */
export function stackIcons(
  iconFn: (id: number) => string,
  baseId: number,
  count: number,
  fallbackId?: number,
): Record<number, string> {
  const map: Record<number, string> = {}
  if (fallbackId !== undefined) map[0] = iconFn(fallbackId)
  for (let i = 1; i <= count; i++) {
    map[i] = iconFn(baseId + i - 1)
  }
  return map
}
