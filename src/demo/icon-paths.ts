const CDN_BASE = import.meta.env.VITE_CDN_BASE || 'https://r2.epb.wiki/ffxiv/'

/** Build asset path for an icon by folder and numeric ID (zero-padded to 6 digits, _hr1.png suffix) */
export function icon(folder: string, id: number): string {
  return `${CDN_BASE}${folder}/${String(id).padStart(6, '0')}_hr1.png`
}

/**
 * Build a Record<number, string> for per-stack icons from a contiguous range.
 * @param folder     - asset subfolder (e.g. 'effects', 'player_skill_effects')
 * @param baseId     - the icon ID for stack 1
 * @param count      - number of stacks (e.g. 16 produces keys 1–16)
 * @param fallbackId - optional icon ID for key 0 (fallback when stack count exceeds range)
 */
export function stackIcons(
  folder: string,
  baseId: number,
  count: number,
  fallbackId?: number,
): Record<number, string> {
  const map: Record<number, string> = {}
  if (fallbackId !== undefined) map[0] = icon(folder, fallbackId)
  for (let i = 1; i <= count; i++) {
    map[i] = icon(folder, baseId + i - 1)
  }
  return map
}
