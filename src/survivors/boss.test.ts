import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { CombatResolver } from '@/game/combat-resolver'
import { DisplacementAnimator } from '@/game/displacement-animator'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { SurvivorRuntime } from './runtime'
import { GEM_LIFETIME } from './difficulty'

function setup() {
  const bus = new EventBus(), entityMgr = new EntityManager(bus), buffSystem = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'rect' as const, width: 120, height: 120 }, boundary: 'wall' })
  const displacer = new DisplacementAnimator(arena), zoneMgr = new AoeZoneManager(bus, entityMgr)
  const combatResolver = new CombatResolver(bus, entityMgr, buffSystem, arena, zoneMgr)
  const player = entityMgr.create({ id: 'player', type: 'player', hp: 1000, attack: 30 })
  const deps = { bus, entityMgr, buffSystem, arena, displacer, zoneMgr, combatResolver, player }
  const runtime = new SurvivorRuntime(deps, () => 0.4)
  runtime.progression.ranks = {}
  return { runtime, ...deps }
}

it('expires unattended experience without granting it and freezes expiry during selection', () => {
  const { runtime } = setup()
  runtime.gems.push({ id: 1, x: 30, y: 30, value: 10, expiresAt: GEM_LIFETIME })
  runtime.progression.gainXp(11)
  runtime.tick(GEM_LIFETIME)
  expect(runtime.gems).toHaveLength(1)
  runtime.choose(runtime.progression.offers[0]!.id)
  runtime.tick(GEM_LIFETIME)
  expect(runtime.gems).toHaveLength(0)
  expect(runtime.progression.xp).toBe(0)
})

it('merges nearby drops without refreshing old experience lifetime', () => {
  const { runtime, entityMgr } = setup()
  const kill = (id: string) => runtime.hit(entityMgr.create({ id, type: 'mob', hp: 1, position: { x: 10, y: 10, z: 0 } }), 1, 'fire')
  kill('a')
  const expires = runtime.gems[0]!.expiresAt
  runtime.elapsed += 1000
  kill('b')
  expect(runtime.gems).toHaveLength(1)
  expect(runtime.gems[0]!.value).toBe(6)
  expect(runtime.gems[0]!.expiresAt).toBe(expires)
})

it('starts the mid-boss at four minutes, constrains movement and stops trash spawning', () => {
  const { runtime, arena, player, displacer } = setup()
  runtime.elapsed = 240000 - 16
  player.position.x = 55
  displacer.start(player, 60, 60)
  runtime.tick(16)
  expect(runtime.bossFight?.stage).toBe(1)
  expect(arena.def.shape.type).toBe('circle')
  expect(displacer.isAnimating(player.id)).toBe(false)
  expect(arena.isInBounds(player.position)).toBe(true)
  for (let i = 0; i < 100; i++) runtime.tick(16)
  expect(runtime.enemies()).toHaveLength(1)
  expect(runtime.bossFight?.cast).not.toBeNull()
})

it('restores the arena and cancels outstanding attacks after the mid-boss dies', () => {
  const { runtime, arena, zoneMgr } = setup()
  runtime.elapsed = 240000
  runtime.tick(16)
  runtime.tick(1500)
  expect(zoneMgr.getActiveZones().length).toBeGreaterThan(0)
  runtime.hit(runtime.bossFight!.entity, 1e6, 'fire')
  expect(runtime.bossFight).toBeNull()
  expect(arena.def.shape.type).toBe('rect')
  expect(zoneMgr.getActiveZones()).toHaveLength(0)
  expect(runtime.result).toBeNull()
})

it('requires killing the final boss rather than merely surviving eight minutes', () => {
  const { runtime } = setup()
  runtime.elapsed = 240000
  runtime.tick(16)
  runtime.hit(runtime.bossFight!.entity, 1e6, 'fire')
  while (runtime.progression.pending) runtime.choose(runtime.progression.offers[0]!.id)
  runtime.elapsed = 480000
  runtime.tick(16)
  expect(runtime.result).toBeNull()
  expect(runtime.bossFight?.stage).toBe(2)
  runtime.hit(runtime.bossFight!.entity, 1e6, 'fire')
  expect(runtime.result).toBe('victory')
})

it('snapshots orange AOEs, respects immunity and leaves the donut center safe', () => {
  const { runtime, zoneMgr, player, buffSystem, displacer } = setup()
  runtime.elapsed = 240000
  runtime.tick(16)
  runtime.tick(1500)
  const steel = zoneMgr.getActiveZones()[0]!
  expect(steel.def.shape.type).toBe('circle')
  player.position.x = 0; player.position.y = 0
  runtime.useDash()
  zoneMgr.update(steel.def.resolveDelay)
  expect(player.hp).toBe(1000)
  buffSystem.update(player, 250)
  displacer.cancel(player.id)
  runtime.tick(steel.def.resolveDelay + 2000)
  runtime.tick(16)
  const moon = zoneMgr.getActiveZones().find(z => z.def.shape.type === 'ring')!
  expect(moon).toBeDefined()
  zoneMgr.update(moon.def.resolveDelay)
  expect(player.hp).toBe(1000)
})

it('marks lethal boss damage immediately, before next-tick regeneration or level selection', () => {
  const { runtime, zoneMgr, player } = setup()
  runtime.elapsed = 240000
  runtime.tick(16)
  runtime.tick(1500)
  player.position.x = 0; player.position.y = 0; player.hp = 1
  const attack = zoneMgr.getActiveZones()[0]!
  zoneMgr.update(attack.def.resolveDelay)
  expect(player.alive).toBe(false)
  runtime.progression.gainXp(11)
  runtime.checkDeath()
  expect(runtime.result).toBe('wipe')
  expect(zoneMgr.getActiveZones()).toHaveLength(0)
})
