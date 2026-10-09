import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import type { BuffDef, SkillDef, SkillEffectDef } from '@/core/types'
import { CombatResolver } from './combat-resolver'
import { PARRY_BUFFS, enterParryStance } from './parry'

const OPENING: BuffDef = { id: 'opening', name: '破绽', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1, effects: [{ type: 'damage_increase', value: -0.2 }] }

function setup() {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const resolver = new CombatResolver(bus, entityMgr, buffSystem, new Arena({ name: 't', shape: { type: 'circle', radius: 50 }, boundary: 'wall' }))
  resolver.registerBuffs({ ...PARRY_BUFFS, opening: OPENING })
  const boss = entityMgr.create({ id: 'boss', type: 'boss', attack: 1, hp: 999999 })
  const player = entityMgr.create({ id: 'player', type: 'player', attack: 1000, hp: 10000 })
  boss.target = 'player'
  const parries: string[] = []
  bus.on('combat:parry', (p: { guard: string }) => parries.push(p.guard))
  const strike = (effect: Partial<Extract<SkillEffectDef, { type: 'damage' }>> = {}) => bus.emit('skill:cast_complete', {
    caster: boss,
    skill: {
      id: 'flurry', name: '鬼宿脚', type: 'spell', castTime: 0, cooldown: 0, gcd: false, targetType: 'single', requiresTarget: true, range: 99, mpCost: 0,
      effects: [{ type: 'damage', potency: 8000, dmgType: ['physical', 'tankbuster'], onUnparried: [{ type: 'apply_buff', buffId: 'opening', target: 'target' }], ...effect }],
    } as SkillDef,
  })
  const parry = () => enterParryStance(buffSystem, player)
  const tick = (ms: number) => buffSystem.update(player, ms)
  const has = (id: string) => buffSystem.hasBuff(player, id)
  return { player, strike, parry, tick, has, parries }
}

describe('parry stance', () => {
  const stacks = (h: ReturnType<typeof setup>) => h.player.buffs.find(b => b.defId === 'parry_stance')?.stacks ?? 0

  it('loses a stack per stage on exact durations (perfect 3 → block 2 → guard 1), with no hidden grace', () => {
    const h = setup()
    h.parry()
    h.tick(199); expect(stacks(h)).toBe(3)
    h.tick(1); expect(stacks(h)).toBe(2)
    h.tick(250); expect(stacks(h)).toBe(1)
    h.tick(449); expect(stacks(h)).toBe(1)
    h.tick(1); expect(stacks(h)).toBe(0)
  })

  it('a long tick carries its overshoot into the next stack instead of restarting it', () => {
    const h = setup()
    h.parry()
    h.tick(450) // 200 at 3 stacks + all 250 at 2 stacks
    expect(stacks(h)).toBe(1)
    h.tick(449); expect(stacks(h)).toBe(1)
    h.tick(1); expect(stacks(h)).toBe(0)
  })

  it('a perfect parry takes nothing and grants Keen Eye', () => {
    const { player, strike, parry, has, parries } = setup()
    parry()
    strike()
    expect(player.hp).toBe(10000)
    expect(has('parry_keen_eye')).toBe(true)
    expect(parries).toEqual(['perfect'])
  })

  it('a guard only softens the hit', () => {
    const { player, strike, parry, tick, parries } = setup()
    parry()
    tick(450)
    strike()
    expect(player.hp).toBe(10000 - 8000 * 0.25)
    expect(parries).toEqual(['block'])
  })

  it('the stance is spent by the hit', () => {
    const { strike, parry, has } = setup()
    parry()
    strike()
    expect(has('parry_stance')).toBe(false)
  })

  it('an unparried tankbuster lands in full plus the encounter-defined penalty', () => {
    const { player, strike, has, parries } = setup()
    strike()
    expect(player.hp).toBe(2000)
    expect(has('opening')).toBe(true)
    expect(parries).toEqual(['none'])
  })

  it('only tankbusters are parried', () => {
    const { player, strike, parry, has } = setup()
    parry()
    strike({ dmgType: 'physical', onUnparried: undefined })
    expect(player.hp).toBe(2000)
    expect(has('parry_stance')).toBe(true)
  })
})
