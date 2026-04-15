import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { CombatResolver } from './combat-resolver'
import type { SkillDef, BuffDef } from '@/core/types'

function setup(opts?: { playerHp?: number; playerMaxHp?: number; playerMp?: number; playerMaxMp?: number; playerAttack?: number; bossAttack?: number }) {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const arena = new Arena({ name: 'test', shape: { type: 'circle', radius: 50 }, boundary: 'wall' })
  const resolver = new CombatResolver(bus, entityMgr, buffSystem, arena)

  const playerMaxHp = opts?.playerMaxHp ?? 10000
  const playerMaxMp = opts?.playerMaxMp ?? 10000
  const boss = entityMgr.create({ id: 'boss', type: 'boss', attack: opts?.bossAttack ?? 1, hp: 999999 })
  const player = entityMgr.create({
    id: 'player', type: 'player',
    attack: opts?.playerAttack ?? 100,
    hp: opts?.playerHp ?? playerMaxHp, maxHp: playerMaxHp,
    mp: opts?.playerMp ?? 0, maxMp: playerMaxMp,
  })
  boss.target = 'player'
  player.target = 'boss'

  return { bus, entityMgr, buffSystem, resolver, boss, player }
}

function makeSkill(overrides: Partial<SkillDef> & Pick<SkillDef, 'id' | 'effects'>): SkillDef {
  return {
    name: overrides.id, type: 'spell', castTime: 0, cooldown: 0, gcd: false,
    targetType: 'single', requiresTarget: true, range: 99, mpCost: 0,
    ...overrides,
  }
}

function castSkill(bus: EventBus, caster: any, skill: SkillDef) {
  bus.emit('skill:cast_complete', { caster, skill })
}

// ─── Buff definitions ───────────────────────────────────

const shieldBuff: BuffDef = {
  id: 'shield', name: 'Shield', type: 'buff',
  duration: 30000, stackable: true, maxStacks: 999999,
  shield: true, effects: [],
}

const undyingBuff: BuffDef = {
  id: 'undying', name: 'Undying', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'undying' }],
}

const mitigationBuff: BuffDef = {
  id: 'mitigation', name: 'Mitigation', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'mitigation', value: 0.9 }],
}

const dmgIncreaseBuff: BuffDef = {
  id: 'dmg_up', name: 'Damage Up', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'damage_increase', value: 0.5 }],
}

const vulnerabilityDebuff: BuffDef = {
  id: 'vuln', name: 'Vulnerability', type: 'debuff',
  duration: 30000, stackable: true, maxStacks: 10,
  effects: [{ type: 'vulnerability', value: 0.1 }],
}

const lifestealBuff: BuffDef = {
  id: 'lifesteal', name: 'Lifesteal', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'lifesteal', value: 0.5 }],
}

const mpOnHitBuff: BuffDef = {
  id: 'mp_on_hit', name: 'MP on Hit', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'mp_on_hit', value: 200 }],
}

const smallMitigationBuff: BuffDef = {
  id: 'small_mit', name: 'Small Mit', type: 'buff',
  duration: 30000, stackable: false, maxStacks: 1,
  effects: [{ type: 'mitigation', value: 0.2 }],
}

// ─── Special damage ─────────────────────────────────────

describe('CombatResolver — special damage', () => {
  it('should kill a shielded + undying entity with special damage', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, shieldBuff, 'self', 999999)
    buffSystem.applyBuff(player, undyingBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'enrage',
      effects: [{ type: 'damage', potency: 999999, dmgType: 'special' }],
    }))
    expect(player.hp).toBe(0)
  })

  it('should respect undying for normal damage', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, undyingBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'big_hit',
      effects: [{ type: 'damage', potency: 999999 }],
    }))
    expect(player.hp).toBe(1)
  })

  it('should ignore mitigation for special damage', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, mitigationBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'enrage',
      effects: [{ type: 'damage', potency: 999999, dmgType: 'special' }],
    }))
    expect(player.hp).toBe(0)
  })

  it('should ignore shield for special damage', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, shieldBuff, 'self', 999999)

    castSkill(bus, boss, makeSkill({
      id: 'enrage',
      effects: [{ type: 'damage', potency: 999999, dmgType: 'special' }],
    }))
    expect(player.hp).toBe(0)
  })

  it('should support array dmgType with special', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, undyingBuff, 'self')
    buffSystem.applyBuff(player, mitigationBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'enrage',
      effects: [{ type: 'damage', potency: 999999, dmgType: ['special', 'magical'] }],
    }))
    expect(player.hp).toBe(0)
  })
})

