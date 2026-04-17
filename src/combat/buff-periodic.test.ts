import { describe, it, expect } from 'vitest'
import { applyPeriodicBuff, buildPeriodicSnapshot, firePeriodicTick, tickPeriodicBuffs } from './buff-periodic'
import { BuffSystem } from './buff'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import type { BuffDef } from '@/core/types'
import type { BuffInstance } from '@/entity/entity'

function setup() {
  const bus = new EventBus()
  const entityMgr = new EntityManager(bus)
  const buffSystem = new BuffSystem(bus)
  const caster = entityMgr.create({ id: 'caster', type: 'player', attack: 900, hp: 6500, maxHp: 6500, mp: 10000, maxMp: 10000 })
  const target = entityMgr.create({ id: 'target', type: 'boss', attack: 0, hp: 100000, maxHp: 100000, mp: 0, maxMp: 0 })
  return { bus, buffSystem, caster, target }
}

describe('buildPeriodicSnapshot', () => {
  it('dot snapshot freezes caster attack + damage_increase + effect potency', () => {
    const { buffSystem, caster, target } = setup()
    buffSystem.registerDef({
      id: 'test_inc', name: 'test', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('test_inc')!, caster.id)

    const snap = buildPeriodicSnapshot(
      { type: 'dot', potency: 0.3, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.attack).toBe(900)
    expect(snap.potency).toBe(0.3)
    expect(snap.casterIncreases).toEqual([0.20])
    expect(snap.targetMaxMp).toBeUndefined()
  })

  it('hot snapshot matches dot snapshot shape', () => {
    const { buffSystem, caster, target } = setup()
    const snap = buildPeriodicSnapshot(
      { type: 'hot', potency: 0.5, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.attack).toBe(900)
    expect(snap.potency).toBe(0.5)
    expect(snap.casterIncreases).toEqual([])
  })

  it('mp_regen snapshot freezes target.maxMp + potency, no caster data needed', () => {
    const { buffSystem, caster, target } = setup()
    const snap = buildPeriodicSnapshot(
      { type: 'mp_regen', potency: 0.05, interval: 3000 },
      caster,
      target,
      buffSystem,
    )
    expect(snap.potency).toBe(0.05)
    expect(snap.targetMaxMp).toBe(0) // target boss has 0 MP
    expect(snap.casterIncreases).toEqual([])
    expect(snap.attack).toBe(0)  // placeholder 0
  })
})

const VENOM_DEF: BuffDef = {
  id: 'test_venom', name: 'venom', type: 'debuff',
  duration: 18000, stackable: false, maxStacks: 1,
  effects: [{ type: 'dot', potency: 0.3, interval: 3000 }],
}

describe('applyPeriodicBuff', () => {
  it('adds buff to target with periodic state populated', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    expect(target.buffs.length).toBe(1)
    const inst = target.buffs[0]
    expect(inst.defId).toBe('test_venom')
    expect(inst.periodic).toBeDefined()
    expect(inst.periodic!.effectType).toBe('dot')
    expect(inst.periodic!.interval).toBe(3000)
    expect(inst.periodic!.nextTickAt).toBe(3000) // gameTime(0) + interval(3000)
    expect(inst.periodic!.sourceCasterId).toBe('caster')
    expect(inst.periodic!.snapshot.attack).toBe(900)
  })

  it('refresh drops old pending tick and installs new snapshot', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const firstInst = target.buffs[0]
    expect(firstInst.periodic!.nextTickAt).toBe(3000)

    // caster buff 开 +0.30 at t=1500
    buffSystem.registerDef({
      id: 'test_barrage', name: 'b', type: 'buff', duration: 6000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.30 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('test_barrage')!, caster.id)

    // t=2000 refresh venom
    applyPeriodicBuff(target, VENOM_DEF, caster, 2000, buffSystem)

    // Old instance gone; new instance independent
    expect(target.buffs.length).toBe(1)
    const secondInst = target.buffs[0]
    expect(secondInst).not.toBe(firstInst)
    expect(secondInst.periodic!.nextTickAt).toBe(5000)
    expect(secondInst.periodic!.snapshot.casterIncreases).toEqual([0.30])
  })

  it('does not fire initial tick on apply (target hp unchanged)', () => {
    const { buffSystem, caster, target } = setup()
    const hpBefore = target.hp
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })
})

describe('firePeriodicTick', () => {
  it('dot tick: caster snapshot + target live mitigation + vulnerability', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]

    // target has mitigation 0.20
    buffSystem.registerDef({
      id: 'mit', name: 'mit', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.20 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('mit')!, target.id)

    // target has vulnerability 0.30
    buffSystem.registerDef({
      id: 'vuln', name: 'vuln', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    // damage = 900 × 0.3 × (1 + 0 + 0.30) × (1 - 0.20)
    //       = 900 × 0.3 × 1.30 × 0.80 = 280.8 → floor 280
    expect(target.hp).toBe(hpBefore - 280)
  })

  it('hot tick: caster snapshot increases, no mitigation, restore hp', () => {
    const { buffSystem, caster, target } = setup()
    target.hp = target.maxHp - 1000
    const hotDef: BuffDef = {
      id: 'hot_test', name: 'hot', type: 'buff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'hot', potency: 0.5, interval: 3000 }],
    }
    applyPeriodicBuff(target, hotDef, caster, 0, buffSystem)
    const inst = target.buffs[0]

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    // heal = 900 × 0.5 × 1.0 = 450
    expect(target.hp).toBe(hpBefore + 450)
  })

  it('hot tick does not exceed maxHp', () => {
    const { buffSystem, caster, target } = setup()
    const hotDef: BuffDef = {
      id: 'hot_test', name: 'hot', type: 'buff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'hot', potency: 100, interval: 3000 }],
    }
    applyPeriodicBuff(target, hotDef, caster, 0, buffSystem)
    const inst = target.buffs[0]

    target.hp = target.maxHp - 10
    firePeriodicTick(inst, target, buffSystem)
    expect(target.hp).toBe(target.maxHp)
  })

  it('mp_regen tick: targetMaxMp × potency, restore mp', () => {
    const { buffSystem, caster } = setup()
    const lucidDef: BuffDef = {
      id: 'lucid_test', name: 'lucid', type: 'buff', duration: 21000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mp_regen', potency: 0.05, interval: 3000 }],
    }
    caster.mp = 5000
    applyPeriodicBuff(caster, lucidDef, caster, 0, buffSystem)
    const inst = caster.buffs.find((b) => b.defId === 'lucid_test')!

    firePeriodicTick(inst, caster, buffSystem)
    // mp += 10000 × 0.05 = 500
    expect(caster.mp).toBe(5500)
  })

  it('mp_regen clamps at maxMp', () => {
    const { buffSystem, caster } = setup()
    const lucidDef: BuffDef = {
      id: 'lucid_test', name: 'lucid', type: 'buff', duration: 21000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mp_regen', potency: 0.5, interval: 3000 }],
    }
    caster.mp = caster.maxMp - 100
    applyPeriodicBuff(caster, lucidDef, caster, 0, buffSystem)
    const inst = caster.buffs.find((b) => b.defId === 'lucid_test')!

    firePeriodicTick(inst, caster, buffSystem)
    expect(caster.mp).toBe(caster.maxMp)
  })

  it('dot tick: invulnerable target takes no damage', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]

    buffSystem.registerDef({
      id: 'inv', name: 'invuln', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'invulnerable' }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('inv')!, target.id)

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })

  it('dot tick: undying target HP floored at 1 instead of 0', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]
    target.hp = 100 // tick 270 > 100, without undying would go to 0

    buffSystem.registerDef({
      id: 'ud', name: 'undying', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'undying' }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('ud')!, target.id)

    firePeriodicTick(inst, target, buffSystem)
    expect(target.hp).toBe(1)
  })

  it('dot tick emits damage:dealt event with periodic: true flag', () => {
    const { bus, buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]

    const events: any[] = []
    bus.on('damage:dealt', (p) => events.push(p))

    firePeriodicTick(inst, target, buffSystem)

    expect(events.length).toBe(1)
    expect(events[0].amount).toBe(270)
    expect(events[0].periodic).toBe(true)
    expect(events[0].source.id).toBe('caster')
    expect(events[0].target).toBe(target)
  })

  it('dot tick on invulnerable target does not emit damage:dealt', () => {
    const { bus, buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]
    buffSystem.registerDef({
      id: 'inv', name: 'invuln', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'invulnerable' }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('inv')!, target.id)

    const events: any[] = []
    bus.on('damage:dealt', (p) => events.push(p))

    firePeriodicTick(inst, target, buffSystem)
    expect(events.length).toBe(0)
  })

  it('hot tick emits damage:dealt with negative amount (heal convention)', () => {
    const { bus, buffSystem, caster, target } = setup()
    target.hp = target.maxHp - 1000
    const hotDef: BuffDef = {
      id: 'hot_test', name: 'hot', type: 'buff', duration: 18000, stackable: false, maxStacks: 1,
      effects: [{ type: 'hot', potency: 0.5, interval: 3000 }],
    }
    applyPeriodicBuff(target, hotDef, caster, 0, buffSystem)
    const inst = target.buffs[0]

    const events: any[] = []
    bus.on('damage:dealt', (p) => events.push(p))
    firePeriodicTick(inst, target, buffSystem)

    expect(events.length).toBe(1)
    expect(events[0].amount).toBe(-450)
    expect(events[0].periodic).toBe(true)
  })

  it('dot tick: shield absorbs damage before HP loss', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const inst = target.buffs[0]

    // Apply a 200 HP shield (stacks represent shield HP)
    buffSystem.registerDef({
      id: 'shield_test', name: 'shield', type: 'buff', duration: 10000, stackable: true, maxStacks: 9999, shield: true,
      effects: [],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('shield_test')!, target.id, 200)

    const hpBefore = target.hp
    firePeriodicTick(inst, target, buffSystem)
    // tick = 900 x 0.3 = 270; shield absorbs 200 -> 70 dmg reaches HP
    expect(target.hp).toBe(hpBefore - 70)
  })
})

