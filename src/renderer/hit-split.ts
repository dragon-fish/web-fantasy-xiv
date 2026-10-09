// src/renderer/hit-split.ts
// Presentation of multi-hit attacks. FFXIV resolves the whole attack in one frame; the hits are
// a show, so this only splits an already-dealt total into fly-text numbers.

/** Interval between the shown hits of a multi-hit attack */
export const HIT_INTERVAL_MS = 80

/** Split `total` into `hits` positive integers that vary a little and add up exactly to `total`. */
export function splitHits(total: number, hits: number): number[] {
  const n = Math.max(1, Math.min(Math.floor(hits), Math.floor(total)))
  // Deterministic ±15% wobble so the numbers read as separate strikes
  const weights = Array.from({ length: n }, (_, i) => 1 + 0.15 * Math.sin(i * 2.3 + 0.7))
  const sum = weights.reduce((a, b) => a + b, 0)
  const parts = weights.map(w => Math.max(1, Math.floor((total * w) / sum)))
  parts[n - 1] += total - parts.reduce((a, b) => a + b, 0)
  return parts
}