// ─── Shield mechanics ───────────────────────────────────

describe('CombatResolver — shield', () => {
  it('should absorb damage with shield before HP', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, shieldBuff, 'self', 5000)

    // Boss attack=1, potency=3000 → 3000 damage. Shield absorbs all, HP untouched
    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 3000 }],
    }))
    expect(player.hp).toBe(10000)
    expect(buffSystem.getShieldTotal(player)).toBe(2000)
  })

  it('should pass remaining damage to HP when shield breaks', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, shieldBuff, 'self', 2000)

    // 8000 damage - 2000 shield = 6000 to HP
    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 8000 }],
    }))
    expect(player.hp).toBe(4000)
    expect(buffSystem.getShieldTotal(player)).toBe(0)
  })

  it('should remove shield buff when fully broken', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, shieldBuff, 'self', 100)

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 5000 }],
    }))
    expect(buffSystem.hasBuff(player, 'shield')).toBe(false)
  })
})

// ─── Mitigation stacking ────────────────────────────────

describe('CombatResolver — mitigation', () => {
  it('should apply mitigation multiplicatively', () => {
    const { bus, buffSystem, boss, player } = setup()
    // 20% mit + 90% mit: 10000 × (1-0.2) × (1-0.9) = 10000 × 0.8 × 0.1 = 800
    buffSystem.applyBuff(player, smallMitigationBuff, 'self')
    buffSystem.applyBuff(player, mitigationBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 10000 }],
    }))
    expect(player.hp).toBe(10000 - 800)
  })

  it('should combine shield and mitigation correctly', () => {
    const { bus, buffSystem, boss, player } = setup()
    // 90% mit: 10000 → 1000 damage after mitigation, shield 500 absorbs, 500 to HP
    buffSystem.applyBuff(player, mitigationBuff, 'self')
    buffSystem.applyBuff(player, shieldBuff, 'self', 500)

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 10000 }],
    }))
    expect(player.hp).toBe(10000 - 500)
    expect(buffSystem.getShieldTotal(player)).toBe(0)
  })
})

// ─── Vulnerability debuff ───────────────────────────────

describe('CombatResolver — vulnerability', () => {
  it('should increase damage taken per stack', () => {
    const { bus, buffSystem, resolver, boss, player } = setup()
    resolver.registerBuffs({ vuln: vulnerabilityDebuff })

    // Apply vuln via boss skill (debuff → applies to target)
    castSkill(bus, boss, makeSkill({
      id: 'vuln_apply',
      effects: [{ type: 'apply_buff', buffId: 'vuln', stacks: 5 }],
    }))
    expect(buffSystem.getStacks(player, 'vuln')).toBe(5)

    // 1000 base × (1 + 5×0.1) = 1000 × 1.5 = 1500
    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 1000 }],
    }))
    expect(player.hp).toBe(10000 - 1500)
  })
})

// ─── Damage increase buff ───────────────────────────────

describe('CombatResolver — damage increase', () => {
  it('should increase outgoing damage', () => {
    const { bus, buffSystem, player, boss } = setup()
    buffSystem.applyBuff(player, dmgIncreaseBuff, 'self')

    // Player attack=100, potency=10, 50% increase: 100×10×1.5 = 1500
    castSkill(bus, player, makeSkill({
      id: 'attack',
      effects: [{ type: 'damage', potency: 10 }],
    }))
    expect(boss.hp).toBe(999999 - 1500)
  })
})

// ─── Lifesteal ──────────────────────────────────────────

