// src/game/party/party-runtime.ts
// Party mode: spawns the three NPC allies and runs them, their enmity, spots and damage budget.
import type { Role, SkillDef, Vec2 } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { GameScene } from '../game-scene'
import type { EncounterData } from '../encounter-loader'
import type { NpcSpotHint, TimelineAction } from '@/config/schema'
import { followsAnchor, type ActiveAoeZone } from '@/skill/aoe-zone'
import type { DeathZoneManager } from '@/arena/death-zone-manager'
import type { PlayerJob } from '@/jobs/shared'
import { getPlayableJob } from '@/jobs'
import { EnmitySystem } from '@/combat/enmity'
import { isPartyMember, selectPartyTargets } from '@/combat/party'
import { DamageDirector, defaultTargetTime } from './damage-director'
import { NpcBrain } from './npc-brain'
import { buildNpcKit, NPC_BUFFS, NPC_JOBS, npcStyleOf, type NpcKit } from './npc-kits'
import { SpotCoordinator } from './npc-spots'
import type { PartyConfig } from './party-config'

const GCD_MS = 2500
const DAMAGE_JITTER = 0.1
const SPOT_REACTION_MS: [number, number] = [300, 900]
const NPC_START_OFFSETS: Vec2[] = [{ x: -2.5, y: -1.5 }, { x: 2.5, y: -1.5 }, { x: 0, y: -3.5 }]

export interface PartyRuntimeDeps {
  scene: GameScene
  enc: EncounterData
  config: PartyConfig
  playerJob: PlayerJob
  playerRole: Role
  boss: Entity
  bossChaseRange: number
  deathZones: DeathZoneManager
  combatElapsed: () => number
  inCombat: () => boolean
  rng?: () => number
}

export interface PartyRuntime {
  npcs: Entity[]
  enmity: EnmitySystem
  director: DamageDirector
  /** Whom an enemy attacks: its enmity top */
  targetFor(enemy: Entity): Entity | null
  engage(enemy: Entity): void
  update(dt: number): void
  allDown(): boolean
  status(): string
}

/** NPC jobs for the roles the player leaves open: 1 tank, 1 healer, 2 DPS in total */
export function pickRoster(playerJob: PlayerJob, playerRole: Role, rng: () => number): PlayerJob[] {
  const roles: Role[] = ['tank', 'healer', 'dps', 'dps']
  roles.splice(roles.indexOf(playerRole), 1)
  const taken = new Set([playerJob.id])
  const pick = (pool: readonly string[], prefer?: (id: string) => boolean) => {
    const free = pool.filter(id => !taken.has(id))
    const preferred = prefer ? free.filter(prefer) : free
    const from = preferred.length > 0 ? preferred : free.length > 0 ? free : [...pool]
    const id = from[Math.floor(rng() * from.length)]!
    taken.add(id)
    return getPlayableJob(id)
  }
  const out: PlayerJob[] = []
  for (const role of roles) {
    if (role !== 'dps') { out.push(pick(NPC_JOBS[role])); continue }
    // Prefer one melee and one ranged DPS
    const hasMelee = [...taken].some(id => (NPC_JOBS.dps as readonly string[]).includes(id) && npcStyleOf(id) === 'melee')
    out.push(pick(NPC_JOBS.dps, id => (npcStyleOf(id) === 'melee') !== hasMelee))
  }
  return out
}

