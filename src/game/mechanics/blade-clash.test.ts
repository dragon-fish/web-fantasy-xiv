import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { bladeClash } from './blade-clash'
import type { MechanicContext } from './mechanic-host'

function setup(presses = 0) {
  const bus = new EventBus()
  const entities = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  entities.create({ id: 'boss', type: 'boss', hp: 100, attack: 1 })
  const player = entities.create({ id: 'player', type: 'player', hp: 8000 })
  const input = { actionPresses: presses }
  const shown: (string | null)[] = []
  const ctx = {
    bus, entities, buffs, input, player,
    setQte: (q: { grade: string | null } | null) => shown.push(q?.grade ?? null),
  } as unknown as MechanicContext
  const mech = bladeClash(ctx, { windup: 1000 }, 'c')
  const stances = () => player.buffs.filter(b => b.defId.startsWith('parry_')).map(b => b.defId)
  const land = (guard: string) => bus.emit('combat:parry', { targetId: 'player', guard })
  return { mech, input, stances, land, shown }
}

describe('blade clash prompt', () => {
  it('a press enters the parry stance once; later presses do nothing', () => {
    const { mech, input, stances } = setup()
    mech.update(16)
    input.actionPresses++
    mech.update(16)
    expect(stances()).toEqual(['parry_perfect'])
    input.actionPresses++
    mech.update(16)
    expect(stances()).toEqual(['parry_perfect'])
  })

  it('ignores presses made before the prompt opened', () => {
    const { mech, stances } = setup(3)
    mech.update(16)
    expect(stances()).toEqual([])
  })

  it('shows the verdict of the strike, telling a missed press from an expired one', () => {
    const missed = setup()
    missed.mech.update(16)
    missed.land('none')
    missed.mech.update(16)
    expect(missed.shown.at(-1)).toBe('LATE')

    const early = setup()
    early.mech.update(16)
    early.input.actionPresses++
    early.mech.update(16)
    early.land('none')
    early.mech.update(16)
    expect(early.shown.at(-1)).toBe('EARLY')
  })

  it('clears the prompt after showing the verdict', () => {
    const { mech, land, shown } = setup()
    mech.update(16)
    land('perfect')
    let done = false
    for (let t = 0; t < 1000 && !done; t += 16) done = mech.update(16)
    expect(done).toBe(true)
    expect(shown).toContain('JUST!')
    expect(shown.at(-1)).toBeNull()
  })
})
