import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { EnmitySystem } from './enmity'

function setup() {
  const bus = new EventBus()
  const mgr = new EntityManager(bus)
  const enmity = new EnmitySystem(bus, mgr)
  const boss = mgr.create({ id: 'boss', type: 'boss', hp: 100000 })
  const tank = mgr.create({ id: 'tank', type: 'player', role: 'tank', npc: true, hp: 10000 })
  const healer = mgr.create({ id: 'healer', type: 'player', role: 'healer', hp: 10000 })
  const dps = mgr.create({ id: 'dps', type: 'player', role: 'dps', npc: true, hp: 10000 })
  enmity.engage(boss)
  const hit = (source: any, amount: number) => bus.emit('damage:dealt', { source, target: boss, amount })
  const heal = (source: any, target: any, amount: number, overheal = 0) => bus.emit('damage:dealt', { source, target, amount: -amount, overheal })
  return { bus, enmity, boss, tank, healer, dps, hit, heal }
}

describe('EnmitySystem', () => {
  it('damage dealt is enmity, and a tank draws ten times as much', () => {
    const { enmity, boss, tank, dps, hit } = setup()
    hit(dps, 5000)
    hit(tank, 600)
    expect(enmity.get(boss, dps)).toBe(5000)
    expect(enmity.get(boss, tank)).toBe(6000)
    expect(enmity.top(boss)).toBe(tank)
  })

  it('healing a member on the list draws half enmity; overheal counts 1.5× on top', () => {
    const { enmity, boss, healer, tank, heal } = setup()
    heal(healer, tank, 4000, 1000)
    expect(enmity.get(boss, healer)).toBe((3000 + 1500) * 0.5)
  })

  it('periodic ticks carry only the caster id and still count', () => {
    const { enmity, boss, healer, tank, heal } = setup()
    heal({ id: 'healer' }, tank, 500)
    expect(enmity.get(boss, healer)).toBe(250)
  })

  it('the next in line takes over when the top falls', () => {
    const { bus, enmity, boss, tank, dps, hit } = setup()
    hit(tank, 1000)
    hit(dps, 2000)
    tank.alive = false
    bus.emit('entity:died', { entity: tank })
    expect(enmity.top(boss)).toBe(dps)
  })
  it('a raised tank provokes with its first action on an enemy, even a damage-less one', () => {
    const { bus, enmity, boss, tank, dps, healer, hit, heal } = setup()
    hit(dps, 50000)
    tank.alive = false
    bus.emit('entity:died', { entity: tank })
    tank.alive = true
    bus.emit('party:raised', { entity: tank })
    heal(healer, tank, 1000)
    heal(tank, dps, 500) // heal spillover is not a provoke
    expect(enmity.top(boss)).toBe(dps)
    tank.target = 'boss'
    bus.emit('skill:cast_complete', { caster: tank, skill: { id: 'dash' } })
    expect(enmity.get(boss, tank)).toBe(50000 + 1)
    expect(enmity.top(boss)).toBe(tank)
    hit(tank, 100) // later gains add normally
    expect(enmity.get(boss, tank)).toBe(50001 + 1000)
  })
})
