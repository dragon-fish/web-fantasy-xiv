// src/combat/buff.test.ts
import { describe, it, expect, vi } from 'vitest'
import { BuffSystem } from '@/combat/buff'
import { EventBus } from '@/core/event-bus'
import { createEntity } from '@/entity/entity'
import type { BuffDef } from '@/core/types'

const mitBuff: BuffDef = {
  id: 'shield',
  name: 'Shield',
  type: 'buff',
  duration: 10000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'mitigation', value: 0.2 }],
}

const dotDebuff: BuffDef = {
  id: 'poison',
  name: 'Poison',
  type: 'debuff',
  duration: 6000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'dot', potency: 100, interval: 3000 }],
}

const silenceDebuff: BuffDef = {
  id: 'silence',
  name: 'Silence',
  type: 'debuff',
  duration: 5000,
  stackable: false,
  maxStacks: 1,
  effects: [{ type: 'silence' }],
}

describe('BuffSystem', () => {
  function setup() {
    const bus = new EventBus()
    const system = new BuffSystem(bus)
    const entity = createEntity({ id: 'p1', type: 'player', hp: 10000, maxHp: 10000, attack: 100 })
    return { bus, system, entity }
  }

  it('should apply buff and emit event', () => {
    const { bus, system, entity } = setup()
    const handler = vi.fn()
    bus.on('buff:applied', handler)

    system.applyBuff(entity, mitBuff, 'source1')

    expect(entity.buffs).toHaveLength(1)
    expect(entity.buffs[0].defId).toBe('shield')
    expect(handler).toHaveBeenCalled()
  })

  it('a refresh keeps the longer timer; a permanent debuff never downgrades to a timed one', () => {
    const { system, entity } = setup()
    const mark: BuffDef = { ...silenceDebuff, id: 'mark', duration: Infinity, effects: [] }
    system.applyBuff(entity, mark, 's', 1, 5000)
    system.applyBuff(entity, mark, 's', 1, 2000)
    expect(entity.buffs[0].remaining).toBe(5500)
    system.applyBuff(entity, mark, 's')
    system.applyBuff(entity, mark, 's', 1, 5000)
    expect(entity.buffs[0].remaining).toBe(Infinity)
  })

  it('should tick down buff duration', () => {
    const { system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    system.update(entity, 5000)
    expect(entity.buffs).toHaveLength(1)
    // duration 10000 + 500 grace period - 5000 elapsed = 5500
    expect(entity.buffs[0].remaining).toBe(5500)
  })

  it('should remove expired buff and emit event', () => {
    const { bus, system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    const handler = vi.fn()
    bus.on('buff:removed', handler)

    // duration 10000 + 1000 grace period = 11000 total
    system.update(entity, 11000)
    expect(entity.buffs).toHaveLength(0)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      target: entity,
      reason: 'expired',
    }))
  })

  it('should collect mitigations from active buffs', () => {
    const { system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    expect(system.getMitigations(entity)).toEqual([0.2])
  })

  it('should collect damage increases from active buffs', () => {
    const { system, entity } = setup()
    const dmgBuff: BuffDef = {
      id: 'dmgup', name: 'DmgUp', type: 'buff', duration: 5000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.3 }],
    }
    system.applyBuff(entity, dmgBuff, 'source1')
    expect(system.getDamageIncreases(entity)).toEqual([0.3])
  })

  it('scales a stackable damage increase by its stacks', () => {
    const { system, entity } = setup()
    const stacking: BuffDef = {
      id: 'resonance', name: 'Resonance', type: 'buff', duration: 5000,
      stackable: true, maxStacks: 10,
      effects: [{ type: 'damage_increase', value: 0.1 }],
    }
    system.applyBuff(entity, stacking, 'source1', 10)
    expect(system.getDamageIncreases(entity)).toEqual([1])
  })

  it('should detect silence', () => {
    const { system, entity } = setup()
    expect(system.isSilenced(entity)).toBe(false)
    system.applyBuff(entity, silenceDebuff, 'source1')
    expect(system.isSilenced(entity)).toBe(true)
  })

  it('should detect stun', () => {
    const { system, entity } = setup()
    const stunDebuff: BuffDef = {
      id: 'stun', name: 'Stun', type: 'debuff', duration: 3000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'stun' }],
    }
    expect(system.isStunned(entity)).toBe(false)
    system.applyBuff(entity, stunDebuff, 'source1')
    expect(system.isStunned(entity)).toBe(true)
  })

  it('should get effective speed modifier', () => {
    const { system, entity } = setup()
    const speedBuff: BuffDef = {
      id: 'sprint', name: 'Sprint', type: 'buff', duration: 10000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'speed_modify', value: 0.5 }],
    }
    const slowDebuff: BuffDef = {
      id: 'slow', name: 'Slow', type: 'debuff', duration: 10000,
      stackable: false, maxStacks: 1,
      effects: [{ type: 'speed_modify', value: -0.3 }],
    }
    system.applyBuff(entity, speedBuff, 's1')
    system.applyBuff(entity, slowDebuff, 's2')

    // Speed increases: only take highest = 0.5
    // Speed decreases: sum = -0.3
    // Total modifier = 0.5 + (-0.3) = 0.2
    expect(system.getSpeedModifier(entity)).toBeCloseTo(0.2)
  })
})

