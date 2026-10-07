import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import type { SkillDef } from '@/core/types'
import type { InputManager } from '@/input/input-manager'
import type { SkillResolver } from '@/skill/skill-resolver'
import type { BuffSystem } from '@/combat/buff'
import type { Arena } from '@/arena/arena'
import { PlayerInputDriver } from './player-input-driver'

const melee = { id: 'slash', requiresTarget: true, range: 3, gcd: true, cooldown: 0 } as SkillDef

function setup() {
  const bus = new EventBus()
  const mgr = new EntityManager(bus)
  const player = mgr.create({ id: 'p', type: 'player', hp: 100, position: { x: 0, y: 0, z: 0 } })
  const input = {
    keys: { w: false, a: false, s: false, d: false },
    mouse: { worldPos: { x: 0, y: 0 }, leftDown: false, rightDown: false },
    clicked: false,
    consumeSkillPress: () => null,
    consumeEsc: () => false,
    consumeClick() { const c = this.clicked; this.clicked = false; return c },
  }
  const resolver = { tryUse: vi.fn(() => true), updateAll: () => {}, getCooldown: () => 0 }
  const buffs = { isStunned: () => false, getHaste: () => 0, getSpeedModifier: () => 0, getMaxHp: (e: { maxHp: number }) => e.maxHp }
  const driver = new PlayerInputDriver(
    player, input as unknown as InputManager, resolver as unknown as SkillResolver,
    buffs as unknown as BuffSystem, mgr, bus, {} as Arena, { skills: [melee], autoAttackInterval: 3000 },
  )
  const enemy = (id: string, x: number, y: number, size = 0.5) =>
    mgr.create({ id, type: 'mob', hp: 100, size, position: { x, y, z: 0 } })
  return { player, input, driver, enemy }
}

describe('PlayerInputDriver targeting', () => {
  it('switches an out-of-range lock to the nearest enemy the skill can reach', () => {
    const { player, driver, enemy } = setup()
    enemy('far', 20, 0)
    enemy('near', 0, 2)
    player.target = 'far'
    driver.useSkillByIndex(0)
    expect(player.target).toBe('near')
  })

  it('keeps an out-of-range lock when nothing is in range', () => {
    const { player, driver, enemy } = setup()
    enemy('far', 20, 0)
    enemy('other', 0, 10)
    player.target = 'far'
    driver.useSkillByIndex(0)
    expect(player.target).toBe('far')
  })

  it('keeps an in-range lock even when another enemy is closer', () => {
    const { player, driver, enemy } = setup()
    enemy('locked', 0, 3)
    enemy('closer', 1, 0)
    player.target = 'locked'
    driver.useSkillByIndex(0)
    expect(player.target).toBe('locked')
  })

  it('click locks the enemy closest to the cursor, measured to its hitbox edge', () => {
    const { player, input, driver, enemy } = setup()
    enemy('boss', 10, 0, 4.5)
    enemy('crystal', 2, 0, 0.5)
    // Cursor equidistant from both centres, but inside the boss hitbox
    input.mouse.worldPos = { x: 6, y: 2 }
    input.clicked = true
    driver.update(16)
    expect(player.target).toBe('boss')
    input.mouse.worldPos = { x: 2.5, y: 0 }
    input.clicked = true
    driver.update(16)
    expect(player.target).toBe('crystal')
  })
})
