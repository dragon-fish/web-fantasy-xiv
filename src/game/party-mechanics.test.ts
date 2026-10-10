import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { BuffSystem } from '@/combat/buff'
import { Arena } from '@/arena/arena'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { SkillResolver } from '@/skill/skill-resolver'
import { selectPartyTargets, isPartyMember } from '@/combat/party'
import { CombatResolver } from './combat-resolver'
import type { AoeZoneDef, SkillDef } from '@/core/types'
import type { Entity } from '@/entity/entity'

function setup() {
  const bus = new EventBus()
  const mgr = new EntityManager(bus)
  const buffs = new BuffSystem(bus)
  const zones = new AoeZoneManager(bus, mgr)
  const skills = new SkillResolver(bus, mgr, buffs, zones)
  const combat = new CombatResolver(bus, mgr, buffs, new Arena({ name: 't', shape: { type: 'circle', radius: 60 }, boundary: 'wall' }), zones)
  // Titan's gaol as YAML builds it: a status from the gaol, a puppet that locks its target in on spawn
  combat.registerBuffs({ imprisoned: {
    id: 'imprisoned', name: '石牢', type: 'debuff', duration: Infinity, stackable: false, maxStacks: 1,
    preserveOnDeath: true, effects: [{ type: 'stun' }, { type: 'hidden' }, { type: 'untargetable' }],
  } })
  const onSpawn: SkillDef[] = [{
    id: 'lock', name: 'lock', type: 'ability', castTime: 0, cooldown: 0, gcd: false, targetType: 'single',
    requiresTarget: true, range: 0, effects: [{ type: 'apply_buff', buffId: 'imprisoned', target: 'target' }],
  }]
  let spawned = 0
  combat.setSpawner((id, at) => {
    const g = mgr.create({ id: `${id}_${++spawned}`, type: 'mob', hp: 5000, attack: 1, position: { x: at.position.x, y: at.position.y, z: 0 } })
    g.target = at.id
    for (const s of onSpawn) skills.tryUse(g, s)
    return g
  })
  // As the battle runner does: a mob at 0 HP leaves the field
  bus.on('damage:dealt', (p: { target: Entity }) => { if (p.target.type === 'mob' && p.target.hp <= 0 && p.target.alive) mgr.destroy(p.target.id) })
  skills.setPartyMarkerPicker((_caster, anchor) =>
    selectPartyTargets(anchor, mgr.getAlive().filter(isPartyMember), []))
  const boss = mgr.create({ id: 'boss', type: 'boss', hp: 100000, attack: 100, position: { x: 0, y: 10, z: 0 } })
  const member = (id: string, x: number, y: number) =>
    mgr.create({ id, type: 'player', npc: id !== 'player', hp: 100000, position: { x, y, z: 0 } })
  const cast = (zone: Partial<AoeZoneDef>) => {
    const skill: SkillDef = {
      id: 'mech', name: 'mech', type: 'ability', castTime: 0, cooldown: 0, gcd: false,
      targetType: 'aoe', requiresTarget: false, range: 0,
      zones: [{
        anchor: { type: 'caster' }, direction: { type: 'none' }, shape: { type: 'circle', radius: 3 },
        resolveDelay: 1000, hitEffectDuration: 0, effects: [{ type: 'damage', potency: 100, dmgType: 'special' }],
        ...zone,
      } as AoeZoneDef],
    }
    skills.tryUse(boss, skill)
  }
  return { mgr, zones, boss, member, cast, skills, buffs, onSpawn }
}

