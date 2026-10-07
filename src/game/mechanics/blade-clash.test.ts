import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import type { BuffDef } from '@/core/types'
import { bladeClash } from './blade-clash'
import type { MechanicContext } from './mechanic-host'

const KEEN: BuffDef = { id: 'keen', name: '见切', type: 'buff', duration: 10000, stackable: false, maxStacks: 1, effects: [{ type: 'damage_increase', value: 0.2 }] }
const OPEN: BuffDef = { id: 'open', name: '破绽', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1, effects: [{ type: 'damage_increase', value: -0.2 }] }

function setup(presses = 0) {
  const bus = new EventBus()
  const entities = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  const boss = entities.create({ id: 'boss', type: 'boss', hp: 100, attack: 1 })
  const player = entities.create({ id: 'player', type: 'player', hp: 8000 })
  const input = { actionPresses: presses }
  const damage: number[] = []
  const ctx = {
    bus, entities, buffs, input, player,
    combat: { applyDamage: (_s: unknown, t: typeof player, potency: number) => { t.hp -= potency; damage.push(potency) } },
    buffDef: (id: string) => ({ keen: KEEN, open: OPEN } as Record<string, BuffDef>)[id],
    announce: () => {},
  } as unknown as MechanicContext
  const mech = bladeClash(ctx, { windup: 1000, goodPotency: 1900, missPotency: 7500, justBuff: 'keen', missBuff: 'open' }, 'c')
  void boss
  return { mech, input, player, damage }
}

function run(mech: { update(dt: number): boolean }, ms: number): boolean {
  for (let t = 0; t < ms; t += 16) if (mech.update(16)) return true
  return false
}

describe('blade clash', () => {
  it('ignores presses made before the clash started', () => {
    const { mech, damage } = setup(3)
    expect(run(mech, 1300)).toBe(true)
    expect(damage).toEqual([7500])
  })

  it('a just press negates the hit and grants the reward buff', () => {
    const { mech, input, player, damage } = setup()
    run(mech, 992)
    input.actionPresses++
    expect(mech.update(16)).toBe(true)
    expect(damage).toEqual([])
    expect(player.buffs.map(b => b.defId)).toEqual(['keen'])
  })

  it('an early press is locked in but only lands when the strike does', () => {
    const { mech, input, player, damage } = setup()
    run(mech, 400)
    input.actionPresses++
    expect(run(mech, 500)).toBe(false)
    expect(damage).toEqual([])
    expect(run(mech, 200)).toBe(true)
    expect(damage).toEqual([7500])
    expect(player.buffs.map(b => b.defId)).toEqual(['open'])
  })
})
