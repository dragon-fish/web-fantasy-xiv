import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { pickAllyTarget, partyMembersNear, selectPartyTargets, isHostile } from './party'

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

  it("the caster's own pick wins when it fits, otherwise the default rule applies", () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    at('tank', 5, 900)
    at('dps', 10, 400)
    at('far', 50, 900)
    healer.allyTarget = 'tank'
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('tank')
    healer.allyTarget = 'far'
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('dps')
  })

  it("the player's current target counts as the pick when it is a party member", () => {
    const { mgr, at } = setup()
    const healer = at('healer', 0, 1000)
    at('tank', 5, 900)
    at('dps', 10, 400)
    at('boss', 3, 10, { type: 'mob' })
    healer.target = 'tank'
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('tank')
    healer.target = 'boss'
    expect(pickAllyTarget(healer, mgr.getAll(), 'lowest-hp', 30)?.id).toBe('dps')
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

describe('isHostile', () => {
  it('goes by team, not entity type', () => {
    const { mgr, at } = setup()
    const player = at('player', 0, 1000)
    const npc = mgr.create({ id: 'npc', type: 'player', npc: true, hp: 1 })
    const boss = at('boss', 0, 1, { type: 'mob' })
    const charmed = mgr.create({ id: 'charmed', type: 'mob', team: 'party', hp: 1 })
    expect(isHostile(player, npc)).toBe(false)
    expect(isHostile(npc, boss)).toBe(true)
    expect(isHostile(boss, charmed)).toBe(true)
    expect(isHostile(player, charmed)).toBe(false)
  })
})

describe('selectPartyTargets', () => {
  const party = () => {
    const { mgr, at } = setup()
    const tank = at('tank', 0, 1000); tank.role = 'tank'
    const healer = at('healer', 0, 1000); healer.role = 'healer'
    const dps = at('dps', 0, 1000); dps.role = 'dps'
    return { members: [tank, healer, dps], tank, healer, dps, mgr }
  }
  const seq = (...values: number[]) => { let i = 0; return () => values[i++ % values.length]! }

  it('count: distinct members first, then repeats when too few are alive', () => {
    const { members } = party()
    const picked = selectPartyTargets({ select: 'count', count: 4 }, members, [], seq(0, 0, 0, 0.5))
    expect(picked.map(e => e.id)).toEqual(['tank', 'healer', 'dps', 'healer'])
  })

  it('role: every member of the role, or one random member when none is left', () => {
    const { members, healer, tank } = party()
    expect(selectPartyTargets({ select: 'role', role: 'healer' }, members, [])).toEqual([healer])
    const withoutHealer = members.filter(m => m !== healer)
    expect(selectPartyTargets({ select: 'role', role: 'healer' }, withoutHealer, [], () => 0)).toEqual([tank])
  })

  it('enmity: picks by rank and skips ranks nobody holds', () => {
    const { members, tank, dps } = party()
    expect(selectPartyTargets({ select: 'enmity', rank: [1, 2] }, members, [tank, dps])).toEqual([tank, dps])
    expect(selectPartyTargets({ select: 'enmity', rank: 3 }, members, [tank, dps])).toEqual([])
  })
})
