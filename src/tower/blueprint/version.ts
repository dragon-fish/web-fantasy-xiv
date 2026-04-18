/**
 * 当前塔蓝图版本。加节点 kind / 改图生成算法 / 改 K_SCHEDULE 时 bump。
 * 老存档 blueprintVersion < 此值仍可加载（除非低于 MIN_SUPPORTED）。
 *
 * 详见 docs/tower-engineering-principles.md §1 三层版本体系。
 */
export const TOWER_BLUEPRINT_CURRENT = 1 as const

/**
 * 最低支持的塔蓝图版本。老存档 blueprintVersion < 此值 → 强制作废。
 * 只在 "必须掀桌" 时 bump，与 changelog / 公告联动。
 */
export const TOWER_BLUEPRINT_MIN_SUPPORTED = 1 as const