describe('CombatResolver — lifesteal', () => {
  it('should heal caster for percentage of damage dealt', () => {
    const { bus, buffSystem, player, boss } = setup({ playerHp: 5000 })
    buffSystem.applyBuff(player, lifestealBuff, 'self')

    // Player attack=100, potency=10 → 1000 dmg, 50% lifesteal → 500 heal
    castSkill(bus, player, makeSkill({
      id: 'attack',
      effects: [{ type: 'damage', potency: 10 }],
    }))
    expect(player.hp).toBe(5500)
  })

  it('should not overheal past maxHp', () => {
    const { bus, buffSystem, player, boss } = setup()
    buffSystem.applyBuff(player, lifestealBuff, 'self')

    castSkill(bus, player, makeSkill({
      id: 'attack',
      effects: [{ type: 'damage', potency: 10 }],
    }))
    expect(player.hp).toBe(10000)
  })

  it('should not heal on zero damage', () => {
    const { bus, buffSystem, player, boss } = setup({ playerHp: 5000, playerAttack: 0 })
    buffSystem.applyBuff(player, lifestealBuff, 'self')

    castSkill(bus, player, makeSkill({
      id: 'attack',
      effects: [{ type: 'damage', potency: 10 }],
    }))
    expect(player.hp).toBe(5000)
  })
})

// ─── MP on hit ──────────────────────────────────────────

describe('CombatResolver — mp on hit', () => {
  it('should restore MP when taking damage', () => {
    const { bus, buffSystem, boss, player } = setup({ playerMp: 0 })
    buffSystem.applyBuff(player, mpOnHitBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 1000 }],
    }))
    expect(player.mp).toBe(200)
  })

  it('should not exceed maxMp', () => {
    const { bus, buffSystem, boss, player } = setup({ playerMp: 9900 })
    buffSystem.applyBuff(player, mpOnHitBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 1000 }],
    }))
    expect(player.mp).toBe(10000)
  })

  it('should still restore MP from special damage', () => {
    const { bus, buffSystem, boss, player } = setup({ playerMp: 0 })
    buffSystem.applyBuff(player, mpOnHitBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'special_hit',
      effects: [{ type: 'damage', potency: 1000, dmgType: 'special' }],
    }))
    expect(player.mp).toBe(200)
  })
})

// ─── Healing ────────────────────────────────────────────

describe('CombatResolver — healing', () => {
  it('should heal based on caster attack × potency', () => {
    const { bus, player } = setup({ playerHp: 5000 })

    // Player attack=100, potency=20 → heal 2000
    castSkill(bus, player, makeSkill({
      id: 'heal',
      effects: [{ type: 'heal', potency: 20 }],
    }))
    expect(player.hp).toBe(7000)
  })

  it('should not overheal past maxHp', () => {
    const { bus, player } = setup({ playerHp: 9000 })

    castSkill(bus, player, makeSkill({
      id: 'heal',
      effects: [{ type: 'heal', potency: 20 }],
    }))
    expect(player.hp).toBe(10000)
  })
})

// ─── MP restore ─────────────────────────────────────────

describe('CombatResolver — restore MP', () => {
  it('should restore percentage of max MP', () => {
    const { bus, player } = setup({ playerMp: 0 })

    // 30% of 10000 = 3000
    castSkill(bus, player, makeSkill({
      id: 'mp_skill',
      effects: [{ type: 'restore_mp', percent: 0.3 }],
    }))
    expect(player.mp).toBe(3000)
  })

  it('should not exceed maxMp', () => {
    const { bus, player } = setup({ playerMp: 9000 })

    castSkill(bus, player, makeSkill({
      id: 'mp_skill',
      effects: [{ type: 'restore_mp', percent: 0.5 }],
    }))
    expect(player.mp).toBe(10000)
  })
})

// ─── Multi-effect skill resolution ──────────────────────

