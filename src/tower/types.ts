// src/tower/types.ts
//
// Phase 1: 类型定义 only. 无 runtime 逻辑.
// 参见 docs/brainstorm/2026-04-17-rougelike.md

// ============================================================
// 基础职业 & 进阶 job
// ============================================================

/** MVP 三个基础职业 ID（Phase 3 将落地为实际 PlayerJob）。 */
export type BaseJobId = 'swordsman' | 'archer' | 'thaumaturge'

/** 进阶 job 通过现有 `src/jobs/` 的 id 引用（string，不做枚举约束，便于未来扩容）。 */
export type AdvancedJobId = string

// ============================================================
// 词条 (Affix)
// ============================================================

/** spec §2.10 词条体系 */
export type AffixType =
  | 'physical-attack'
  | 'magic-attack'
  | 'defense'
  | 'skill-speed'
  | 'crit-rate'
  | 'crit-damage'
  | 'hp'

export interface Affix {
  type: AffixType
  /** 词条等级，决定数值大小；具体数值映射在 Phase 6 的 config 中解析 */
  tier: number
}

// ============================================================
// 武器 (Weapon)
// ============================================================

export interface Weapon {
  /** UUID，区分同 job 的不同武器实例 */
  instanceId: string
  /** 该武器对应的进阶 job id（spec §2.11：切换武器 = 切换到对应 job） */
  advancedJobId: AdvancedJobId
  /** 2 条固定词条（该 job 核心属性） */
  fixedAffixes: [Affix, Affix]
  /** 1 条随机词条 */
  randomAffix: Affix
}

// ============================================================
// 魔晶石 (Materia)
// ============================================================

/** 魔晶石词条元组：1-3 条（spec §2.9） */
export type MateriaAffixes =
  | readonly [Affix]
  | readonly [Affix, Affix]
  | readonly [Affix, Affix, Affix]

/** Materia 实例的 UUID 别名，与 `TowerRun.activatedMateria` 元素类型绑定 */
export type MateriaInstanceId = string

export interface Materia {
  /** UUID，区分同类魔晶石的不同实例 */
  instanceId: MateriaInstanceId
  /** 1-3 条词条（spec §2.9） */
  affixes: MateriaAffixes
}

// ============================================================
// 策略卡 (RelicCard) — spec §2.17
// ============================================================

/**
 * 策略卡效果类型（discriminated union）。
 * Phase 6 将扩充 effect 具体字段；Phase 1 只定义占位 tag.
 */
export type RelicCardEffect =
  | { kind: 'numeric'; description: string }
  | { kind: 'rule'; description: string }
  | { kind: 'negative'; description: string }

export interface RelicCard {
  /** 策略卡定义 id（指向配置池） */
  id: string
  name: string
  description: string
  effect: RelicCardEffect
}

// ============================================================
// 场地机制 (BattlefieldCondition) — spec §2.14.3 / §7.4
// ============================================================

/**
 * 场地机制：战斗级别的条件规则.
 * MVP 只实现 'echo' 一种（决心 ≤ X 时给予全属性 +Y%）。
 * Phase 5 会在战斗引擎内消费此类型.
 */
export type BattlefieldCondition =
  | {
      kind: 'echo'
      /** 触发阈值：决心 ≤ 此值时激活 */
      determinationThreshold: number
      /** 全属性加成百分比（如 0.25 = +25%） */
      allStatsBonus: number
    }

// ============================================================
// 塔图 (TowerGraph) — Phase 1 仅类型，生成逻辑在 Phase 2
// ============================================================

/** 节点类型（spec §2.2 的 6 类） */
export type TowerNodeKind =
  | 'mob'
  | 'elite'
  | 'boss'
  | 'campfire'
  | 'reward'
  | 'event'

export interface TowerNode {
  /** 全局唯一 node id（图内） */
  id: number
  /** 第几步（0 = 起点 0 号节点，1-12 = 主干，13 = boss） */
  step: number
  kind: TowerNodeKind
  /** 可达的下一层节点 id（有向图） */
  next: number[]
}

export interface TowerGraph {
  /** 起点节点 id（spec §2.2.1 第 0 节点） */
  startNodeId: number
  /** Boss 节点 id */
  bossNodeId: number
  /** 所有节点，key 为 node id（注意：TS `Record<number, T>` 在 runtime 实为字符串键，`Object.keys()` 返回 string[]） */
  nodes: Record<number, TowerNode>
}

// ============================================================
// 侦察信息 (ScoutInfo) — spec §2.4
// ============================================================

/** 对某节点侦察后缓存的信息 */
export interface ScoutInfo {
  /** 已侦察过的节点一律为 true；unscouted 节点不在 `scoutedNodes` 里 */
  scoutedAt: number
  /** 该战斗节点激活的场地机制（若非战斗节点则为 []） */
  conditions: BattlefieldCondition[]
  /** 展示给玩家的敌人简述；非战斗节点为 null */
  enemySummary: string | null
}

// ============================================================
// 塔图来源 (graph source)
// ============================================================

export type TowerGraphSource =
  | { kind: 'random' }
  | { kind: 'hand-crafted'; id: string }

// ============================================================
// TowerRun — 局内持久化状态的根对象
// ============================================================

/** 运行阶段（状态机 discriminator；spec §7.4） */
export type TowerRunPhase =
  | 'no-run'
  | 'selecting-job'
  | 'in-path'
  | 'in-combat'
  | 'ended'

export interface TowerRun {
  /** UUID，一局一个 */
  runId: string
  /** PRNG seed（spec §7.4 seeded PRNG） */
  seed: string
  /** 图来源（random 或 hand-crafted 教程塔） */
  graphSource: TowerGraphSource
  /** 开始时间 Date.now() */
  startedAt: number
  /** 玩家选择的基础职业 */
  baseJobId: BaseJobId
  /** 塔图（Phase 2 才会填充节点；Phase 1 用空 graph 占位） */
  towerGraph: TowerGraph
  /** 当前所在节点 id */
  currentNodeId: number
  /** 决心（spec §2.14） */
  determination: number
  /** MVP 固定 5 */
  maxDetermination: number
  /** 玩家等级 1–15 */
  level: number
  /** 水晶数量 */
  crystals: number
  /** 当前装备武器 */
  currentWeapon: Weapon | null
  /** 当前进阶 job id（切换武器时同步更新）；合法值来自 `src/jobs/` 定义 */
  advancedJobId: AdvancedJobId | null
  /** 背包中所有魔晶石 */
  materia: Materia[]
  /** 已激活的魔晶石 instanceId（MVP 上限 5） */
  activatedMateria: MateriaInstanceId[]
  /** 持有的策略卡 */
  relics: RelicCard[]
  /** 已侦察节点信息，key 为 node id（runtime 字符串化，同 `TowerGraph.nodes`） */
  scoutedNodes: Record<number, ScoutInfo>
  /** 已通过/完成的节点 id（包含放弃低保走完的） */
  completedNodes: number[]
}
