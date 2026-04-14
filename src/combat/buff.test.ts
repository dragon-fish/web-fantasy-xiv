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

  it('should tick down buff duration', () => {
    const { system, entity } = setup()
    system.applyBuff(entity, mitBuff, 'source1')

    system.update(entity, 5000)
    expect(entity.buffs).toHaveLength(1)
    // duration 10000 + 1000 grace period - 5000 elapsed = 6000
    expect(entity.buffs[0].remaining).toBe(6000)
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
