import { NullEngine, Scene, FreeCamera, Vector3 } from '@babylonjs/core'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { EntityFeedback } from './entity-feedback'

function setup() {
  const engine = new NullEngine(), scene = new Scene(engine), bus = new EventBus()
  new FreeCamera('camera', new Vector3(0, 15, -20), scene).setTarget(Vector3.Zero())
  const entities = new EntityManager(bus)
  const player = entities.create({ id: 'p', type: 'player', hp: 100 })
  const mob = entities.create({ id: 'mob', type: 'mob', hp: 100, position: { x: 2, y: 3, z: 0 } })
  const feedback = new EntityFeedback(scene, bus)
  return { engine, scene, bus, entities, player, mob, feedback, dispose: () => { feedback.dispose(); scene.dispose(); engine.dispose() } }
}

it('anchors outgoing critical damage to a moving entity in world coordinates', () => {
  const { feedback, bus, player, mob, scene, dispose } = setup()
  bus.emit('damage:dealt', { source: player, target: mob, amount: 123, isCritical: true })
  feedback.update([player, mob], player, null, 0)
  const digits = scene.spriteManagers![0]!.sprites.filter(s => s.name.startsWith('combat-number') && s.isVisible)
  expect(digits.map(s => s.cellIndex)).toEqual([1, 2, 3, 11])
  expect(digits[0]!.color.r).toBeGreaterThan(digits[0]!.color.g)
  expect(digits[0]!.color.g).toBeGreaterThan(digits[0]!.color.b)
  const before = digits[0]!.position.clone()
  mob.position.x += 4; mob.position.y += 5
  feedback.update([player, mob], player, null, 0)
  expect(digits[0]!.position.x - before.x).toBeCloseTo(4)
  expect(digits[0]!.position.z - before.z).toBeCloseTo(5)
  feedback.update([player, mob], player, null, 1100)
  expect(digits.every(s => !s.isVisible)).toBe(true)
  dispose()
})

it('distinguishes incoming damage from healing and ignores zero heals', () => {
  const { feedback, bus, player, mob, scene, dispose } = setup()
  bus.emit('damage:dealt', { source: mob, target: player, amount: 12 })
  bus.emit('damage:dealt', { source: player, target: player, amount: -3 })
  bus.emit('damage:dealt', { source: player, target: player, amount: 0 })
  feedback.update([player, mob], player, null, 0)
  const sprites = scene.spriteManagers![0]!.sprites.filter(s => s.isVisible)
  expect(sprites).toHaveLength(4)
  expect(sprites[0]!.color.r).toBeGreaterThan(sprites[0]!.color.g)
  expect(sprites[2]!.cellIndex).toBe(10)
  expect(sprites[2]!.color.g).toBeGreaterThan(sprites[2]!.color.r)
  dispose()
})

it('only shows nearest injured enemies, excluding full health and hidden mobs while retaining the main boss', () => {
  const { feedback, entities, player, mob, scene, dispose } = setup()
  const far = entities.create({ id: 'far', type: 'mob', hp: 50, maxHp: 100, position: { x: 80, y: 0, z: 0 } })
  for (let i = 0; i < 30; i++) entities.create({ id: `near-${i}`, type: 'mob', hp: 50, maxHp: 100, position: { x: i, y: 0, z: 0 } })
  const boss = entities.create({ id: 'boss', type: 'boss', hp: 50, maxHp: 100 })
  const hidden = entities.create({ id: 'hidden', type: 'mob', hp: 50, maxHp: 100, visible: false })
  feedback.update(entities.getAlive(), player, boss.id, 16)
  const bars = scene.spriteManagers![0]!.sprites.filter(s => s.name.startsWith('hp-background:') && s.isVisible)
  expect(bars.length).toBeGreaterThan(0)
  expect(bars.length).toBeLessThan(30)
  for (const e of [mob, far, hidden]) expect(bars.some(s => s.name === `hp-background:${e.id}`)).toBe(false)
  expect(bars.some(s => s.name === 'hp-background:boss')).toBe(true)
  const near = entities.get('near-0')!
  near.hp = near.maxHp
  feedback.update(entities.getAlive(), player, boss.id, 16)
  expect(scene.spriteManagers![0]!.sprites.some(s => s.name === 'hp-background:near-0' && s.isVisible)).toBe(false)
  dispose()
})

it('keeps recycled health bar backgrounds behind their fills', () => {
  const { feedback, entities, player, mob, scene, dispose } = setup()
  mob.hp = 50
  feedback.update([player, mob], player, null, 0)
  mob.hp = 100
  const next = entities.create({ id: 'next', type: 'mob', hp: 50, maxHp: 100 })
  feedback.update([player, mob, next], player, null, 0)
  const sprites = scene.spriteManagers![0]!.sprites
  const background = sprites.findIndex(s => s.name === 'hp-background:next')
  const fill = sprites.findIndex(s => s.name === 'hp-fill:next')
  expect(background).toBeGreaterThanOrEqual(0)
  expect(fill).toBeGreaterThan(background)
  dispose()
})

it('keeps burst history from the first damage event and displays actual boss cast progress', () => {
  const { feedback, bus, entities, player, scene, dispose } = setup()
  const boss = entities.create({ id: 'boss', type: 'boss', hp: 100 })
  boss.hp = 60
  bus.emit('damage:dealt', { target: boss, source: player, amount: 40 })
  feedback.update([player, boss], player, boss.id, 0, { elapsed: 500, total: 1000 })
  const sprites = scene.spriteManagers![0]!.sprites
  const trail = sprites.find(s => s.name === 'hp-trail:boss')!
  expect(trail.isVisible).toBe(true)
  expect(feedback.healthState(boss).damageEnd).toBe(1)
  const back = sprites.find(s => s.name === 'cast-background:boss')!
  const fill = sprites.find(s => s.name === 'cast-fill:boss')!
  expect(fill.width / back.width).toBeCloseTo(0.5)
  feedback.update([player, boss], player, boss.id, 1300)
  expect(trail.isVisible).toBe(false)
  expect(back.isVisible).toBe(false)
  boss.casting = { skillId: 'cast', targetId: player.id, elapsed: 300, castTime: 1000 }
  feedback.update([player, boss], player, boss.id, 0)
  expect(back.isVisible).toBe(true)
  expect(fill.width / back.width).toBeCloseTo(0.3)
  boss.casting = null
  feedback.update([player, boss], player, boss.id, 0)
  expect(back.isVisible).toBe(false)
  dispose()
})
