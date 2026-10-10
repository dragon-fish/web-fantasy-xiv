import { EventBus } from '@/core/event-bus'
import { BuffSystem } from '@/combat/buff'
import { EntityManager } from '@/entity/entity-manager'
import { Arena } from '@/arena/arena'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { SkillResolver } from '@/skill/skill-resolver'
import { CombatResolver } from './combat-resolver'
import { createPuppetReviver, createRaiseSequence, REVIVE_BUFFS } from './player-revive'

const has = (e: { buffs: { defId: string }[] }, id: string) => e.buffs.some(b => b.defId === id)

/** The practice puppet raising the player through the real skill / combat resolvers */
function puppetSetup(denyAfter: 'brink' | 'once' = 'brink') {
  const bus = new EventBus()
  const mgr = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  const zones = new AoeZoneManager(bus, mgr)
  const skills = new SkillResolver(bus, mgr, buffs, zones)
  const combat = new CombatResolver(bus, mgr, buffs, new Arena({ name: 't', shape: { type: 'circle', radius: 30 }, boundary: 'wall' }), zones)
  combat.registerBuffs(REVIVE_BUFFS)
  const player = mgr.create({ id: 'p', type: 'player', hp: 8000, mp: 0, maxMp: 10000, position: { x: 5, y: 5, z: 0 } })
  const queue: (() => void)[] = []
  const schedule = (_ms: number, fn: () => void) => { queue.push(fn) }
  createRaiseSequence({ bus, buffSystem: buffs, schedule })
  const reviver = createPuppetReviver({ bus, entityMgr: mgr, skillResolver: skills, buffSystem: buffs, player, at: { x: 0, y: -12 }, denyAfter, schedule })
  const failed = vi.fn()
  const die = () => {
    player.hp = 0
    player.alive = false
    buffs.clearDeathBuffs(player)
    reviver.onPlayerDeath(failed)
  }
  const flush = () => { while (queue.length) queue.shift()!() }
  return { bus, buffs, player, die, flush, failed }
}

describe('practice revive (puppet raiser)', () => {
  it('raises at its spot: Weakness, then Brink with Unraisable, then death is final', () => {
    const { player, die, flush, failed } = puppetSetup()
    die(); flush()
    expect(player.alive).toBe(true)
    expect(player.position).toMatchObject({ x: 0, y: -12 })
    expect(player.hp).toBe(8000)
    expect(has(player, 'revive_weakness')).toBe(true)
    die(); flush()
    expect(has(player, 'revive_brink')).toBe(true)
    expect(has(player, 'revive_denied')).toBe(true)
    expect(player.maxHp).toBe(6000)
    die(); flush()
    expect(player.alive).toBe(false)
    expect(failed).toHaveBeenCalledOnce()
  })

  it('a short Unraisable covering the death window means no revive', () => {
    const { buffs, player, die, flush, failed } = puppetSetup()
    buffs.applyBuff(player, REVIVE_BUFFS.revive_denied, 'boss', 1, 5000)
    die(); flush()
    expect(player.alive).toBe(false)
    expect(failed).toHaveBeenCalledOnce()
  })

  it('a healer player in a party gets one raise, then is Unraisable', () => {
    const { player, die, flush } = puppetSetup('once')
    die(); flush()
    expect(player.alive).toBe(true)
    expect(has(player, 'revive_weakness')).toBe(true)
    expect(has(player, 'revive_denied')).toBe(true)
  })

  it('restores 25% MP, drops the target, and transcendence breaks on any action', () => {
    const { bus, player, die, flush } = puppetSetup()
    player.target = 'boss'
    die(); flush()
    expect(player.mp).toBe(2500)
    expect(player.target).toBeNull()
    expect(has(player, 'revive_transcendent')).toBe(true)
    bus.emit('skill:cast_complete', { caster: player, skill: { id: 'auto' } })
    expect(has(player, 'revive_transcendent')).toBe(false)
  })

  it('practice immunity survives a death and the revive', async () => {
    const { COMMON_BUFFS } = await import('@/jobs/commons/buffs')
    const { buffs, player, die, flush } = puppetSetup()
    buffs.applyBuff(player, COMMON_BUFFS.practice_immunity, player.id)
    die(); flush()
    expect(has(player, 'practice_immunity')).toBe(true)
  })
})

describe('party raise', () => {
  function raiseSetup() {
    const bus = new EventBus()
    const buffs = new BuffSystem(bus)
    const ally = new EntityManager(bus).create({ id: 'a', type: 'player', hp: 8000, maxHp: 8000 })
    const queue: (() => void)[] = []
    createRaiseSequence({ bus, buffSystem: buffs, schedule: (_ms, fn) => queue.push(fn) })
    const raise = () => {
      ally.alive = false
      buffs.clearDeathBuffs(ally)
      ally.customData.raising = true
      bus.emit('party:raising', { entity: ally, by: null, hpPercent: 0.5 })
      queue.shift()!()
    }
    return { bus, buffs, ally, queue, raise }
  }

  it('stays down through the hard stun, then stands with the raise HP, Weakness and transcendence', () => {
    const { bus, ally, queue } = raiseSetup()
    ally.alive = false
    ally.customData.raising = true
    const raised = vi.fn()
    bus.on('party:raised', raised)
    bus.emit('party:raising', { entity: ally, by: null, hpPercent: 0.5 })
    expect(ally.alive).toBe(false)
    expect(raised).not.toHaveBeenCalled()
    queue.shift()!()
    expect(ally.alive).toBe(true)
    expect(ally.hp).toBe(4000)
    expect(ally.customData.raising).toBeUndefined()
    expect(raised).toHaveBeenCalledOnce()
    expect(has(ally, 'revive_weakness')).toBe(true)
    expect(has(ally, 'revive_transcendent')).toBe(true)
    bus.emit('skill:cast_start', { caster: ally, skill: { id: 'gcd' } })
    expect(has(ally, 'revive_transcendent')).toBe(false)
  })

  it('dying with Weakness or Brink stands up at Brink — they survive death, unlike other buffs', () => {
    const { ally, raise } = raiseSetup()
    raise()
    raise()
    expect(has(ally, 'revive_weakness')).toBe(false)
    expect(has(ally, 'revive_brink')).toBe(true)
    expect(ally.maxHp).toBe(6000)
    expect(ally.hp).toBe(3000)
    raise()
    expect(has(ally, 'revive_brink')).toBe(true)
  })
})
