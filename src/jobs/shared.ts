import type { SkillDef, BuffDef } from '@/core/types'
import { COMMON_BUFFS } from './commons/buffs'

export interface SkillBarEntry {
  key: string
  skill: SkillDef
  automatic?: boolean
  level?: number
  description?: string
  charges?: number
  maxCharges?: number
  triggerIndex?: number
}

/** Job category — matches icon filenames in public/assets/images/class_jobs/ */
export enum JobCategory {
  Any = 'any',
  Tank = 'tank',
  Healer = 'healer',
  DPS = 'dps',
  Melee = 'melee',
  PhysRanged = 'phys_ranged',
  Caster = 'caster',
  Ranged = 'ranged',
  None = 'none',
}

/** Human-readable label for each category */
export const JOB_CATEGORY_LABELS: Record<JobCategory, string> = {
  [JobCategory.Any]: '全能职业',
  [JobCategory.Tank]: '防护职业',
  [JobCategory.Healer]: '治疗职业',
  [JobCategory.DPS]: '进攻职业',
  [JobCategory.Melee]: '物理近战',
  [JobCategory.PhysRanged]: '物理远程',
  [JobCategory.Caster]: '魔法远程',
  [JobCategory.Ranged]: '远程职业',
  [JobCategory.None]: '未定义',
}

/** Player job definition — bundles stats, skills, and buffs */
/** One element of a job's simplified gauge (FFXIV "simple" job gauge: pips and bars) */
export type JobGaugeItem =
  /** One pip per stack of `buffId` */
  | { kind: 'stacks'; label: string; buffId: string; max: number; shape: 'diamond' | 'chevron'; color: string }
  /** Progress towards the next stack of a passive buff (`passiveBuffs`); full while capped at `max` */
  | { kind: 'timer'; label: string; buffId: string; max: number; color: string }

export interface PlayerJob {
  id: string
  name: string
  /** Short flavour text shown in the job info panel */
  description?: string
  category: JobCategory
  stats: {
    hp: number
    mp: number
    attack: number
    speed: number
    autoAttackRange: number
    /** GCD duration in ms (default 2500) */
    gcdDuration?: number
    /** Disable automatic MP regeneration */
    noMpRegen?: boolean
  }
  skills: SkillDef[]
  extraSkills: Map<number, SkillDef>
  autoAttackSkill: SkillDef
  autoAttackInterval: number
  skillBar: SkillBarEntry[]
  buffs: Record<string, BuffDef>
  buffMap: Map<string, BuffDef>
  /** Simplified job gauge, top to bottom */
  gauge?: JobGaugeItem[]
  /** Full art gauge drawn from the same items; players can switch to the simplified one */
  gaugeArt?: 'whm-lily'
  /** Buffs applied when combat starts (make them `preserveOnDeath` to outlive deaths) */
  combatBuffs?: string[]
  /** Buffs that passively accumulate during combat */
  passiveBuffs?: { buffId: string; interval: number; stacks: number; requiresBuff?: string }[]
}

/** Merge job-specific buffs with shared COMMON_BUFFS */
export function mergeBuffs(jobBuffs: Record<string, BuffDef>): Record<string, BuffDef> {
  return { ...COMMON_BUFFS, ...jobBuffs }
}

export function mergeBuffMap(jobBuffs: Record<string, BuffDef>): Map<string, BuffDef> {
  return new Map(Object.entries(mergeBuffs(jobBuffs)))
}

export function buildSkillBar(skills: SkillDef[], q: SkillDef, e: SkillDef): SkillBarEntry[] {
  return [
    ...skills.map((s, i) => ({ key: `${i + 1}`, skill: s })),
    { key: 'Q', skill: q },
    { key: 'E', skill: e },
  ]
}
