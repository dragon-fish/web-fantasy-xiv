import { createEntity } from '@/entity/entity'
import { chooseHealerAction } from './npc-brain'

const member = (id: string, role: 'tank' | 'healer' | 'dps', hpRatio: number, alive = true) => {
  const e = createEntity({ id, type: 'player', role, hp: 10000 })
  e.hp = Math.round(10000 * hpRatio)
  e.alive = alive
  return e
}

describe('chooseHealerAction', () => {
  it('heals the tank first, then the party, then answers a raidwide, then single heals, then raises', () => {
    const player = member('player', 'dps', 1)
    const tank = member('tank', 'tank', 0.5)
    const dps = member('dps', 'dps', 0.6)
    const healer = member('healer', 'healer', 1)
    const fallen = member('fallen', 'dps', 0, false)
    expect(chooseHealerAction([player, tank, dps, healer, fallen], true, true, player)).toEqual({ kind: 'heal', target: tank })
    tank.hp = 9000
    player.hp = 6000
    expect(chooseHealerAction([player, tank, dps, healer, fallen], true, true, player)).toEqual({ kind: 'aoe_heal' })
    player.hp = 10000
    expect(chooseHealerAction([player, tank, dps, healer, fallen], true, true, player)).toEqual({ kind: 'prepare' })
    expect(chooseHealerAction([player, tank, dps, healer, fallen], false, true, player)).toEqual({ kind: 'heal', target: dps })
    dps.hp = 10000
    expect(chooseHealerAction([player, tank, dps, healer, fallen], false, true, player)).toEqual({ kind: 'raise', target: fallen })
    expect(chooseHealerAction([player, tank, dps, healer, fallen], false, false, player)).toBeNull()
  })

  it('raises the tank before the player before anyone else', () => {
    const player = member('player', 'dps', 0, false)
    const dps = member('dps', 'dps', 0, false)
    const tank = member('tank', 'tank', 0, false)
    expect(chooseHealerAction([dps, player, tank], false, true, player)).toEqual({ kind: 'raise', target: tank })
    tank.alive = true
    tank.hp = 10000
    expect(chooseHealerAction([dps, player, tank], false, true, player)).toEqual({ kind: 'raise', target: player })
  })
})
