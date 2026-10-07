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

describe('Paladin Holy Sheltron', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const buffSystem = new BuffSystem(bus)
    const resolver = new CombatResolver(bus, entityMgr, buffSystem, new Arena({ name: 't', shape: { type: 'circle', radius: 50 }, boundary: 'wall' }))
    resolver.registerBuffs(PALADIN_JOB.buffs)
    const pld = entityMgr.create({ id: 'pld', type: 'player', attack: 900, hp: 10000 })
    const boss = entityMgr.create({ id: 'boss', type: 'boss', attack: 1, hp: 999999 })
    const cast = () => bus.emit('skill:cast_complete', { caster: pld, skill: skill(PALADIN_JOB, 'pld_holy_sheltron') })
    return { buffSystem, resolver, pld, boss, cast }
  }

  it('grants mitigation and a shield', () => {
    const { buffSystem, pld, cast } = setup()
    cast()
    expect(buffSystem.getMitigations(pld)).toContain(0.2)
    expect(buffSystem.getShieldTotal(pld)).toBe(1500)
  })

  it('heals when the shield breaks', () => {
    const { resolver, pld, boss, cast } = setup()
    pld.hp = 5000
    cast()
    resolver.applyDamage(boss, pld, 2000) // −20% → 1600: 1500 absorbed, 100 through; shield broken → heal 1800
    expect(pld.hp).toBe(5000 - 100 + 1800)
  })

  it('heals when the shield runs out', () => {
    const { buffSystem, pld, cast } = setup()
    pld.hp = 5000
    cast()
    buffSystem.update(pld, 9000)
    expect(pld.hp).toBe(6800)
  })

  it('recasting never stacks shields and heals only once the shield actually ends', () => {
    const { buffSystem, pld, cast } = setup()
    pld.hp = 5000
    cast()
    cast()
    expect(buffSystem.getShieldTotal(pld)).toBe(1500)
    expect(pld.hp).toBe(5000)
  })
})