describe('tickPeriodicBuffs', () => {
  it('fires no tick at t=0 (no initial)', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    const hpBefore = target.hp
    tickPeriodicBuffs([target], 0, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })

  it('fires first tick at t=interval', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target], 3000, buffSystem)
    // 900 × 0.3 = 270
    expect(target.hp).toBe(100000 - 270)
  })

  it('accumulates ticks for 18s DoT (6 ticks at t=3/6/9/12/15/18)', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000]) {
      tickPeriodicBuffs([target], t, buffSystem)
    }
    expect(target.hp).toBe(100000 - 270 * 6)
  })

  it('while-loop catchup: gameTime jumps from t=3 to t=13 fires 4 ticks', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target], 13000, buffSystem)
    // t=3, 6, 9, 12 (t=15 > 13s → not yet)
    expect(target.hp).toBe(100000 - 270 * 4)
  })

  it('inclusive end: tick at expireAt fires, buff then expires', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    for (const t of [3000, 6000, 9000, 12000, 15000, 18000]) {
      tickPeriodicBuffs([target], t, buffSystem)
    }
    expect(target.hp).toBe(100000 - 270 * 6)
    // Simulate BuffSystem.update expiring the buff before subsequent frames.
    // After manual removal, no extra tick should fire even if gameTime advances.
    target.buffs = target.buffs.filter((b) => b.defId !== 'test_venom')
    tickPeriodicBuffs([target], 21000, buffSystem)
    expect(target.hp).toBe(100000 - 270 * 6)
  })

  it('entity with no periodic buffs is no-op', () => {
    const { buffSystem, target } = setup()
    const hpBefore = target.hp
    tickPeriodicBuffs([target], 10000, buffSystem)
    expect(target.hp).toBe(hpBefore)
  })

  it('skips dead entities (alive: false)', () => {
    const { buffSystem, caster, target } = setup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    target.alive = false
    const hpBefore = target.hp
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(hpBefore) // no tick on dead target
  })

  it('ticks multiple entities in one call', () => {
    const { buffSystem, caster, target } = setup()
    // Fabricate target2 by hand (simpler than spinning up a fresh EntityManager).
    const target2: any = {
      id: 'target2', type: 'boss', hp: 100000, maxHp: 100000, mp: 0, maxMp: 0, attack: 0,
      buffs: [] as BuffInstance[], alive: true, targetable: true, visible: true,
      position: { x: 0, y: 0, z: 0 }, facing: 0, speed: 0, size: 1,
      autoAttackRange: 3.5, aggroRange: 10, inCombat: false, casting: null,
      gcdTimer: 0, gcdDuration: 2500, autoAttackTimer: 0, target: null,
      skillIds: [], customData: {}, group: 'test',
    }
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)
    applyPeriodicBuff(target2, VENOM_DEF, caster, 0, buffSystem)
    tickPeriodicBuffs([target, target2], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 270)
    expect(target2.hp).toBe(100000 - 270)
  })
})

