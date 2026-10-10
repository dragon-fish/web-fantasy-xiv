import { createEntity } from '@/entity/entity'
import { chooseHealerAction, type HealerSense } from './npc-brain'

const member = (id: string, role: 'tank' | 'healer' | 'dps', hpRatio: number, alive = true) => {
  const e = createEntity({ id, type: 'player', role, hp: 10000 })
  e.hp = Math.round(10000 * hpRatio)
  e.alive = alive
  return e
}

function sense(party: ReturnType<typeof member>[], over: Partial<HealerSense> = {}): HealerSense {
  return {
    party, self: party.find(e => e.role === 'healer')!, player: party[0]!,
    raidwideComing: false, canRaise: true, singleHeal: 4000, partyHeal: 2500, rng: () => 0.5, ...over,
  }
}

describe('chooseHealerAction', () => {
  it('saves itself first when under a third', () => {
    const healer = member('healer', 'healer', 0.3)
    const tank = member('tank', 'tank', 0.2)
    expect(chooseHealerAction(sense([member('p', 'dps', 1), tank, healer]))).toEqual({ kind: 'heal', target: healer })
  })

  it('single heals the tank under 70%, anyone else only under 60%', () => {
    const tank = member('tank', 'tank', 0.65)
    const dps = member('dps', 'dps', 0.95)
    const healer = member('healer', 'healer', 1)
    expect(chooseHealerAction(sense([dps, tank, healer]))).toEqual({ kind: 'heal', target: tank })
    tank.hp = 10000
    dps.hp = 6500
    expect(chooseHealerAction(sense([dps, tank, healer]))).toBeNull()
    dps.hp = 5500
    expect(chooseHealerAction(sense([dps, tank, healer]))).toEqual({ kind: 'heal', target: dps })
  })

  it('party heals first when it restores more in total, unless someone is critical', () => {
    const a = member('a', 'dps', 0.55)
    const b = member('b', 'dps', 0.6)
    const c = member('c', 'tank', 0.65)
    const healer = member('healer', 'healer', 0.65)
    expect(chooseHealerAction(sense([a, b, c, healer]))).toEqual({ kind: 'aoe_heal' })
    a.hp = 2000 // critical: lift them first
    expect(chooseHealerAction(sense([a, b, c, healer]))).toEqual({ kind: 'heal', target: a })
  })

  it('a lone low member gets a single heal, not a party heal', () => {
    const a = member('a', 'dps', 0.5)
    const b = member('b', 'dps', 0.95)
    const healer = member('healer', 'healer', 1)
    expect(chooseHealerAction(sense([a, b, healer]))).toEqual({ kind: 'heal', target: a })
  })

  it('raises (tank before the player before anyone else) ahead of top-ups and raidwide prep', () => {
    const player = member('player', 'dps', 0, false)
    const dps = member('dps', 'dps', 0, false)
    const tank = member('tank', 'tank', 0, false)
    const healer = member('healer', 'healer', 0.5)
    const party = [dps, player, tank, healer]
    expect(chooseHealerAction(sense(party, { raidwideComing: true, player }))).toEqual({ kind: 'raise', target: tank })
    tank.alive = true
    tank.hp = 10000
    expect(chooseHealerAction(sense(party, { player }))).toEqual({ kind: 'raise', target: player })
    expect(chooseHealerAction(sense(party, { player, canRaise: false }))).toEqual({ kind: 'heal', target: healer })
  })

  it('a critical member is healed before anyone is raised', () => {
    const player = member('player', 'dps', 0, false)
    const tank = member('tank', 'tank', 0.2)
    const healer = member('healer', 'healer', 1)
    expect(chooseHealerAction(sense([player, tank, healer], { player }))).toEqual({ kind: 'heal', target: tank })
  })
})
