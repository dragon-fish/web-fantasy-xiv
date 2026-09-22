import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { DisplacementAnimator } from '@/game/displacement-animator'
import { CombatResolver } from '@/game/combat-resolver'
import { SurvivorRuntime } from './runtime'
import { NullEngine, Scene, Logger } from '@babylonjs/core'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { SurvivorVisuals } from './visuals'

it('keeps non-numeric player ids visible at finite world coordinates', () => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const bus = new EventBus()
  const entities = new EntityManager(bus)
  const visuals = new SurvivorVisuals(scene, bus)
  const player = entities.create({ id: 'survivor-player', type: 'player', hp: 100 })
  visuals.updateAll([player], 16)
  const mesh = scene.getMeshByName(player.id)!
  expect(Number.isFinite(mesh.position.y)).toBe(true)
  expect(mesh.isVisible).toBe(true)
  scene.dispose()
  engine.dispose()
})

it('does not use unsupported instance visibility while rendering combat effects', () => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const bus = new EventBus()
  const entities = new EntityManager(bus)
  const visuals = new SurvivorVisuals(scene, bus)
  const player = entities.create({ id: 'survivor-player', type: 'player', hp: 100 })
  player.buffs.push({ defId: 'sv_dash_guard', sourceId: player.id, remaining: 250, stacks: 1 })
  const warn = vi.spyOn(Logger, 'Warn')
  visuals.updateAll([player], 16)
  expect(warn).not.toHaveBeenCalled()
  expect(scene.getMeshByName(player.id)!.visibility).toBeLessThan(1)
  warn.mockRestore()
  scene.dispose()
  engine.dispose()
})

it('reuses expired effects without growing mesh count across repeated bursts', () => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'rect', width: 120, height: 120 }, boundary: 'wall' })
  const displacer = new DisplacementAnimator(arena)
  const combatResolver = new CombatResolver(bus, entityMgr, buffSystem, arena)
  const visuals = new SurvivorVisuals(scene, bus)
  const player = entityMgr.create({ id: 'player', type: 'player', hp: 100 })
  visuals.bind(new SurvivorRuntime({ bus, entityMgr, buffSystem, arena, displacer, combatResolver, player }))
  const burst = () => {
    bus.emit('survivor:effect', { kind: 'burst', from: { x: 0, y: 0 }, radius: 3, color: '#ff884e' })
    visuals.render(500, false)
  }
  burst()
  const count = scene.meshes.length
  for (let i = 0; i < 100; i++) burst()
  expect(scene.meshes.length).toBe(count)
  scene.dispose()
  engine.dispose()
})
