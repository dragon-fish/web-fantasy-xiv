import type { SkillDef } from '@/core/types'
import { resolveSkillVfx } from './vfx-style'

const base: SkillDef = { id: 's', name: 's', type: 'weaponskill', castTime: 0, cooldown: 0, gcd: true, targetType: 'single', requiresTarget: true, range: 4, mpCost: 0 }
const dmg = [{ type: 'damage' as const, potency: 1 }]

describe('resolveSkillVfx', () => {
  it('draws short-range damage as melee and long-range as projectile', () => {
    expect(resolveSkillVfx({ ...base, effects: dmg }).delivery).toBe('melee')
    expect(resolveSkillVfx({ ...base, range: 20, effects: dmg }).delivery).toBe('projectile')
  })
  it('zones always render as a burst, even with damage effects', () => {
    const zone = { anchor: { type: 'caster' as const }, direction: { type: 'none' as const }, shape: { type: 'circle' as const, radius: 5 }, resolveDelay: 0, hitEffectDuration: 300, effects: dmg }
    expect(resolveSkillVfx({ ...base, effects: dmg, zones: [zone] }).delivery).toBe('burst')
  })
  it('heal-only skills get the heal element; damage+heal keeps the damage element', () => {
    expect(resolveSkillVfx({ ...base, range: 0, effects: [{ type: 'heal', potency: 1 }] })).toEqual({ element: 'heal', delivery: 'buff' })
    expect(resolveSkillVfx({ ...base, effects: [...dmg, { type: 'heal', potency: 1 }] }, 'dark').element).toBe('dark')
  })
  it('explicit vfx fields override inference independently', () => {
    expect(resolveSkillVfx({ ...base, effects: dmg, vfx: { element: 'ice' } })).toEqual({ element: 'ice', delivery: 'melee' })
    expect(resolveSkillVfx({ ...base, range: 20, effects: dmg, vfx: { delivery: 'beam' } }).delivery).toBe('beam')
  })
})
