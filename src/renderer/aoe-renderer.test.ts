import { NullEngine, Scene } from '@babylonjs/core'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { AoeRenderer } from './aoe-renderer'

it('renders donut telegraphs flat and at their actual damage center', () => {
  const engine = new NullEngine(), scene = new Scene(engine), bus = new EventBus()
  const entities = new EntityManager(bus), zones = new AoeZoneManager(bus, entities)
  new AoeRenderer(scene, bus, entities)
  const zone = zones.spawn({ anchor: { type: 'position', x: 3, y: 4 }, direction: { type: 'none' }, shape: { type: 'ring', innerRadius: 5, outerRadius: 20 }, resolveDelay: 2000, hitEffectDuration: 100, effects: [] }, 'donut', { x: 0, y: 0 }, 0, null)
  const mesh = scene.getMeshByName(`aoe-${zone.id}`)!
  mesh.computeWorldMatrix(true)
  expect(mesh.position.x).toBe(3)
  expect(mesh.position.z).toBe(4)
  const bounds = mesh.getBoundingInfo().boundingBox
  expect(bounds.maximumWorld.y - bounds.minimumWorld.y).toBeLessThan(0.2)
  scene.dispose(); engine.dispose()
})

it('extends rect telegraphs forward from the zone origin along facing', () => {
  const engine = new NullEngine(), scene = new Scene(engine), bus = new EventBus()
  const entities = new EntityManager(bus), zones = new AoeZoneManager(bus, entities)
  new AoeRenderer(scene, bus, entities)
  const zone = zones.spawn({ anchor: { type: 'position', x: 0, y: 0 }, direction: { type: 'fixed', angle: 90 }, shape: { type: 'rect', width: 4, length: 10 }, resolveDelay: 2000, hitEffectDuration: 100, effects: [] }, 'line', { x: 0, y: 0 }, 90, null)
  const mesh = scene.getMeshByName(`aoe-${zone.id}`)!
  mesh.computeWorldMatrix(true)
  const bounds = mesh.getBoundingInfo().boundingBox
  expect(bounds.minimumWorld.x).toBeCloseTo(0, 3)
  expect(bounds.maximumWorld.x).toBeCloseTo(10, 3)
  scene.dispose(); engine.dispose()
})