describe('CombatResolver — multi-effect skills', () => {
  it('should apply damage then buff in order', () => {
    const { bus, buffSystem, resolver, player, boss } = setup()
    resolver.registerBuffs({ vuln: vulnerabilityDebuff })

    // Skill: deal damage + apply 3 vuln stacks. Damage should NOT be affected by vuln (applied after)
    castSkill(bus, boss, makeSkill({
      id: 'combo',
      effects: [
        { type: 'damage', potency: 1000 },
        { type: 'apply_buff', buffId: 'vuln', stacks: 3 },
      ],
    }))
    expect(player.hp).toBe(10000 - 1000)
    expect(buffSystem.getStacks(player, 'vuln')).toBe(3)
  })

  it('should resolve damage + heal in same skill', () => {
    const { bus, player, boss } = setup({ playerHp: 5000 })

    // Boss hits player for 2000, player heals self is not possible in same skill
    // But player can: deal damage to boss + heal self
    castSkill(bus, player, makeSkill({
      id: 'drain',
      effects: [
        { type: 'damage', potency: 10 },
        { type: 'heal', potency: 30 },
      ],
    }))
    // damage: 100×10 = 1000 to boss, heal: 100×30 = 3000 to self
    expect(boss.hp).toBe(999999 - 1000)
    expect(player.hp).toBe(8000)
  })
})

// ─── Damage event emission ──────────────────────────────

describe('CombatResolver — damage events', () => {
  it('should emit damage:dealt with correct amount', () => {
    const { bus, boss } = setup()
    const handler = vi.fn()
    bus.on('damage:dealt', handler)

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 3000 }],
    }))

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000, skill: { name: 'hit' } }),
    )
  })

  it('should emit negative amount for healing', () => {
    const { bus, player } = setup({ playerHp: 5000 })
    const handler = vi.fn()
    bus.on('damage:dealt', handler)

    castSkill(bus, player, makeSkill({
      id: 'heal',
      effects: [{ type: 'heal', potency: 20 }],
    }))

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -2000 }),
    )
  })

  it('should emit lifesteal heal as separate event', () => {
    const { bus, buffSystem, player } = setup({ playerHp: 5000 })
    buffSystem.applyBuff(player, lifestealBuff, 'self')
    const events: any[] = []
    bus.on('damage:dealt', (e: any) => events.push(e))

    castSkill(bus, player, makeSkill({
      id: 'attack',
      effects: [{ type: 'damage', potency: 10 }],
    }))

    // First event: damage dealt, second event: lifesteal heal
    expect(events).toHaveLength(2)
    expect(events[0].amount).toBe(1000)
    expect(events[1].amount).toBe(-500)
  })
})

// ─── Edge cases ─────────────────────────────────────────

describe('CombatResolver — edge cases', () => {
  it('should not go below 0 HP from normal damage', () => {
    const { bus, boss, player } = setup({ playerHp: 100 })

    castSkill(bus, boss, makeSkill({
      id: 'overkill',
      effects: [{ type: 'damage', potency: 999999 }],
    }))
    expect(player.hp).toBe(0)
  })

  it('should handle zero potency damage', () => {
    const { bus, boss, player } = setup()

    castSkill(bus, boss, makeSkill({
      id: 'zero',
      effects: [{ type: 'damage', potency: 0 }],
    }))
    expect(player.hp).toBe(10000)
  })

  it('should not crash when target has no buffs', () => {
    const { bus, boss, player } = setup()

    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 1000 }],
    }))
    expect(player.hp).toBe(9000)
  })

  it('should handle damage with no dmgType (normal damage)', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, mitigationBuff, 'self')

    // 90% mitigation: 5000 → 500
    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 5000 }],
    }))
    expect(player.hp).toBe(10000 - 500)
  })

  it('undying + shield: shield absorbs first, then undying protects', () => {
    const { bus, buffSystem, boss, player } = setup({ playerHp: 100 })
    buffSystem.applyBuff(player, shieldBuff, 'self', 3000)
    buffSystem.applyBuff(player, undyingBuff, 'self')

    // 5000 damage - 3000 shield = 2000 to HP, but undying clamps to 1
    castSkill(bus, boss, makeSkill({
      id: 'hit',
      effects: [{ type: 'damage', potency: 5000 }],
    }))
    expect(player.hp).toBe(1)
    expect(buffSystem.getShieldTotal(player)).toBe(0)
  })

  it('multiple hits: undying survives first, dies to second without undying', () => {
    const { bus, buffSystem, boss, player } = setup()
    buffSystem.applyBuff(player, undyingBuff, 'self')

    castSkill(bus, boss, makeSkill({
      id: 'hit1',
      effects: [{ type: 'damage', potency: 999999 }],
    }))
    expect(player.hp).toBe(1)

    // Remove undying, second hit kills
    buffSystem.removeBuff(player, 'undying', 'expired')

    castSkill(bus, boss, makeSkill({
      id: 'hit2',
      effects: [{ type: 'damage', potency: 999999 }],
    }))
    expect(player.hp).toBe(0)
  })
})

