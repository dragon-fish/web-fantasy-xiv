import type { SkillDef, BuffDef } from '@/core/types'
import type { SkillBarEntry } from '@/ui/state'
import {
  MELEE_AUTO, PHYS_RANGED_AUTO, CASTER_AUTO,
  ROLE_DASH, ROLE_DASH_FORWARD, ROLE_BACKSTEP, ROLE_SECOND_WIND,
} from './role-skills'
import { DEMO_SKILLS } from './demo-skills'
import { SAMURAI_SKILLS, SAMURAI_BUFFS } from './swordsman-skills'
import { BLM_SKILLS, BLM_LEYLINE_STEP, BLM_BUFFS } from './blm-skills'
import { BRD_SKILLS, BRD_BUFFS } from './bard-skills'
import { DRK_SKILLS, DRK_BUFFS } from './drk-skills'
import { DEMO_BUFFS } from './demo-buffs'

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
  /** Buffs that passively accumulate during combat */
  passiveBuffs?: { buffId: string; interval: number; stacks: number; requiresBuff?: string }[]
}

/** Merge job-specific buffs with shared DEMO_BUFFS */
function mergeBuffs(jobBuffs: Record<string, BuffDef>): Record<string, BuffDef> {
  return { ...DEMO_BUFFS, ...jobBuffs }
}

function mergeBuffMap(jobBuffs: Record<string, BuffDef>): Map<string, BuffDef> {
  return new Map(Object.entries(mergeBuffs(jobBuffs)))
}

// ─── Helper ──────────────────────────────────────────────

function buildSkillBar(skills: SkillDef[], q: SkillDef, e: SkillDef): SkillBarEntry[] {
  return [
    ...skills.map((s, i) => ({ key: `${i + 1}`, skill: s })),
    { key: 'Q', skill: q },
    { key: 'E', skill: e },
  ]
}

// ─── Jobs ────────────────────────────────────────────────

export const DEFAULT_JOB: PlayerJob = {
  id: 'default',
  name: '冒险者',
  description: '兼具近战、远程、治疗与增减益能力的全能型测试职业。',
  category: JobCategory.None,
  stats: {
    hp: 10000,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: DEMO_SKILLS,
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar(DEMO_SKILLS, ROLE_DASH, ROLE_BACKSTEP),
  buffs: DEMO_BUFFS,
  buffMap: mergeBuffMap({}),
}

export const SAMURAI_JOB: PlayerJob = {
  id: 'samurai',
  name: '武士',
  description: '暴力型近战职业。以雪、月、花三连斩集齐闪光后，释放纷乱雪月花造成毁灭性伤害。',
  category: JobCategory.Melee,
  stats: {
    hp: 11000,
    mp: 8000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
    gcdDuration: 2350,
  },
  skills: [...SAMURAI_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 2800,
  skillBar: buildSkillBar([...SAMURAI_SKILLS, ROLE_SECOND_WIND], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(SAMURAI_BUFFS),
  buffMap: mergeBuffMap(SAMURAI_BUFFS),
}

export const BLM_JOB: PlayerJob = {
  id: 'blm',
  name: '黑魔法师',
  description: '以超长咏唱换取毁灭性伤害的远程魔法职业。灵极火提升攻击力，灵极冰恢复魔力，冰火交替是输出的核心。',
  category: JobCategory.Caster,
  stats: {
    hp: 8000,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
    noMpRegen: true,
  },
  skills: BLM_SKILLS,
  extraSkills: new Map([[100, ROLE_DASH], [101, BLM_LEYLINE_STEP]]),
  autoAttackSkill: CASTER_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar(BLM_SKILLS, ROLE_DASH, BLM_LEYLINE_STEP),
  buffs: mergeBuffs(BLM_BUFFS),
  buffMap: mergeBuffMap(BLM_BUFFS),
  passiveBuffs: [
    { buffId: 'blm_enochian', interval: 500, stacks: 1 },
  ],
}

export const BRD_JOB: PlayerJob = {
  id: 'brd',
  name: '吟游诗人',
  description: '远程物理职业。通过切换三首战歌强化自身，在放浪神的小步舞曲期间积攒诗心，释放完美音调造成高额伤害。',
  category: JobCategory.PhysRanged,
  stats: {
    hp: 9500,
    mp: 10000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 10,
    gcdDuration: 2300,
  },
  skills: [...BRD_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH_FORWARD], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: PHYS_RANGED_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...BRD_SKILLS, ROLE_SECOND_WIND], ROLE_DASH_FORWARD, ROLE_BACKSTEP),
  buffs: mergeBuffs(BRD_BUFFS),
  buffMap: mergeBuffMap(BRD_BUFFS),
  passiveBuffs: [
    { buffId: 'brd_pitch', interval: 1000, stacks: 1, requiresBuff: 'brd_minuet' },
  ],
}

export const DRK_JOB: PlayerJob = {
  id: 'drk',
  name: '暗黑骑士',
  description: '以生命为代价换取强大攻击力的坦克职业。噬魂斩消耗HP造成高额伤害，吸收波远程回复生命，嗜血和暗影墙提供攻防转换窗口，行尸走肉是最后的保命手段。',
  category: JobCategory.Tank,
  stats: {
    hp: 12000,
    mp: 8000,
    attack: 1000,
    speed: 5,
    autoAttackRange: 3.5,
  },
  skills: [...DRK_SKILLS, ROLE_SECOND_WIND],
  extraSkills: new Map([[100, ROLE_DASH], [101, ROLE_BACKSTEP]]),
  autoAttackSkill: MELEE_AUTO,
  autoAttackInterval: 3000,
  skillBar: buildSkillBar([...DRK_SKILLS, ROLE_SECOND_WIND], ROLE_DASH, ROLE_BACKSTEP),
  buffs: mergeBuffs(DRK_BUFFS),
  buffMap: mergeBuffMap(DRK_BUFFS),
}

/** All available jobs */
export const JOBS: PlayerJob[] = [DEFAULT_JOB, SAMURAI_JOB, BLM_JOB, BRD_JOB, DRK_JOB]

export function getJob(id: string): PlayerJob {
  return JOBS.find(j => j.id === id) ?? DEFAULT_JOB
}
