import { AoeZoneManager } from '@/skill/aoe-zone'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { CombatResolver } from '@/game/combat-resolver'
import { DisplacementAnimator } from '@/game/displacement-animator'
import { CARDS } from './catalog'
import { SurvivorRuntime } from './runtime'

export function setup() {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'rect', width: 120, height: 120 }, boundary: 'wall' })
  const displacer = new DisplacementAnimator(arena)
  const zoneMgr = new AoeZoneManager(bus, entityMgr)
  const combatResolver = new CombatResolver(bus, entityMgr, buffSystem, arena, zoneMgr)
  const player = entityMgr.create({ id: 'player', type: 'player', hp: 1000, attack: 30 })
  const runtime = new SurvivorRuntime({ bus, entityMgr, buffSystem, arena, displacer, zoneMgr, combatResolver, player }, () => 0.4)
  const enemy = (id: string, x: number, hp = 100) => entityMgr.create({ id, type: 'mob', position: { x, y: 0, z: 0 }, hp, speed: 0, attack: 10 })
  return { runtime, enemy, player, buffSystem, entityMgr }
}

describe('survivor combat', () => {
  it.each(['fire', 'orbit', 'ice', 'thunder', 'slash', 'holy'] as const)('%s damages enemies automatically', (id) => {
    const { runtime, enemy } = setup()
    runtime.progression.ranks = { [id]: 1 }
    const target = enemy('target', id === 'orbit' ? 2.8 : 3, 10000)
    for (let i = 0; i < 200; i++) runtime.tick(16)
    expect(target.hp).toBeLessThan(10000)
  })
  it('death explosions kill nearby enemies once without recursive chain explosions', () => {
    const { runtime, enemy } = setup()
    runtime.progression.ranks.combustion = 1
    const first = enemy('first', 0, 1)
    enemy('second', 1, 1)
    const third = enemy('third', 4, 10000)
    runtime.hit(first, 1, 'fire')
    expect(runtime.kills).toBe(2)
    expect(third.hp).toBe(10000)
    expect(runtime.gems.reduce((sum, gem) => sum + gem.value, 0)).toBe(6)
  })
  it('ice vulnerability and common damage buffs increase real resolved damage', () => {
    const { runtime, enemy, player, buffSystem } = setup()
    const first = enemy('first', 2, 1000)
    runtime.hit(first, 1, 'fire')
    const base = 1000 - first.hp
    runtime.progression.ranks.shatter = 1
    runtime.freeze(first)
    buffSystem.applyBuff(player, { id: 'boost', name: 'boost', type: 'buff', duration: 0, stackable: false, maxStacks: 1, effects: [{ type: 'damage_increase', value: 0.2 }] }, player.id)
    const before = first.hp
    runtime.hit(first, 1, 'fire')
    expect(before - first.hp).toBeGreaterThan(base)
  })
  it('stops time and combat during level selection and after death', () => {
    const { runtime, player } = setup()
    runtime.progression.gainXp(20)
    runtime.tick(1000)
    expect(runtime.elapsed).toBe(0)
    runtime.choose(runtime.progression.offers[0]!.id)
    player.hp = 0
    runtime.tick(16)
    expect(runtime.result).toBe('wipe')
    const time = runtime.elapsed
    runtime.tick(1000)
    expect(runtime.elapsed).toBe(time)
  })
  it('evolved holy splits only primary projectiles', () => {
    const { runtime, enemy } = setup()
    runtime.progression.ranks = { holy: 5 }
    enemy('first', 2, 10000)
    enemy('second', 3, 10000)
    for (let i = 0; i < 70; i++) runtime.tick(16)
    expect(runtime.weapons.projectiles.some(p => p.secondary)).toBe(true)
    expect(runtime.weapons.projectiles.length).toBeLessThan(20)
  })
})

it.each(['power', 'leech', 'stride'])('each %s perk stack improves the live combat modifier', (id) => {
  const { runtime, player, buffSystem } = setup()
  const read = () => id === 'power' ? buffSystem.getDamageIncreases(player).reduce((a, b) => a + b, 0) : id === 'leech' ? buffSystem.getLifesteal(player) : buffSystem.getSpeedModifier(player)
  runtime.progression.gainXp(1000)
  const card = CARDS.find(c => c.id === id)!
  runtime.progression.offers = [card]
  runtime.choose(id)
  const first = read()
  runtime.progression.offers = [card]
  runtime.choose(id)
  expect(read()).toBeCloseTo(first * 2)
  expect(buffSystem.getStacks(player, `sv_${id}`)).toBe(2)
})

it('runs a complete evolved build through the eight-minute monster ramp', () => {
  const { runtime, player, buffSystem, entityMgr } = setup()
  // Exercise real card application, including stack-dependent shared buffs.
  for (const card of CARDS) {
    while (runtime.rank(card.id) < card.max) {
      runtime.progression.pending = 1
      runtime.progression.offers = [card]
      runtime.choose(card.id)
    }
  }
  for (let i = 0; i < 40000 && !runtime.result; i++) {
    for (const entity of entityMgr.getAlive()) buffSystem.update(entity, 16)
    player.position.x = Math.sin(i / 1800) * 12
    player.position.y = Math.cos(i / 1800) * 12
    runtime.tick(16)
    expect(runtime.weapons.projectiles.length).toBeLessThanOrEqual(220)
    expect(runtime.gems.length).toBeLessThanOrEqual(160)
  }
  expect(runtime.result).toBe('victory')
  expect(runtime.kills).toBeGreaterThan(500)
  expect(Number.isFinite(player.hp)).toBe(true)
})

it('keeps newly spawned enemies away from a player standing at an arena corner', () => {
  const { runtime, player } = setup()
  player.position.x = -60
  player.position.y = 60
  runtime.tick(16)
  expect(runtime.enemies()).toHaveLength(1)
  const enemy = runtime.enemies()[0]!
  expect(Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y)).toBeGreaterThan(10)
})

it('aims homing shots at nearby enemies instead of stale spawn order', () => {
  const { runtime, enemy } = setup()
  runtime.progression.ranks = { holy: 1 }
  enemy('far', 55, 10000)
  enemy('near', 8, 10000)
  runtime.tick(16)
  expect(runtime.weapons.projectiles[0]?.target).toBe('near')
})

it('propagates the actual critical roll on shared damage events', () => {
  const { runtime, enemy } = setup()
  const target = enemy('crit-target', 3, 10000)
  const hits: Array<{ amount: number; isCritical?: boolean }> = []
  runtime.deps.bus.on('damage:dealt', event => { if (event.target === target) hits.push(event) })
  runtime.progression.ranks.critical = 4
  runtime.hit(target, 1, 'fire')
  runtime.progression.ranks.critical = 0
  runtime.hit(target, 1, 'fire')
  expect(hits[0]!.isCritical).toBe(true)
  expect(hits[1]!.isCritical).toBe(false)
  expect(hits[0]!.amount).toBeGreaterThan(hits[1]!.amount)
})
