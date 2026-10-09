// src/game/party/npc-kits.ts
// NPC allies play a small scripted kit dressed as a real job (names, icons, effects borrowed).
// Damage effects carry relative weights; the damage director turns them into numbers.
import type { AoeZoneDef, BuffDef, SkillDef, SkillEffectDef } from '@/core/types'
import type { PlayerJob } from '@/jobs/shared'
import { JobCategory } from '@/jobs/shared'
import { icon } from '@/jobs/commons/icon-paths'
import { ROLE_BACKSTEP, ROLE_DASH } from '@/jobs/commons/role-skills'
import { WHITE_MAGE_RAISE } from '@/jobs/white-mage/skills'

export type NpcStyle = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster'

export interface NpcKit {
  style: NpcStyle
  /** Weapon range of the damage skills (m, to the hitbox edge) */
  range: number
  gcd: SkillDef
  burst: SkillDef
  /** Mean damage weight per 2.5s GCD slot (filler + burst amortised over its cooldown) */
  weightPerGcd: number
  dash: SkillDef
  backstep: SkillDef
  /** Tank: strong personal mitigation */
  mitigation?: SkillDef
  /** Healer kit */
  heal?: SkillDef
  aoeHeal?: SkillDef
  regen?: SkillDef
  partyMit?: SkillDef
  raise?: SkillDef
}

/** Raise: 4s cast; the next one is ready 8s after a cast starts */
export const NPC_RAISE_COOLDOWN_MS = 8000

export const NPC_BUFFS: Record<string, BuffDef> = {
  npc_tank_mit: {
    id: 'npc_tank_mit', name: '坚守', description: '受到的伤害降低 50%。',
    icon: icon('player_skill_effects', 13911), type: 'buff', duration: 10000,
    stackable: false, maxStacks: 1, effects: [{ type: 'mitigation', value: 0.5 }],
  },
  npc_party_mit: {
    id: 'npc_party_mit', name: '节制', description: '受到的伤害降低 10%。',
    icon: icon('player_skill_effects', 12634), type: 'buff', duration: 15000,
    stackable: false, maxStacks: 1, effects: [{ type: 'mitigation', value: 0.1 }],
  },
  npc_regen: {
    id: 'npc_regen', name: '医济', description: '体力持续恢复。',
    icon: icon('player_skill_effects', 10413), type: 'buff', duration: 15000,
    stackable: false, maxStacks: 1, effects: [{ type: 'hot', potency: 0.5, interval: 3000 }],
  },
}

interface Look {
  style: NpcStyle
  /** Job skill ids lending their name / icon / effects to the filler and the burst */
  gcd: string
  burst: string
  mitigation?: string
  heal?: string
  aoeHeal?: string
  regen?: string
  partyMit?: string
}

const LOOKS: Record<string, Look> = {
  paladin: { style: 'tank', gcd: 'pld_vanguard', burst: 'pld_holy_spirit', mitigation: 'pld_holy_sheltron' },
  warrior: { style: 'tank', gcd: 'slash', burst: 'overpower', mitigation: 'rampart' },
  dark_knight: { style: 'tank', gcd: 'drk_shadow_bolt', burst: 'drk_drain_slash', mitigation: 'drk_shadow_wall' },
  white_mage: {
    style: 'healer', gcd: 'whm_glare', burst: 'whm_afflatus_misery',
    heal: 'whm_cure_ii', aoeHeal: 'whm_afflatus_rapture', regen: 'whm_medica_ii', partyMit: 'whm_temperance',
  },
  samurai: { style: 'melee', gcd: 'sam_setsu', burst: 'sam_midare' },
  bard: { style: 'ranged', gcd: 'brd_straight_shot', burst: 'brd_pitch_perfect' },
  black_mage: { style: 'caster', gcd: 'blm_fire', burst: 'blm_flare' },
}

/** Jobs NPCs can appear as, per role */
export const NPC_JOBS = {
  tank: ['paladin', 'warrior', 'dark_knight'],
  healer: ['white_mage'],
  dps: ['samurai', 'bard', 'black_mage'],
} as const

export function npcStyleOf(jobId: string): NpcStyle {
  const look = LOOKS[jobId]
  if (!look) throw new Error(`[party] no NPC look for job '${jobId}'`)
  return look.style
}

const BURST_COOLDOWN = 30000
/** NPC GCDs splash: anything else caught takes this share (lets the NPC tank hold a pack) */
const SPLASH = 0.5

