import { EventBus } from '@/core/event-bus'
import { BuffSystem } from '@/combat/buff'
import { EntityManager } from '@/entity/entity-manager'
import { createPlayerRevive, createRaiseSequence, nextReviveTier, REVIVE_BUFFS } from './player-revive'

const has = (e: { buffs: { defId: string }[] }, id: string) => e.buffs.some(b => b.defId === id)

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

  it('no revive once disabled (enrage)', () => {
    const { revive, die } = setup()
    revive.disable()
    expect(die()).toBe(false)
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

describe('revive keeps death-preserved buffs', () => {
  it('practice immunity survives a fall death and the revive', async () => {
    const { COMMON_BUFFS } = await import('@/jobs/commons/buffs')
    const { buffs, player, die, flush } = setup()
    buffs.applyBuff(player, COMMON_BUFFS.practice_immunity, player.id)
    die(); flush()
    expect(player.buffs.some(b => b.defId === 'practice_immunity')).toBe(true)
  })
})

describe('party raise', () => {
  function raiseSetup() {
    const bus = new EventBus()
    const buffs = new BuffSystem(bus)
    const ally = new EntityManager(bus).create({ id: 'a', type: 'player', hp: 8000, maxHp: 8000 })
    const queue: (() => void)[] = []
    createRaiseSequence({ bus, buffSystem: buffs, schedule: (_ms, fn) => queue.push(fn) })
    const raise = () => {
      ally.alive = false
      buffs.clearDeathBuffs(ally)
      ally.customData.raising = true
      bus.emit('party:raising', { entity: ally, by: null, hpPercent: 0.5 })
      queue.shift()!()
    }
    return { bus, buffs, ally, queue, raise }
  }

  it('stays down through the hard stun, then stands with the raise HP, Weakness and transcendence', () => {
    const { bus, ally, queue } = raiseSetup()
    ally.alive = false
    ally.customData.raising = true
    const raised = vi.fn()
    bus.on('party:raised', raised)
    bus.emit('party:raising', { entity: ally, by: null, hpPercent: 0.5 })
    expect(ally.alive).toBe(false)
    expect(raised).not.toHaveBeenCalled()
    queue.shift()!()
    expect(ally.alive).toBe(true)
    expect(ally.hp).toBe(4000)
    expect(ally.customData.raising).toBeUndefined()
    expect(raised).toHaveBeenCalledOnce()
    expect(has(ally, 'revive_weakness')).toBe(true)
    expect(has(ally, 'revive_transcendent')).toBe(true)
    bus.emit('skill:cast_start', { caster: ally, skill: { id: 'gcd' } })
    expect(has(ally, 'revive_transcendent')).toBe(false)
  })

  it('dying with Weakness or Brink stands up at Brink — they survive death, unlike other buffs', () => {
    const { ally, raise } = raiseSetup()
    raise()
    raise()
    expect(has(ally, 'revive_weakness')).toBe(false)
    expect(has(ally, 'revive_brink')).toBe(true)
    expect(ally.maxHp).toBe(6000)
    expect(ally.hp).toBe(3000)
    raise()
    expect(has(ally, 'revive_brink')).toBe(true)
  })
})