export function createPartyRuntime(deps: PartyRuntimeDeps): PartyRuntime {
  const { scene: s, enc, config, boss } = deps
  const rng = deps.rng ?? Math.random
  const now = () => s.gameLoop.logicTime

  const enmity = new EnmitySystem(s.bus, s.entityMgr)
  const director = new DamageDirector(deps.playerRole, config.targetTime ?? defaultTargetTime(boss.maxHp))
  const spots = new SpotCoordinator(rng, config.mistakeRate)
  let spotsSince = -Infinity
  const spotReaction = new Map<string, number>()

  s.combatResolver.registerBuffs(NPC_BUFFS)
  s.buffDefs = { ...s.buffDefs, ...NPC_BUFFS }

  // --- Roster ---
  const roster = pickRoster(deps.playerJob, deps.playerRole, rng)
  const kits = new Map<string, NpcKit>()
  /** Where each NPC started: a fallen-off NPC's body is sent back there */
  const starts = new Map<string, Vec2>()
  const npcs: Entity[] = roster.map((job, i) => {
    const role: Role = job.category === 'tank' ? 'tank' : job.category === 'healer' ? 'healer' : 'dps'
    const off = NPC_START_OFFSETS[i]!
    const e = s.entityMgr.create({
      id: `npc_${i + 1}`, type: 'player', npc: true, role,
      position: { x: s.player.position.x + off.x, y: s.player.position.y + off.y, z: 0 },
      facing: s.player.facing,
      model: `job:${job.id}`,
      hp: job.stats.hp, maxHp: job.stats.hp, mp: 0, maxMp: 0,
      attack: job.stats.attack, speed: job.stats.speed, size: 0.5,
    })
    e.customData.displayName = job.name
    e.customData.jobId = job.id
    e.customData.jobCategory = job.category
    e.customData.npcStyle = npcStyleOf(job.id)
    kits.set(e.id, buildNpcKit(job))
    starts.set(e.id, { x: e.position.x, y: e.position.y })
    return e
  })
  const npcRoles = npcs.map(n => n.role!)

  // --- Damage: scripted per hit from the team budget ---
  s.combatResolver.setNpcDamageAttack((caster) => {
    const kit = kits.get(caster.id)
    if (!kit) return null
    const share = director.shareOf(caster.role!, npcRoles)
    return share * (GCD_MS / 1000) / kit.weightPerGcd * (1 + (rng() * 2 - 1) * DAMAGE_JITTER)
  })

  s.bus.on('damage:dealt', (p: { source?: Entity; target: Entity; amount: number }) => {
    if (p.source?.id === s.player.id && p.amount > 0 && p.target.team !== s.player.team && deps.inCombat()) {
      director.recordPlayerDamage(deps.combatElapsed(), p.amount)
    }
    // NPC allies fall like the player: stay on the field, wait for a raise
    if (p.target.npc && p.target.hp <= 0 && p.target.alive) down(p.target)
  })

  function down(npc: Entity): void {
    npc.alive = false
    npc.allyTarget = null
    if (npc.casting) s.skillResolver.interruptCast(npc)
    s.bus.emit('entity:died', { entity: npc })
  }

  // --- Party markers ---
  s.skillResolver.setPartyMarkerPicker((caster, anchor) =>
    selectPartyTargets(anchor, s.entityMgr.getAlive().filter(isPartyMember), enmity.ranking(caster), rng))

  // --- Spot hints from the timeline ---
  function activateSpots(hint: NpcSpotHint, caster: Entity, hold: number): void {
    const origin = { x: caster.position.x, y: caster.position.y, facing: caster.facing }
    spots.activate(hint, npcs.filter(n => n.alive).map(n => ({ id: n.id, position: { x: n.position.x, y: n.position.y } })), now(), hold, origin)
    spotsSince = now()
    spotReaction.clear()
    for (const n of npcs) spotReaction.set(n.id, SPOT_REACTION_MS[0] + rng() * (SPOT_REACTION_MS[1] - SPOT_REACTION_MS[0]))
  }

  s.bus.on('timeline:action', (action: TimelineAction) => {
    if (!action.npc || action.fastForward) return
    const skill: SkillDef | undefined = action.use ? enc.skills.get(action.use) : undefined
    const resolveAt = skill?.zones?.length ? Math.max(...skill.zones.map(z => z.resolveDelay)) : (skill?.castTime ?? 0)
    const hold = action.npc.hold ?? (skill ? resolveAt + 300 : 5000)
    activateSpots(action.npc, (action.entity ? s.entityMgr.get(action.entity) : undefined) ?? boss, hold)
  })

  /**
   * Markers riding on two or more members with no timeline hint: spread them on a ring round the
   * caster, spaced so no two circles overlap (the spot behind the caster is left for the player).
   * Circles locked where people stood are not markers to carry: they are simply walked out of.
   */
  const autoSpread = new Set<string>()
  function spreadUnhinted(): void {
    if (spots.hasHint()) return
    const groups = new Map<string, ActiveAoeZone[]>()
    for (const z of s.zoneMgr.getActiveZones()) {
      if (z.resolved || z.def.share || z.def.targeted || !followsAnchor(z.def.anchor) || z.def.anchor.type !== 'party' || !z.anchorEntityId || !z.casterId) continue
      const key = `${z.casterId}:${z.skillId}`
      groups.set(key, [...(groups.get(key) ?? []), z])
    }
    for (const [key, zones] of groups) {
      const marked = new Set(zones.map(z => z.anchorEntityId))
      const groupKey = `${key}:${zones[0]!.id}`
      if (marked.size < 2 || autoSpread.has(groupKey)) continue
      autoSpread.add(groupKey)
      const caster = s.entityMgr.get(zones[0]!.casterId!)
      if (!caster) continue
      const shape = zones[0]!.def.shape
      const radius = shape.type === 'circle' ? shape.radius : 4
      const n = Math.max(2, s.entityMgr.getAlive().filter(isPartyMember).length)
      const ring = Math.max(caster.size + 3, (radius + 1) / (2 * Math.sin(Math.PI / n)))
      // Boss frame: +y ahead of the caster; the first spot sits right behind it (the player's)
      const spotsRing = Array.from({ length: n }, (_, i) => {
        const a = Math.PI + (i * 2 * Math.PI) / n
        return { x: Math.sin(a) * ring, y: Math.cos(a) * ring }
      })
      const hold = Math.max(...zones.map(z => z.def.resolveDelay - z.elapsed)) + 300
      activateSpots({ frame: 'boss', spots: spotsRing, tolerance: 1 }, caster, hold)
    }
  }

  // --- Brains ---
  const world = {
    now,
    entities: s.entityMgr,
    skills: s.skillResolver,
    buffs: s.buffSystem,
    zones: s.zoneMgr,
    enmity,
    arena: s.arena,
    displacer: s.displacer,
    ground: { standable: (p: Vec2) => s.arena.isInBounds(p) && !deps.deathZones.isInAnyZone(p) },
    landable: (p: Vec2) => {
      // A wall stops the push at the edge; a lethal edge lets it carry on off the platform
      const at = s.arena.def.boundary === 'lethal' ? p : s.arena.clampPosition(p)
      return s.arena.isInBounds(at) && !deps.deathZones.isInAnyZone(at)
    },
    config,
    player: s.player,
    boss,
    bossChaseRange: deps.bossChaseRange,
    priority: (e: Entity) => enc.targetPriority.get(e.id) ?? e.customData.priority ?? 0,
    spotFor: (npc: Entity) => (now() - spotsSince >= (spotReaction.get(npc.id) ?? 0) ? spots.pointFor(npc.id) : null),
    slot: (npc: Entity) => npcs.indexOf(npc),
    rng,
  }
  const brains = npcs.map(n => new NpcBrain(n, kits.get(n.id)!, world))
  if (import.meta.env.DEV) (globalThis as any).__party = { brains, director, enmity, spots }

  /** Before the pull NPCs trail the player */
  function followPlayer(npc: Entity, i: number, dt: number): void {
    const off = NPC_START_OFFSETS[i]!
    const goal = { x: s.player.position.x + off.x, y: s.player.position.y + off.y }
    const dx = goal.x - npc.position.x
    const dy = goal.y - npc.position.y
    const d = Math.hypot(dx, dy)
    if (d < 1) return
    const step = Math.min(d, npc.speed * (dt / 1000))
    npc.position.x += (dx / d) * step
    npc.position.y += (dy / d) * step
    npc.facing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  }

  return {
    npcs,
    enmity,
    director,
    targetFor: enemy => enmity.top(enemy),
    engage(enemy) {
      enmity.engage(enemy)
      for (const n of npcs) if (n.alive) n.inCombat = true
    },
    update(dt) {
      if (!deps.inCombat()) {
        npcs.forEach((n, i) => followPlayer(n, i, dt))
        return
      }
      director.update(dt, deps.combatElapsed(), boss.hp)
      spots.update(now(), s.player.alive ? { x: s.player.position.x, y: s.player.position.y } : null)
      spreadUnhinted()
      for (const b of brains) b.update(dt)
      for (const n of npcs) {
        if (!n.alive) continue
        const at = { x: n.position.x, y: n.position.y }
        const fell = s.arena.def.boundary === 'lethal' && !s.arena.isInBounds(at)
        if (!fell && !deps.deathZones.isLethalAt(at)) continue
        n.hp = 0
        s.bus.emit('damage:dealt', { source: { id: '场地' } as Entity, target: n, amount: 999999, skill: { name: fell ? '场外坠落' : '死亡区域' } })
        if (fell) {
          s.displacer.cancel(n.id)
          const start = starts.get(n.id)!
          n.position.x = start.x
          n.position.y = start.y
        }
      }
    },
    allDown: () => s.entityMgr.getAll().every(e => !isPartyMember(e) || !e.alive),
    status() {
      const d = director.snapshot()
      const r = (v: number) => Math.round(v)
      return [
        `NPC budget ${r(d.budget)} DPS (baseline ${r(d.baseline)}, floor ${r(d.baseline * 0.5)}, ceiling ${r(d.baseline * 1.25)})`,
        `required ${r(d.required)} DPS, player ${r(d.playerDps)} DPS (30s)`,
        ...npcs.map(n => `${n.id} ${n.customData.displayName} ${n.role} hp=${n.hp}/${n.maxHp} ${n.alive ? '' : 'DOWN'}`),
      ].join('\n')
    },
  }
}