describe('BuffSystem modifier stats', () => {
  function setupWith(opts: { attack?: number; hp?: number }) {
    const bus = new EventBus()
    const buffSystem = new BuffSystem(bus)
    const player = createEntity({
      id: 'p1',
      type: 'player',
      hp: opts.hp ?? 10000,
      maxHp: opts.hp ?? 10000,
      attack: opts.attack ?? 100,
    })
    return { bus, buffSystem, player }
  }

  it('getAttackModifier returns 0 when no attack_modifier buffs', () => {
    const { buffSystem, player } = setupWith({ attack: 1000 })
    expect(buffSystem.getAttackModifier(player)).toBe(0)
    expect(buffSystem.getAttack(player)).toBe(1000)
  })

  it('getAttackModifier sums multiple attack_modifier effects', () => {
    const { buffSystem, player } = setupWith({ attack: 1000 })
    const def1: BuffDef = {
      id: 'atk_a', name: 'A', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    const def2: BuffDef = {
      id: 'atk_b', name: 'B', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.10 }],
    }
    buffSystem.applyBuff(player, def1, 'self')
    buffSystem.applyBuff(player, def2, 'self')
    expect(buffSystem.getAttackModifier(player)).toBeCloseTo(0.35)
    expect(buffSystem.getAttack(player)).toBe(1350) // 1000 * 1.35
  })

  it('getMaxHpModifier + getMaxHp parallel behavior', () => {
    const { buffSystem, player } = setupWith({ hp: 10000 })
    const def: BuffDef = {
      id: 'hp_up', name: 'HP Up', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'max_hp_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(player, def, 'self')
    expect(buffSystem.getMaxHpModifier(player)).toBeCloseTo(0.25)
    expect(buffSystem.getMaxHp(player)).toBe(12500) // 10000 * 1.25
  })

  it('max_hp_modifier does NOT modify current hp on apply (FF14 strict)', () => {
    const { buffSystem, player } = setupWith({ hp: 10000 })
    player.hp = 10000 // full hp
    const def: BuffDef = {
      id: 'hp_up', name: 'HP Up', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'max_hp_modifier', value: 0.25 }],
    }
    buffSystem.applyBuff(player, def, 'self')
    expect(player.hp).toBe(10000) // unchanged
    expect(buffSystem.getMaxHp(player)).toBe(12500) // upper limit raised
  })

  it('attack_modifier / max_hp_modifier isolated from damage_increase pool', () => {
    const { buffSystem, player } = setupWith({ attack: 1000 })
    const atkMod: BuffDef = {
      id: 'atk_mod', name: 'ATK Mod', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'attack_modifier', value: 0.25 }],
    }
    const dmgInc: BuffDef = {
      id: 'dmg_inc', name: 'DMG Inc', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.50 }],
    }
    buffSystem.applyBuff(player, atkMod, 'self')
    buffSystem.applyBuff(player, dmgInc, 'self')
    // attack_modifier goes through base-stat multiplicative layer: 1000 × 1.25 = 1250
    expect(buffSystem.getAttack(player)).toBe(1250)
    // damage_increase still flows through the additive pool (does not affect getAttack)
    expect(buffSystem.getDamageIncreases(player)).toContain(0.50)
  })
})

describe('BuffSystem.clearDeathBuffs', () => {
  function setup() {
    const bus = new EventBus()
    const buffSystem = new BuffSystem(bus)
    const player = createEntity({
      id: 'p1',
      type: 'player',
      hp: 10000,
      maxHp: 10000,
      attack: 100,
    })
    return { bus, buffSystem, player }
  }

  it('removes buffs without preserveOnDeath flag', () => {
    const { buffSystem, player } = setup()
    const regularDef: BuffDef = {
      id: 'regular', name: 'Regular', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.2 }],
    }
    buffSystem.applyBuff(player, regularDef, 'self')
    expect(player.buffs).toHaveLength(1)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(0)
  })

  it('retains buffs with preserveOnDeath: true', () => {
    const { buffSystem, player } = setup()
    const preservedDef: BuffDef = {
      id: 'preserved', name: 'Preserved', type: 'buff', duration: 30000,
      stackable: false, maxStacks: 1, preserveOnDeath: true,
      effects: [{ type: 'mitigation', value: 0.2 }],
    }
    buffSystem.applyBuff(player, preservedDef, 'self')
    expect(player.buffs).toHaveLength(1)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(1)
    expect(player.buffs[0].defId).toBe('preserved')
  })

  it('mixed: retains preserveOnDeath, removes regular', () => {
    const { buffSystem, player } = setup()
    const preserved: BuffDef = {
      id: 'preserved', name: 'P', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      preserveOnDeath: true, effects: [],
    }
    const regular: BuffDef = {
      id: 'regular', name: 'R', type: 'buff', duration: 30000, stackable: false, maxStacks: 1,
      effects: [],
    }
    buffSystem.applyBuff(player, preserved, 'self')
    buffSystem.applyBuff(player, regular, 'self')
    expect(player.buffs).toHaveLength(2)

    buffSystem.clearDeathBuffs(player)
    expect(player.buffs).toHaveLength(1)
    expect(player.buffs[0].defId).toBe('preserved')
  })
})
