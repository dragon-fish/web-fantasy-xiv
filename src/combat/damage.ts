// src/combat/damage.ts
export interface DamageParams {
  attack: number
  potency: number
  increases: number[]   // e.g. [0.3, 0.5] = +30% +50%
  mitigations: number[] // e.g. [0.2, 0.8] = 20% and 80% reduction
}

export function calculateDamage(params: DamageParams): number {
  const { attack, potency, increases, mitigations } = params

  const raw = attack * potency

  const increaseSum = increases.reduce((sum, v) => sum + v, 0)
  const amplified = raw * (1 + increaseSum)

  const mitigated = mitigations.reduce((dmg, v) => dmg * (1 - v), amplified)

  // Round to avoid floating-point artifacts (e.g. 1280 becoming 1279.9999…),
  // then floor to drop any genuine fractional remainder.
  return Math.max(0, Math.floor(Math.round(mitigated * 1000) / 1000))
}