describe('party mechanics', () => {
  it('a spread marker drops one zone on each member, following them until it resolves', () => {
    const { zones, member, cast } = setup()
    const a = member('player', -10, 0)
    const b = member('npc1', 10, 0)
    cast({ anchor: { type: 'party', select: 'each' } })
    expect(zones.getActiveZones().map(z => z.anchorEntityId).sort()).toEqual(['npc1', 'player'])
    a.position.x = -15
    zones.update(500)
    expect(zones.getActiveZones().find(z => z.anchorEntityId === 'player')!.center.x).toBe(-15)
    zones.update(500)
    expect(a.hp).toBe(90000)
    expect(b.hp).toBe(90000)
  })

  it('a stack splits its damage evenly among everyone inside', () => {
    const { member, cast, zones } = setup()
    const members = [member('player', 0, 0), member('npc1', 1, 0), member('npc2', 0, 1), member('npc3', 20, 0)]
    cast({ anchor: { type: 'position', x: 0, y: 0 } as any, share: 'even' })
    zones.update(1000)
    expect(members.map(m => 100000 - m.hp)).toEqual([3333, 3333, 3333, 0])
  })

  it('a line stack puts its front share on whoever stands nearest the origin', () => {
    const { member, cast, zones } = setup()
    const front = member('player', 0, 7)
    const back1 = member('npc1', 0, 4)
    const back2 = member('npc2', 0.5, 3)
    cast({
      anchor: { type: 'caster' }, direction: { type: 'fixed', angle: 180 },
      shape: { type: 'rect', length: 20, width: 4 }, share: { front: 0.5 },
    })
    zones.update(1000)
    expect([front, back1, back2].map(m => 100000 - m.hp)).toEqual([5000, 2500, 2500])
  })

  it("a splash zone hits everything around the caster's target except the target itself", () => {
    const { mgr, zones } = setup()
    const npc = mgr.create({ id: 'npc', type: 'player', npc: true, hp: 1000, attack: 100, position: { x: 0, y: -2, z: 0 } })
    const main = mgr.create({ id: 'main', type: 'mob', hp: 100000, position: { x: 0, y: 0, z: 0 } })
    const near = mgr.create({ id: 'near', type: 'mob', hp: 100000, position: { x: 2, y: 0, z: 0 } })
    npc.target = 'main'
    zones.spawn({
      anchor: { type: 'target' }, direction: { type: 'none' }, shape: { type: 'circle', radius: 5 },
      telegraph: false, exceptTarget: true, resolveDelay: 0, hitEffectDuration: 0,
      effects: [{ type: 'damage', potency: 100, dmgType: 'special' }],
    }, 'splash', { x: 0, y: -2 }, 0, { x: 0, y: 0 }, 'npc', 'main')
    zones.update(16)
    expect(main.hp).toBe(100000)
    expect(near.hp).toBe(90000)
  })
  it('a line stack keeps turning to the member it targets until it resolves', () => {
    const { zones, boss, member, cast } = setup()
    const marked = member('player', 0, 0) // due south of the boss at (0, 10)
    boss.target = 'player'
    cast({ anchor: { type: 'caster' }, direction: { type: 'toward_target' }, shape: { type: 'rect', length: 30, width: 4 }, share: 'even' })
    const zone = zones.getActiveZones()[0]!
    expect(Math.round(zone.facing)).toBe(180)
    marked.position.x = 10
    marked.position.y = 10 // now due east
    zones.update(100)
    expect(Math.round(zone.facing)).toBe(90)
  })
  it('a gaol spawned on the marked member locks them in (hidden, untargetable, stunned) until it dies', () => {
    const { mgr, zones, boss, member, cast, buffs } = setup()
    const prisoner = member('npc1', 5, 0)
    cast({ anchor: { type: 'party', select: 'count', count: 1 }, targeted: true, effects: [{ type: 'spawn', entity: 'gaol' }] })
    zones.update(1000)
    expect(prisoner.visible).toBe(false)
    expect(prisoner.targetable).toBe(false)
    expect(buffs.isStunned(prisoner)).toBe(true)
    const gaol = mgr.getAll().find(e => e.id.startsWith('gaol'))!
    expect(gaol.position.x).toBe(5)
    // jailed: out of reach of the next marker
    cast({ anchor: { type: 'party', select: 'each' } })
    expect(zones.getActiveZones().filter(z => !z.resolved).map(z => z.anchorEntityId)).not.toContain('npc1')
    gaol.hp = 0
    mgr['bus'].emit('damage:dealt', { source: boss, target: gaol, amount: 5000 })
    expect(prisoner.visible).toBe(true)
    expect(prisoner.targetable).toBe(true)
    expect(buffs.isStunned(prisoner)).toBe(false)
  })
  it('a gaol casting at its prisoner: the prisoner dies, the party is hit, the gaol self-destructs', () => {
    const { mgr, zones, member, cast, skills, onSpawn } = setup()
    onSpawn.push({
      id: 'burst', name: 'burst', type: 'spell', castTime: 4000, cooldown: 0, gcd: false,
      targetType: 'aoe', requiresTarget: false, range: 0,
      effects: [{ type: 'damage', potency: 999999, dmgType: 'special' }, { type: 'self_destruct' }],
      zones: [{ anchor: { type: 'caster' }, direction: { type: 'none' }, shape: { type: 'circle', radius: 60 },
        telegraph: false, resolveDelay: 4000, hitEffectDuration: 0, effects: [{ type: 'damage', potency: 30 }] }],
    })
    const prisoner = member('npc1', 5, 0)
    const other = member('npc2', -5, 0)
    cast({ anchor: { type: 'party', select: 'count', count: 1 }, targeted: true, effects: [{ type: 'spawn', entity: 'gaol' }] })
    const targetId = zones.getActiveZones()[0]!.targetId
    zones.update(1000)
    const [jailed, free] = targetId === 'npc1' ? [prisoner, other] : [other, prisoner]
    skills.updateAll(4000)
    zones.update(4000)
    expect(jailed.hp).toBe(0)
    expect(jailed.visible).toBe(true)
    expect(free.hp).toBe(100000 - 30)
    expect(mgr.getAll().some(e => e.id.startsWith('gaol'))).toBe(false)
  })
  it('targeted: the mark lands on the marked member only, not someone standing on them', () => {
    const { mgr, zones, member, cast } = setup()
    const marked = member('npc1', 5, 0)
    const bystander = member('npc2', 5, 0)
    cast({ anchor: { type: 'party', select: 'count', count: 1, exclude: 'healer' }, targeted: true, effects: [{ type: 'spawn', entity: 'gaol' }] })
    const targetId = zones.getActiveZones()[0]!.targetId
    zones.update(1000)
    expect([marked, bystander].filter(m => !m.targetable).map(m => m.id)).toEqual([targetId])
    expect(mgr.getAll().filter(e => e.id.startsWith('gaol'))).toHaveLength(1)
  })
  it('statuses end with the enemy that applied them; a downed member (not dead) keeps theirs', () => {
    const { mgr, boss, member, buffs } = setup()
    const npc = member('npc1', 5, 0)
    const mark = { id: 'mark', name: 'mark', type: 'debuff' as const, duration: Infinity, stackable: false, maxStacks: 1, effects: [] }
    const dot = { ...mark, id: 'dot', effects: [{ type: 'dot' as const, potency: 10, interval: 3000 }] }
    buffs.applyBuff(npc, mark, boss.id)
    buffs.applyBuff(boss, dot, npc.id)
    npc.alive = false
    mgr['bus'].emit('entity:died', { entity: npc })
    expect(buffs.hasBuff(boss, 'dot')).toBe(true)
    mgr.destroy(boss.id)
    expect(buffs.hasBuff(npc, 'mark')).toBe(false)
  })
  it('origin: caster — the zone starts at the caster, aimed at the member when it spawned', () => {
    const { zones, member, cast } = setup()
    const aimed = member('npc1', 10, 10) // due east of the boss at (0, 10)
    cast({ anchor: { type: 'party', select: 'each', origin: 'caster' }, shape: { type: 'fan', radius: 30, angle: 30 } })
    const zone = zones.getActiveZones()[0]!
    expect(zone.center).toEqual({ x: 0, y: 10 })
    expect(Math.round(zone.facing)).toBe(90)
    aimed.position.y = 0
    zones.update(500)
    expect(Math.round(zone.facing)).toBe(90)
  })
})
