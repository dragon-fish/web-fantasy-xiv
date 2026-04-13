// src/skill/skill-resolver.test.ts
import { describe, it, expect, vi } from 'vitest'
import { SkillResolver, GCD_DURATION } from '@/skill/skill-resolver'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { AoeZoneManager } from '@/skill/aoe-zone'
import type { SkillDef } from '@/core/types'

const weaponskill: SkillDef = {
  id: 'slash', name: 'Slash', type: 'weaponskill',
  castTime: 0, cooldown: 0, gcd: true,
  targetType: 'single', range: 5,
  effects: [{ type: 'damage', potency: 2 }],
}

const spell: SkillDef = {
  id: 'fire1', name: 'Fire I', type: 'spell',
  castTime: 2500, cooldown: 0, gcd: true,
  targetType: 'single', range: 25,
  effects: [{ type: 'damage', potency: 3 }],
}

const ability: SkillDef = {
  id: 'berserk', name: 'Berserk', type: 'ability',
  castTime: 0, cooldown: 60000, gcd: false,
  targetType: 'single', range: 0,
  effects: [{ type: 'apply_buff', buffId: 'berserk_buff' }],
}

describe('SkillResolver', () => {
  function setup() {
    const bus = new EventBus()
    const entityMgr = new EntityManager(bus)
    const buffSystem = new BuffSystem(bus)
    const zoneMgr = new AoeZoneManager(bus, entityMgr)
    const resolver = new SkillResolver(bus, entityMgr, buffSystem, zoneMgr)

    const player = entityMgr.create({
      id: 'p1', type: 'player',
      hp: 10000, maxHp: 10000, attack: 1000,
      position: { x: 0, y: 0, z: 0 },
    })
    const boss = entityMgr.create({
      id: 'b1', type: 'boss',
      hp: 100000, maxHp: 100000, attack: 1,
      position: { x: 3, y: 0, z: 0 },
    })
    player.target = 'b1'
    player.inCombat = true

    return { bus, entityMgr, buffSystem, zoneMgr, resolver, player, boss }
  }

  it('should export GCD_DURATION as 2500', () => {
    expect(GCD_DURATION).toBe(2500)
  })

  describe('weaponskill', () => {
    it('should cast immediately and trigger GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_complete', handler)

      const result = resolver.tryUse(player, weaponskill)
      expect(result).toBe(true)
      expect(handler).toHaveBeenCalled()
      expect(player.gcdTimer).toBe(GCD_DURATION)
    })

    it('should fail if GCD is active', () => {
      const { resolver, player } = setup()
      player.gcdTimer = 1000
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })

    it('should fail if target out of range', () => {
      const { resolver, player, boss } = setup()
      boss.position = { x: 100, y: 0, z: 0 }
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })
  })

  describe('spell (cast time)', () => {
    it('should start casting and trigger GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_start', handler)

      const result = resolver.tryUse(player, spell)
      expect(result).toBe(true)
      expect(player.casting).not.toBeNull()
      expect(player.casting!.skillId).toBe('fire1')
      expect(player.gcdTimer).toBe(GCD_DURATION)
      expect(handler).toHaveBeenCalled()
    })

    it('should complete cast after castTime elapses', () => {
      const { bus, resolver, player } = setup()
      const complete = vi.fn()
      bus.on('skill:cast_complete', complete)

      resolver.tryUse(player, spell)
      resolver.update(player, 2500)

      expect(complete).toHaveBeenCalled()
      expect(player.casting).toBeNull()
    })

    it('should fail cast if target moves out of range during cast', () => {
      const { bus, resolver, player, boss } = setup()
      const interrupted = vi.fn()
      bus.on('skill:cast_interrupted', interrupted)

      resolver.tryUse(player, spell)
      boss.position = { x: 100, y: 0, z: 0 } // move out of range
      resolver.update(player, 2500)

      // Cast completes but second validation fails
      expect(interrupted).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'out_of_range' }),
      )
    })
  })

  describe('ability', () => {
    it('should not trigger GCD', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, ability)
      expect(player.gcdTimer).toBe(0)
    })

    it('should be usable during GCD', () => {
      const { resolver, player } = setup()
      player.gcdTimer = 1000
      expect(resolver.tryUse(player, ability)).toBe(true)
    })

    it('should track independent cooldown', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, ability)
      expect(resolver.tryUse(player, ability)).toBe(false) // on CD

      resolver.updateCooldowns(player, 60000)
      expect(resolver.tryUse(player, ability)).toBe(true) // CD expired
    })

    it('should not be usable during casting', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, spell) // start casting
      expect(resolver.tryUse(player, ability)).toBe(false)
    })
  })

  describe('GCD tick down', () => {
    it('should decrease gcdTimer over time', () => {
      const { resolver, player } = setup()
      resolver.tryUse(player, weaponskill)
      expect(player.gcdTimer).toBe(GCD_DURATION)

      resolver.update(player, 1000)
      expect(player.gcdTimer).toBe(GCD_DURATION - 1000)

      resolver.update(player, 1500)
      expect(player.gcdTimer).toBe(0)
    })
  })

  describe('interrupt', () => {
    it('should interrupt casting and reset GCD', () => {
      const { bus, resolver, player } = setup()
      const handler = vi.fn()
      bus.on('skill:cast_interrupted', handler)

      resolver.tryUse(player, spell)
      resolver.interruptCast(player)

      expect(player.casting).toBeNull()
      expect(player.gcdTimer).toBe(0)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'interrupted' }),
      )
    })
  })

  describe('silence', () => {
    it('should block weaponskill when silenced', () => {
      const { resolver, player, buffSystem } = setup()
      const silenceBuff = {
        id: 'silence', name: 'Silence', type: 'debuff' as const,
        duration: 5000, stackable: false, maxStacks: 1,
        effects: [{ type: 'silence' as const }],
      }
      buffSystem.applyBuff(player, silenceBuff, 'b1')
      expect(resolver.tryUse(player, weaponskill)).toBe(false)
    })

    it('should not block ability when silenced', () => {
      const { resolver, player, buffSystem } = setup()
      const silenceBuff = {
        id: 'silence', name: 'Silence', type: 'debuff' as const,
        duration: 5000, stackable: false, maxStacks: 1,
        effects: [{ type: 'silence' as const }],
      }
      buffSystem.applyBuff(player, silenceBuff, 'b1')
      expect(resolver.tryUse(player, ability)).toBe(true)
    })
  })
})