// ─── Invulnerable ──────────────────────────────────────

describe('CombatResolver — invulnerable', () => {
  it('should negate non-special damage and emit invulnerable event', () => {
    const { bus, buffSystem, resolver, boss, player } = setup()

    const invulnBuff: BuffDef = {
      id: 'invuln', name: 'Invulnerable', type: 'buff',
      duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'invulnerable' }],
    }
    resolver.registerBuffs({ invuln: invulnBuff })
    buffSystem.applyBuff(player, invulnBuff, 'player')

    const skill = makeSkill({
      id: 'boss_hit',
      effects: [{ type: 'damage', potency: 999 }],
    })

    const dmgSpy = vi.fn()
    const invulnSpy = vi.fn()
    bus.on('damage:dealt', dmgSpy)
    bus.on('damage:invulnerable', invulnSpy)
    castSkill(bus, boss, skill)

    // No damage dealt event for invulnerable
    expect(dmgSpy).not.toHaveBeenCalled()
    // Invulnerable event emitted
    expect(invulnSpy).toHaveBeenCalledTimes(1)
    expect(invulnSpy.mock.calls[0][0].target).toBe(player)
    // HP unchanged
    expect(player.hp).toBe(10000)
  })

  it('should NOT negate special damage', () => {
    const { bus, buffSystem, resolver, boss, player } = setup()

    const invulnBuff: BuffDef = {
      id: 'invuln', name: 'Invulnerable', type: 'buff',
      duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'invulnerable' }],
    }
    resolver.registerBuffs({ invuln: invulnBuff })
    buffSystem.applyBuff(player, invulnBuff, 'player')

    const skill = makeSkill({
      id: 'enrage',
      effects: [{ type: 'damage', potency: 999999, dmgType: 'special' }],
    })

    const dmgSpy = vi.fn()
    bus.on('damage:dealt', dmgSpy)
    castSkill(bus, boss, skill)

    expect(dmgSpy).toHaveBeenCalledTimes(1)
    expect(player.hp).toBe(0)
  })

  it('should block knockback when invulnerable', () => {
    const { bus, buffSystem, resolver, boss, player } = setup()

    const invulnBuff: BuffDef = {
      id: 'invuln', name: 'Invulnerable', type: 'buff',
      duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'invulnerable' }],
    }
    resolver.registerBuffs({ invuln: invulnBuff })
    buffSystem.applyBuff(player, invulnBuff, 'player')

    const originalX = player.position.x
    const originalY = player.position.y

    const skill = makeSkill({
      id: 'kb_hit',
      effects: [
        { type: 'damage', potency: 1 },
        { type: 'knockback', distance: 10 },
      ],
    })

    castSkill(bus, boss, skill)

    // Position unchanged — knockback blocked
    expect(player.position.x).toBe(originalX)
    expect(player.position.y).toBe(originalY)
  })
})

// ─── potencyWithBuff ───────────────────────────────────

