import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { SkillResolver } from '@/skill/skill-resolver'
import { CombatResolver } from '@/game/combat-resolver'
import { WHITE_MAGE_JOB } from './index'
import { WHITE_MAGE_RAISE } from './skills'
import { simulate, printResult, skill } from '../sim-test-utils'

it('White Mage DPS — Glare spam', () => {
  const job = WHITE_MAGE_JOB
  const result = simulate(job, { gcdCycle: [skill(job, 'whm_glare')] })
  printResult('White Mage', job, result)
  expect(result.totalDamage).toBeGreaterThan(0)
})

function setup() {
  const bus = new EventBus()
  const mgr = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  const zones = new AoeZoneManager(bus, mgr)
  const skills = new SkillResolver(bus, mgr, buffs, zones)
  const combat = new CombatResolver(bus, mgr, buffs, new Arena({ name: 't', shape: { type: 'circle', radius: 60 }, boundary: 'wall' }), zones)
  combat.registerBuffs(WHITE_MAGE_JOB.buffs)
  const whm = mgr.create({ id: 'whm', type: 'player', hp: 9000, mp: 10000, attack: 1000, position: { x: 0, y: 0, z: 0 } })
  const ally = (id: string, x: number, hp: number) => {
    const e = mgr.create({ id, type: 'player', hp: 9000, attack: 1000, position: { x, y: 0, z: 0 } })
    e.hp = hp
    return e
  }
  const use = (id: string) => {
    const s = id === 'whm_raise' ? WHITE_MAGE_RAISE : skill(WHITE_MAGE_JOB, id)
    const ok = skills.tryUse(whm, s)
    skills.updateAll(s.castTime)
    whm.gcdTimer = 0
    return ok
  }
  return { mgr, buffs, combat, whm, ally, use }
}

describe('White Mage', () => {
  it('Cure II lands on the lowest-HP party member in range', () => {
    const { whm, ally, use } = setup()
    const tank = ally('tank', 5, 6000)
    const dps = ally('dps', 8, 2000)
    use('whm_cure_ii')
    expect(dps.hp).toBe(6000)
    expect(tank.hp).toBe(6000)
    expect(whm.hp).toBe(9000)
  })

  it('Afflatus Rapture grows a Blood Lily only when it heals someone hurt', () => {
    const { buffs, whm, ally, use, combat } = setup()
    combat.grantBuff(whm, 'whm_lily')
    combat.grantBuff(whm, 'whm_lily')
    const dps = ally('dps', 5, 9000)
    use('whm_afflatus_rapture')
    expect(buffs.getStacks(whm, 'whm_blood_lily')).toBe(0)
    dps.hp = 4000
    use('whm_afflatus_rapture')
    expect(buffs.getStacks(whm, 'whm_blood_lily')).toBe(1)
    expect(buffs.getStacks(whm, 'whm_lily')).toBe(0)
  })

  it('Free Raise is instant and free, then comes back 180s later', () => {
    const { buffs, whm, ally, use, combat } = setup()
    combat.grantBuff(whm, 'whm_free_raise')
    expect(use('whm_raise')).toBe(false) // nobody to raise
    const fallen = ally('dps', 6, 0)
    fallen.alive = false
    expect(use('whm_raise')).toBe(true)
    expect(fallen.alive).toBe(true)
    expect(fallen.hp).toBe(4500)
    expect(whm.mp).toBe(10000)
    expect(buffs.hasBuff(whm, 'whm_free_raise')).toBe(false)
    buffs.update(whm, 179999)
    expect(buffs.hasBuff(whm, 'whm_free_raise')).toBe(false)
    buffs.update(whm, 1)
    expect(buffs.hasBuff(whm, 'whm_free_raise')).toBe(true)
  })

  it('Medica II leaves a regen on party members in range', () => {
    const { buffs, whm, ally, use } = setup()
    const near = ally('near', 10, 1000)
    const far = ally('far', 20, 1000)
    use('whm_medica_ii')
    expect(near.hp).toBe(3500)
    expect(buffs.hasBuff(near, 'whm_medica_ii')).toBe(true)
    expect(buffs.hasBuff(whm, 'whm_medica_ii')).toBe(true)
    expect(buffs.hasBuff(far, 'whm_medica_ii')).toBe(false)
  })

  it('Temperance covers party members within 30m only', () => {
    const { buffs, whm, ally, use } = setup()
    const near = ally('near', 10, 9000)
    const far = ally('far', 40, 9000)
    use('whm_temperance')
    expect(buffs.hasBuff(whm, 'whm_temperance')).toBe(true)
    expect(buffs.hasBuff(near, 'whm_temperance')).toBe(true)
    expect(buffs.hasBuff(far, 'whm_temperance')).toBe(false)
  })
})
