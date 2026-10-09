import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import type { QtePrompt } from './game-scene'
import { createParryPrompt } from './parry-prompt'
import { PARRY_BUFFS, PARRY_READY } from './parry'

function setup(presses = 0) {
  const bus = new EventBus()
  const buffs = new BuffSystem(bus)
  const player = new EntityManager(bus).create({ id: 'player', type: 'player', hp: 8000 })
  const input = { actionPresses: presses }
  const shown: (QtePrompt | null)[] = []
  const prompt = createParryPrompt({ bus, player, buffs, input, setQte: q => shown.push(q) })
  const ready = () => buffs.applyBuff(player, PARRY_BUFFS[PARRY_READY], 'boss', 1, 1000)
  const press = () => { input.actionPresses++ }
  const stances = () => player.buffs.map(b => b.defId).filter(id => id !== PARRY_READY)
  const land = (guard: string) => bus.emit('combat:parry', { targetId: 'player', guard })
  const last = () => shown.at(-1) ?? null
  return { prompt, ready, press, stances, land, last, player }
}

describe('parry prompt', () => {
  it('stays idle and ignores Space without the ready buff', () => {
    const { prompt, press, stances, last } = setup()
    press()
    prompt.update(16)
    expect(stances()).toEqual([])
    expect(last()).toBeNull()
  })

  it('one press while ready spends it and enters the stance; later presses do nothing', () => {
    const { prompt, ready, press, stances, player } = setup()
    ready()
    prompt.update(16)
    press()
    prompt.update(16)
    expect(stances()).toEqual(['parry_perfect'])
    expect(player.buffs.some(b => b.defId === PARRY_READY)).toBe(false)
    press()
    prompt.update(16)
    expect(stances()).toEqual(['parry_perfect'])
  })

  it('does not count a press made before the ready buff appeared', () => {
    const { prompt, ready, press, stances } = setup()
    press()
    prompt.update(16)
    ready()
    prompt.update(16)
    expect(stances()).toEqual([])
  })

  it('freezes the ring where the player pressed', () => {
    const { prompt, ready, press, last } = setup()
    ready()
    prompt.update(16)
    for (let i = 0; i < 10; i++) prompt.update(16)
    press()
    prompt.update(16)
    for (let i = 0; i < 10; i++) prompt.update(16)
    expect(last()?.pressedAt).toBe(176)
  })

  it('shows the verdict, telling a missed press from an expired one, then clears', () => {
    const missed = setup()
    missed.ready()
    missed.prompt.update(16)
    missed.land('none')
    missed.prompt.update(16)
    expect(missed.last()?.grade).toBe('LATE')
    for (let i = 0; i < 60; i++) missed.prompt.update(16)
    expect(missed.last()).toBeNull()

    const early = setup()
    early.ready()
    early.prompt.update(16)
    early.press()
    early.prompt.update(16)
    early.land('none')
    early.prompt.update(16)
    expect(early.last()?.grade).toBe('EARLY')
  })
})
