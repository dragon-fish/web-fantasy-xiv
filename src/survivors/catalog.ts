import type { BuffDef, SkillDef } from '@/core/types'
import { icon } from '@/jobs/commons/icon-paths'

export type WeaponId = 'fire' | 'orbit' | 'ice' | 'thunder' | 'slash' | 'holy'
export interface Card {
  id: string
  name: string
  icon: string
  color: string
  description: string
  max: number
  weapon?: WeaponId
  evolution?: string
  evolvedIcon?: string
  buff?: BuffDef
}
const weapon = (id: WeaponId, name: string, folder: string, image: number, color: string, description: string, evolution: string): Card =>
  ({ id, weapon: id, name, icon: icon(folder, image), color, description, evolution, max: 5 })
const perk = (id: string, name: string, description: string, max: number, effects: BuffDef['effects'] = [], image = 15021): Card => ({
  id, name, description, max, icon: icon('effects', image), color: '#d7bc79',
  buff: { id: `sv_${id}`, name, description, icon: icon('effects', image), type: 'buff', duration: 0, stackable: true, maxStacks: max, effects },
})
export const CARDS: Card[] = [
  weapon('fire', '火炎', 'skill_icons/25_BLM', 451, '#ff884e', '沿最近敌人方向发射穿透火球。每级增加威力与穿透，三级增加弹道。', '核爆：每次命中额外产生范围爆炸。'),
  weapon('orbit', '幻影剑阵', 'skill_icons/19_PLD', 158, '#77e4d9', '幻影剑环绕自身，擦过敌人造成伤害。每级增加剑数与威力。', '万剑：双环反转，并周期性向外释放剑雨。'),
  weapon('ice', '冰结领域', 'skill_icons/25_BLM', 454, '#8ad5ff', '在敌群脚下留下冰阵，持续伤害并减速。每级扩大范围、增加威力。', '冰碎：冻结敌人被击杀时向周围迸发冰晶。'),
  weapon('thunder', '雷电', 'skill_icons/25_BLM', 457, '#c3a5ff', '闪电在邻近敌人间跳跃并施加感电。每级增加跳跃次数与威力。', '雷暴：每次跳跃分叉，感电敌人死亡时释放雷击。'),
  weapon('slash', '雪月花', 'skill_icons/34_SAM', 3158, '#ffaacc', '向最近敌人交替挥出雪、月、花扇形斩击。每级增加威力与范围。', '纷乱雪月花：每第三次挥斩追加全周终结斩。'),
  weapon('holy', '圣灵', 'skill_icons/19_PLD', 2514, '#ffe6a4', '释放追踪光弹，自动追击敌人。每级增加威力，三级增加光弹。', '圣光回响：命中后分裂为两枚次级追踪光弹。'),
  perk('power', '猛者强击', '所有武器伤害 +20% / 层。', 8, [{ type: 'damage_increase', value: 0.2 }]),
  perk('haste', '神速咏唱', '所有自动武器攻击间隔 -8% / 层。', 5, [{ type: 'haste', value: 0.08 }]),
  perk('area', '以太扩张', '所有范围、连锁距离与环绕半径 +15% / 层。', 5),
  perk('multishot', '纷乱箭', '火炎、圣灵和幻影剑数量 +1 / 层；雷电额外跳跃一次。', 3),
  perk('critical', '战斗连祷', '所有攻击暴击率 +12% / 层；暴击增加 75% 基础伤害。', 5),
  perk('leech', '浴血', '造成伤害时吸取其 1% / 层恢复生命。', 3, [{ type: 'lifesteal', value: 0.01 }]),
  perk('stride', '疾跑', '移动速度 +10% / 层，经验吸取范围 +1.5 / 层。', 3, [{ type: 'speed_modify', value: 0.1 }]),
  perk('combustion', '星极火', '所有武器命中施加火种，带火种的敌人死亡时爆炸。每层提高爆炸威力。', 3),
  perk('shatter', '灵极冰', '所有武器对冰结领域减速的敌人额外造成 +25% / 层伤害。', 3),
  perk('conduction', '以太传导', '所有武器命中感电敌人时，20% / 层概率向附近敌人追加雷击。', 3),
  perk('dashHaste', '前冲步 · 轻盈', '前冲步每次充能时间减少 2 秒。', 4),
  perk('dashStock', '前冲步 · 蓄势', '前冲步最大充能次数 +1，立即补充新增的一次。', 2),
  perk('vitality', '超越之力', '最大生命 +20% / 层，立即恢复 20% 最大生命。', 5, [{ type: 'max_hp_modifier', value: 0.2 }]),
]
const perkIcons: Record<string, string> = {
  haste: icon('skill_icons/25_BLM', 2656), area: icon('skill_icons/25_BLM', 2652),
  multishot: icon('skill_icons/38_DNC', 3453), critical: icon('skill_icons/34_SAM', 3162),
  leech: icon('skill_icons/32_DRK', 3071), stride: icon('skill_icons/38_DNC', 3467),
  combustion: icon('skill_icons/25_BLM', 451), shatter: icon('skill_icons/25_BLM', 454),
  conduction: icon('skill_icons/25_BLM', 468), dashHaste: icon('skill_icons/38_DNC', 3467),
  dashStock: icon('skill_icons/38_DNC', 6354), vitality: icon('skill_icons/19_PLD', 2509),
}
const evolvedIcons: Record<string, string> = {
  fire: icon('skill_icons/25_BLM', 2652), ice: icon('skill_icons/25_BLM', 2653),
  thunder: icon('skill_icons/25_BLM', 468), slash: icon('skill_icons/34_SAM', 3162),
}
for (const card of CARDS) {
  if (perkIcons[card.id]) { card.icon = perkIcons[card.id]!; if (card.buff) card.buff.icon = card.icon }
  card.evolvedIcon = evolvedIcons[card.id]
}
export const WEAPONS = CARDS.filter((c): c is Card & { weapon: WeaponId } => !!c.weapon)
export function skillFor(card: Card, level: number, cooldown: number): SkillDef {
  return { id: `sv_${card.id}`, name: `${card.name} ${level === 5 ? '· 觉醒' : `Lv.${level}`}`, icon: level === 5 ? card.evolvedIcon ?? card.icon : card.icon, type: 'spell', castTime: 0, cooldown, gcd: false, targetType: 'aoe', requiresTarget: false, range: 30, mpCost: 0 }
}
