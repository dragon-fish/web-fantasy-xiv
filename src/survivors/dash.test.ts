import { EventBus } from '@/core/event-bus'
import { BuffSystem } from '@/combat/buff'
import { EntityManager } from '@/entity/entity-manager'
import { Arena } from '@/arena/arena'
import { DisplacementAnimator } from '@/game/displacement-animator'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { CombatResolver } from '@/game/combat-resolver'
import { Dash } from './dash'

function setup() {
  const bus = new EventBus()
  const entities = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'rect', width: 40, height: 40 }, boundary: 'wall' })
  const displacer = new DisplacementAnimator(arena)
  const combat = new CombatResolver(bus, entities, buffs, arena, new AoeZoneManager(bus, entities), displacer)
  const player = entities.create({ id: 'player', type: 'player', hp: 100, facing: 90 })
  const enemy = entities.create({ id: 'enemy', type: 'mob', attack: 10 })
  return { player, enemy, buffs, combat, displacer, dash: new Dash(player, buffs, displacer) }
}

describe('survivor dash', () => {
  it('uses real damage immunity, expires without the 500ms grace and moves forward', () => {
    const { dash, player, enemy, buffs, combat, displacer } = setup()
    expect(dash.use()).toBe(true)
    expect(dash.use()).toBe(false)
    combat.applyDamage(enemy, player, 1)
    expect(player.hp).toBe(100)
    buffs.update(player, 249)
    expect(buffs.hasDamageImmunity(player)).toBe(true)
    buffs.update(player, 1)
    combat.applyDamage(enemy, player, 1)
    expect(player.hp).toBe(90)
    displacer.update(250)
    expect(player.position.x).toBeGreaterThan(0)
  })
  it('restores charges sequentially and keeps partial progress after another use', () => {
    const { dash, displacer } = setup()
    dash.configure(2, 1000)
    dash.use()
    displacer.update(250)
    dash.tick(600)
    dash.use()
    dash.tick(400)
    expect(dash.charges).toBe(1)
    dash.tick(999)
    expect(dash.charges).toBe(1)
    dash.tick(1)
    expect(dash.charges).toBe(2)
  })
  it('preserves proportional recharge progress when cooldown is reduced', () => {
    const { dash } = setup()
    dash.use()
    dash.tick(6000)
    dash.configure(1, 6000)
    expect(dash.remaining).toBe(3000)
  })
})
