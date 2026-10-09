import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { pickAllyTarget, partyMembersNear } from './party'

function setup() {
  const mgr = new EntityManager(new EventBus())
  const at = (id: string, x: number, hp: number, extra: { type?: 'player' | 'mob'; alive?: boolean } = {}) => {
    const e = mgr.create({ id, type: extra.type ?? 'player', hp: 1000, position: { x, y: 0, z: 0 } })
    e.hp = hp
    if (extra.alive === false) e.alive = false
    return e
  }
  return { mgr, at }
}

describe('pickAllyTarget', () => {
  it('lowest-hp picks the party member with the lowest HP ratio in range', () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    at('tank', 5, 700)
    at('dps', 10, 400)
    at('far', 50, 100)
    at('boss', 1, 10, { type: 'mob' })
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('dps')
  })

  it('lowest-hp falls back to the caster when nobody else is around', () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('healer')
  })

  it('fallen picks the nearest fallen member, or nothing', () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    expect(pickAllyTarget(healer, mgr.getAll(), 'fallen', 30)).toBeNull()
    at('far', 20, 0, { alive: false })
    at('near', 8, 0, { alive: false })
    expect(pickAllyTarget(healer, mgr.getAll(), 'fallen', 30)?.id).toBe('near')
  })
})

describe('partyMembersNear', () => {
  it('returns living party members within the radius, caster included', () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    at('near', 10, 500)
    at('far', 20, 500)
    at('down', 5, 0, { alive: false })
    at('boss', 1, 10, { type: 'mob' })
    expect(partyMembersNear(healer, mgr.getAll(), 15).map(e => e.id).sort()).toEqual(['healer', 'near'])
  })
})