describe('CombatResolver — potencyWithBuff', () => {
  it('should add damageIncrease when buff stacks exist and consume 1 stack', () => {
    const { bus, buffSystem, player, boss } = setup({ playerAttack: 900 })

    const buff: BuffDef = {
      id: 'test_fof', name: 'FoF', type: 'buff',
      duration: 21000, stackable: true, maxStacks: 4, effects: [],
    }
    buffSystem.applyBuff(player, buff, 'player', 3)

    const skill = makeSkill({
      id: 'test_melee',
      potencyWithBuff: { buffId: 'test_fof', damageIncrease: 0.25, consumeStack: true },
      effects: [{ type: 'damage', potency: 2.0 }],
    })

    const spy = vi.fn()
    bus.on('damage:dealt', spy)
    castSkill(bus, player, skill)

    // damage = 900 * 2.0 * (1 + 0.25) = 2250
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].amount).toBe(2250)
    // Consumed 1 stack: 3 → 2
    expect(buffSystem.getStacks(player, 'test_fof')).toBe(2)
  })

  it('should not add damageIncrease when no buff stacks', () => {
    const { bus, player } = setup({ playerAttack: 900 })

    const skill = makeSkill({
      id: 'test_melee',
      potencyWithBuff: { buffId: 'test_fof', damageIncrease: 0.25, consumeStack: true },
      effects: [{ type: 'damage', potency: 2.0 }],
    })

    const spy = vi.fn()
    bus.on('damage:dealt', spy)
    castSkill(bus, player, skill)

    // No buff → no increase: 900 * 2.0 = 1800
    expect(spy.mock.calls[0][0].amount).toBe(1800)
  })

  it('should restore MP when restoreMp is set and buff consumed', () => {
    const { bus, buffSystem, player } = setup({ playerAttack: 900, playerMp: 5000 })

    const buff: BuffDef = {
      id: 'test_fof', name: 'FoF', type: 'buff',
      duration: 21000, stackable: true, maxStacks: 4, effects: [],
    }
    buffSystem.applyBuff(player, buff, 'player', 2)

    const skill = makeSkill({
      id: 'test_melee',
      potencyWithBuff: { buffId: 'test_fof', damageIncrease: 0.25, consumeStack: true, restoreMp: 2000 },
      effects: [{ type: 'damage', potency: 2.0 }],
    })

    castSkill(bus, player, skill)

    expect(player.mp).toBe(7000) // 5000 + 2000
    expect(buffSystem.getStacks(player, 'test_fof')).toBe(1)
  })

  it('should not restore MP when no buff stacks exist', () => {
    const { bus, player } = setup({ playerAttack: 900, playerMp: 5000 })

    const skill = makeSkill({
      id: 'test_melee',
      potencyWithBuff: { buffId: 'test_fof', damageIncrease: 0.25, consumeStack: true, restoreMp: 2000 },
      effects: [{ type: 'damage', potency: 2.0 }],
    })

    castSkill(bus, player, skill)

    expect(player.mp).toBe(5000) // unchanged
  })

  it('should be additive with other damage_increase buffs', () => {
    const { bus, buffSystem, player, boss } = setup({ playerAttack: 1000 })

    // Existing damage_increase buff (+20%)
    const atkBuff: BuffDef = {
      id: 'atk_up', name: 'ATK Up', type: 'buff',
      duration: 30000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.2 }],
    }
    buffSystem.applyBuff(player, atkBuff, 'player')

    // potencyWithBuff (+25%)
    const fofBuff: BuffDef = {
      id: 'test_fof', name: 'FoF', type: 'buff',
      duration: 21000, stackable: true, maxStacks: 4, effects: [],
    }
    buffSystem.applyBuff(player, fofBuff, 'player', 1)

    const skill = makeSkill({
      id: 'test_melee',
      potencyWithBuff: { buffId: 'test_fof', damageIncrease: 0.25, consumeStack: true },
      effects: [{ type: 'damage', potency: 2.0 }],
    })

    const spy = vi.fn()
    bus.on('damage:dealt', spy)
    castSkill(bus, player, skill)

    // damage = 1000 * 2.0 * (1 + 0.2 + 0.25) = 2900
    expect(spy.mock.calls[0][0].amount).toBe(2900)
  })
})
