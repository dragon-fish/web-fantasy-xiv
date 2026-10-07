import { it, expect, describe } from 'vitest'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { CombatResolver } from '@/game/combat-resolver'
import { PALADIN_JOB } from './index'
import { simulate, printResult, skill } from '../sim-test-utils'

it('Paladin DPS — Vanguard×4 → Holy Spirit×4 cycle', () => {
  const job = PALADIN_JOB
  const result = simulate(job, {
    gcdCycle: [
      skill(job, 'pld_vanguard'),
      skill(job, 'pld_vanguard'),
      skill(job, 'pld_vanguard'),
      skill(job, 'pld_vanguard'),
      skill(job, 'pld_holy_spirit'),
      skill(job, 'pld_holy_spirit'),
      skill(job, 'pld_holy_spirit'),
      skill(job, 'pld_holy_spirit'),
    ],
  })
  printResult('Paladin', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})

describe('Paladin Oath → Holy Sheltron', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const buffSystem = new BuffSystem(bus)
    const resolver = new CombatResolver(bus, entityMgr, buffSystem, new Arena({ name: 't', shape: { type: 'circle', radius: 50 }, boundary: 'wall' }))
    resolver.registerBuffs(PALADIN_JOB.buffs)
    const pld = entityMgr.create({ id: 'pld', type: 'player', attack: 900, hp: 10000 })
    const boss = entityMgr.create({ id: 'boss', type: 'boss', attack: 1, hp: 999999 })
    pld.target = 'boss'
    return { bus, buffSystem, pld }
  }
  const sheltron = skill(PALADIN_JOB, 'pld_holy_sheltron')

  it('auto-attacks build Oath on the paladin, 10 per hit', () => {
    const { bus, buffSystem, pld } = setup()
    for (let i = 0; i < 3; i++) bus.emit('skill:cast_complete', { caster: pld, skill: PALADIN_JOB.autoAttackSkill })
    expect(buffSystem.getStacks(pld, 'pld_oath')).toBe(30)
  })

  it('spends 50 Oath for mitigation plus a shield', () => {
    const { bus, buffSystem, pld } = setup()
    for (let i = 0; i < 6; i++) bus.emit('skill:cast_complete', { caster: pld, skill: PALADIN_JOB.autoAttackSkill })
    bus.emit('skill:cast_complete', { caster: pld, skill: sheltron })
    expect(buffSystem.getStacks(pld, 'pld_oath')).toBe(10)
    expect(buffSystem.getMitigations(pld)).toContain(0.2)
    expect(buffSystem.getStacks(pld, 'shield')).toBe(1500)
  })
})