describe('periodic framework — spec §5.4 scenarios', () => {
  function freshSetup() {
    const { bus, buffSystem, caster, target } = setup()
    return { bus, buffSystem, caster, target }
  }

  it('scenario A: caster damage_increase snapshot persists after buff expires', () => {
    const { buffSystem, caster, target } = freshSetup()
    // caster has damage_increase +0.20
    buffSystem.registerDef({
      id: 'guard', name: 'g', type: 'buff', duration: 8000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('guard')!, caster.id)

    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=3s tick: 900 × 0.3 × 1.20 = 324
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 324)

    // t=8.5s guard buff expires (manually simulate BuffSystem.update removing it)
    buffSystem.removeBuff(caster, 'guard', 'expired')

    // t=9s: 3rd DoT tick still uses snapshot.casterIncreases = [0.20] → 324
    tickPeriodicBuffs([target], 9000, buffSystem)
    // Cumulative 3 ticks (t=3, 6, 9), all with +20%
    expect(target.hp).toBe(100000 - 324 * 3)
  })

  it('scenario B: target mitigation is read LIVE at tick time', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=3: no mitigation, tick = 270
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 270)

    // t=4: add mitigation 0.20 to target
    buffSystem.registerDef({
      id: 'mit', name: 'mit', type: 'buff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'mitigation', value: 0.20 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('mit')!, target.id)

    // t=6: tick should be reduced by mitigation
    // 900 × 0.3 × (1 + 0) × (1 - 0.20) = 216
    tickPeriodicBuffs([target], 6000, buffSystem)
    expect(target.hp).toBe(100000 - 270 - 216)

    // t=10: manually expire mit
    buffSystem.removeBuff(target, 'mit', 'expired')

    // t=12: covers t=9 (still in mit window) and t=12 (mit gone)
    tickPeriodicBuffs([target], 12000, buffSystem)
    // mit duration is 10000 + 500 grace = 10500. So t=9 is in window (mit present → 216), t=12 is out (removed → 270).
    // But we manually removed at t=10, so by t=9 mit is still present at 216. By t=12 it's gone.
    // Actually in this test we're not calling BuffSystem.update, so the manual removal at "t=10" happens in code BEFORE we tick t=9.
    // Re-think: we're calling tickPeriodicBuffs([target], 12000, buffSystem) once; the catchup fires both t=9 and t=12.
    // At that point, mit is ALREADY removed (we removed it before calling tick). So BOTH t=9 and t=12 see NO mit → both 270.
    expect(target.hp).toBe(100000 - 270 - 216 - 270 - 270)
  })

  it('scenario C: target vulnerability flows into same additive pool as caster snapshot', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=2: add vuln 0.30 to target
    buffSystem.registerDef({
      id: 'vuln', name: 'v', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    // t=3 tick: 900 × 0.3 × (1 + 0 + 0.30) = 351
    tickPeriodicBuffs([target], 3000, buffSystem)
    expect(target.hp).toBe(100000 - 351)

    // t=6 tick still in vuln window
    tickPeriodicBuffs([target], 6000, buffSystem)
    expect(target.hp).toBe(100000 - 351 * 2)

    // t=7 manually expire vuln
    buffSystem.removeBuff(target, 'vuln', 'expired')

    // t=9 tick — no vuln
    tickPeriodicBuffs([target], 9000, buffSystem)
    expect(target.hp).toBe(100000 - 351 * 2 - 270)
  })

  it('scenario D: refresh drops pending tick, no compensation', () => {
    const { buffSystem, caster, target } = freshSetup()
    // First, caster has +0.20
    buffSystem.registerDef({
      id: 'guard', name: 'g', type: 'buff', duration: 8000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.20 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('guard')!, caster.id)
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // 3 ticks through t=9 with +20%
    tickPeriodicBuffs([target], 9000, buffSystem)
    const hpAfterFirst = target.hp // 100000 - 324 × 3 = 99028

    // t=10: manually expire guard, then refresh venom (caster no longer has +20%)
    buffSystem.removeBuff(caster, 'guard', 'expired')
    applyPeriodicBuff(target, VENOM_DEF, caster, 10000, buffSystem)

    // Old nextTickAt was 12000 — now dropped
    // New nextTickAt = 13000

    tickPeriodicBuffs([target], 12000, buffSystem)
    expect(target.hp).toBe(hpAfterFirst) // t=12 no tick (old schedule dead)

    tickPeriodicBuffs([target], 13000, buffSystem)
    expect(target.hp).toBe(hpAfterFirst - 270) // t=13 tick with no +20%
  })

  it('scenario E: refresh during burst window locks in buffed snapshot for entire duration', () => {
    const { buffSystem, caster, target } = freshSetup()
    // Initial DoT without buff
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=1.5: open barrage +0.30
    buffSystem.registerDef({
      id: 'barrage', name: 'b', type: 'buff', duration: 6000, stackable: false, maxStacks: 1,
      effects: [{ type: 'damage_increase', value: 0.30 }],
    })
    buffSystem.applyBuff(caster, buffSystem.getDef('barrage')!, caster.id)

    // t=2: refresh venom — old pending (t=3) dropped, new snapshot has +0.30
    applyPeriodicBuff(target, VENOM_DEF, caster, 2000, buffSystem)
    // New nextTickAt = 5000

    tickPeriodicBuffs([target], 5000, buffSystem)
    expect(target.hp).toBe(100000 - 351) // 900 × 0.3 × 1.30 = 351

    // t=8: barrage expired (duration 6000 + 500 grace = 6500 from t=1.5 apply → expires 8.0)
    // Manually expire for simplicity
    buffSystem.removeBuff(caster, 'barrage', 'expired')

    // t=8 tick still uses snapshot (+0.30 frozen)
    tickPeriodicBuffs([target], 8000, buffSystem)
    expect(target.hp).toBe(100000 - 351 * 2) // still 351 each
  })

  it('scenario F: caster death does not stop DoT, target live effects continue', () => {
    const { buffSystem, caster, target } = freshSetup()
    applyPeriodicBuff(target, VENOM_DEF, caster, 0, buffSystem)

    // t=5 caster dies (alive = false, hp = 0)
    caster.alive = false
    caster.hp = 0

    // t=6 add vuln +0.30 to target
    buffSystem.registerDef({
      id: 'vuln', name: 'v', type: 'debuff', duration: 10000, stackable: false, maxStacks: 1,
      effects: [{ type: 'vulnerability', value: 0.30 }],
    })
    buffSystem.applyBuff(target, buffSystem.getDef('vuln')!, caster.id)

    // t=6 tick covers t=3 and t=6 via while-loop catchup. Both ticks read
    // vulnerability LIVE at fire time — and vuln was applied before this call —
    // so BOTH ticks see +0.30 → 351 each. Same simplification as scenario B:
    // we don't interleave BuffSystem.update between catchup ticks.
    // Key assertion: caster.alive === false did NOT prevent ticks from firing.
    tickPeriodicBuffs([target], 6000, buffSystem)
    expect(target.hp).toBe(100000 - 351 * 2)
  })
})