/** Melee: a short frontal fan; ranged: a small circle around the target. Untelegraphed, resolves with the hit. */
function splashZone(melee: boolean, potency: number, dmgType: 'physical' | 'magical', resolveDelay: number): AoeZoneDef {
  return {
    anchor: melee ? { type: 'caster' } : { type: 'target' },
    direction: melee ? { type: 'toward_target' } : { type: 'none' },
    shape: melee ? { type: 'fan', radius: 6, angle: 120 } : { type: 'circle', radius: 5 },
    telegraph: false, exceptTarget: true, resolveDelay, hitEffectDuration: 0,
    effects: [{ type: 'damage', potency: potency * SPLASH, dmgType }],
  }
}

function borrow(job: PlayerJob, skillId: string): Pick<SkillDef, 'name' | 'icon' | 'vfx'> {
  const s = job.skills.find(k => k.id === skillId)
  if (!s) throw new Error(`[party] ${job.id} has no skill '${skillId}'`)
  return { name: s.name, icon: s.icon, vfx: s.vfx }
}

function skill(id: string, look: Pick<SkillDef, 'name' | 'icon' | 'vfx'>, def: Partial<SkillDef> & { effects: SkillEffectDef[] }): SkillDef {
  return {
    id, ...look, type: 'ability', castTime: 0, cooldown: 0, gcd: false,
    targetType: 'single', requiresTarget: false, range: 0, mpCost: 0, ...def,
  }
}

export function buildNpcKit(job: PlayerJob): NpcKit {
  const look = LOOKS[job.id]
  if (!look) throw new Error(`[party] no NPC look for job '${job.id}'`)
  const id = (part: string) => `npc_${job.id}_${part}`
  const melee = look.style === 'tank' || look.style === 'melee'
  const range = melee ? 3 : 24
  const dmgType = job.category === JobCategory.Caster || look.style === 'healer' ? 'magical' : 'physical'
  const gcdCast = look.style === 'caster' ? 2000 : look.style === 'healer' ? 1500 : 0
  const burstWeight = look.style === 'tank' || look.style === 'healer' ? 3 : 4

  const gcdLook = borrow(job, look.gcd)
  // The splash zone would otherwise make the renderer treat the GCD as a ground burst
  gcdLook.vfx = { delivery: melee ? 'melee' : 'projectile', ...gcdLook.vfx }
  const kit: NpcKit = {
    style: look.style,
    range,
    gcd: skill(id('gcd'), gcdLook, {
      type: gcdCast > 0 ? 'spell' : 'weaponskill', castTime: gcdCast, gcd: true,
      requiresTarget: true, range, targetType: 'aoe',
      effects: [{ type: 'damage', potency: 1, dmgType }],
      zones: [splashZone(melee, 1, dmgType, gcdCast)],
    }),
    burst: skill(id('burst'), borrow(job, look.burst), {
      cooldown: BURST_COOLDOWN, requiresTarget: true, range,
      effects: [{ type: 'damage', potency: burstWeight, dmgType }],
    }),
    weightPerGcd: 1 + burstWeight * 2500 / BURST_COOLDOWN,
    dash: { ...ROLE_DASH, id: id('dash'), cooldown: 20000, range: 20 },
    backstep: { ...ROLE_BACKSTEP, id: id('backstep'), cooldown: 20000 },
  }
  if (look.mitigation) {
    kit.mitigation = skill(id('mit'), borrow(job, look.mitigation), {
      cooldown: 40000, effects: [{ type: 'apply_buff', buffId: 'npc_tank_mit', target: 'caster' }],
    })
  }
  if (look.style === 'healer') {
    const cast = (castTime: number) => ({ type: 'spell' as const, castTime, gcd: true })
    kit.heal = skill(id('heal'), borrow(job, look.heal!), {
      ...cast(1500), allyTarget: 'lowest-hp', range: 30, effects: [{ type: 'heal', potency: 4 }],
    })
    // Instant (Afflatus Rapture): the one heal that goes out while moving
    kit.aoeHeal = skill(id('aoe_heal'), borrow(job, look.aoeHeal!), {
      type: 'spell', castTime: 0, gcd: true, effects: [{ type: 'party_heal', potency: 2.5, radius: 20 }],
    })
    kit.regen = skill(id('regen'), borrow(job, look.regen!), {
      ...cast(2000), effects: [{ type: 'party_heal', potency: 1.5, radius: 20 }, { type: 'party_buff', buffId: 'npc_regen', radius: 20 }],
    })
    kit.partyMit = skill(id('party_mit'), borrow(job, look.partyMit!), {
      cooldown: 60000, effects: [{ type: 'party_buff', buffId: 'npc_party_mit', radius: 30 }],
    })
    kit.raise = {
      ...WHITE_MAGE_RAISE, id: id('raise'), mpCost: 0,
      castTimeWithBuff: undefined, mpCostAbsorbBuff: undefined, castTime: 4000,
    }
  }
  return kit
}
