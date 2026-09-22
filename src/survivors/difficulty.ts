export const GEM_LIFETIME = 20000
export const GEM_LIMIT = 160

/** Two-minute opening, followed by continuous pressure on both build and positioning. */
export function difficultyAt(elapsed: number) {
  const opening = Math.min(1, elapsed / 120000)
  const pressure = Math.max(0, (elapsed - 120000) / 60000)
  return {
    spawnInterval: Math.max(220, 900 - opening * 100 - pressure * 95),
    batch: 1 + Math.floor(pressure / 1.5),
    hp: 32 + opening * 14 + pressure * 25 + pressure * pressure * 7,
    attack: 10 + opening * 4 + pressure * 7,
    speed: 1 + pressure * 0.065,
    enemyLimit: Math.min(240, Math.floor(65 + pressure * 30)),
  }
}
