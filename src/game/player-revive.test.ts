import { EventBus } from '@/core/event-bus'
import { BuffSystem } from '@/combat/buff'
import { EntityManager } from '@/entity/entity-manager'
import { createPlayerRevive, nextReviveTier, REVIVE_BUFFS } from './player-revive'

function setup() {
  const bus = new EventBus()
  const buffs = new BuffSystem(bus)
  const player = new EntityManager(bus).create({ id: 'p', type: 'player', hp: 8000, maxHp: 8000, mp: 0, maxMp: 10000 })
  const queue: (() => void)[] = []
  const revive = createPlayerRevive({ bus, player, buffSystem: buffs, schedule: (_ms, fn) => queue.push(fn) })
  const die = () => { player.hp = 0; player.alive = false; return revive.tryRevive() }
  const flush = () => { while (queue.length) queue.shift()!() }
  return { bus, buffs, player, revive, die, flush }
}

describe('player revive ladder', () => {
  it('weakness after the first death, brink after the second, then no revive', () => {
    const { player, die, flush } = setup()
    expect(die()).toBe(true); flush()
    expect(player.alive).toBe(true)
    expect(nextReviveTier(player)).toBe('revive_brink')
    expect(die()).toBe(true); flush()
    expect(player.buffs.some(b => b.defId === 'revive_weakness')).toBe(false)
    expect(player.maxHp).toBe(6000)
    expect(player.hp).toBe(6000)
    expect(die()).toBe(false)
  })

  it('restores 25% MP and grants transcendence that breaks on any action', () => {
    const { bus, player, die, flush } = setup()
    die(); flush()
    expect(player.mp).toBe(2500)
    expect(player.buffs.some(b => b.defId === 'revive_transcendent')).toBe(true)
    bus.emit('skill:cast_complete', { caster: player, skill: { id: 'auto' } })
    expect(player.buffs.some(b => b.defId === 'revive_transcendent')).toBe(false)
  })

  it('drops the target on revive so auto-attacks do not break transcendence', () => {
    const { player, die, flush } = setup()
    player.target = 'boss'
    die(); flush()
    expect(player.target).toBeNull()
  })

  it('stays dead until the scheduled revive fires', () => {
    const { player, revive, die, flush } = setup()
    die()
    expect(player.alive).toBe(false)
    expect(revive.isPending()).toBe(true)
    flush()
    expect(revive.isPending()).toBe(false)
  })
})
