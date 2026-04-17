// Pure HTML-building functions for FF14-style tooltips.
// No DOM classes — safe to import in Preact components.

const TYPE_NAMES: Record<string, string> = {
  weaponskill: '战技',
  spell: '魔法',
  ability: '能力技',
}

export function buildSkillTooltip(skill: {
  name: string
  type: string
  castTime?: number
  cooldown?: number
  range?: number
  mpCost?: number
  targetType?: string
  gcd?: boolean
  requiresTarget?: boolean
  requiresBuffs?: string[]
  requiresBuffStacks?: { buffId: string; stacks: number }
  effects?: { type: string; potency?: number; buffId?: string; buffIds?: string[]; distance?: number; stacks?: number; percent?: number }[]
  zones?: { shape?: { type: string; radius?: number; angle?: number; length?: number; width?: number }; effects?: any[] }[]
}, buffDefs?: Map<string, { name: string; duration: number; type: string; effects: { type: string; value?: number }[] }>,
context?: { gcdDuration?: number; haste?: number }): string {
  const lines: string[] = []

  // Header: name + type + range
  lines.push(`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">`)
  lines.push(`<div>`)
  lines.push(`<div style="color:#fff;font-size:15px;font-weight:bold;line-height:1.2">${skill.name}</div>`)
  lines.push(`<div style="color:#b8a06a;font-size:11px;margin-top:2px">${TYPE_NAMES[skill.type] ?? skill.type}</div>`)
  lines.push(`</div>`)
  // Right side: range info
  const rightStats: string[] = []
  if (skill.range && skill.range > 0) rightStats.push(`距离 ${skill.range}m`)
  if (skill.mpCost && skill.mpCost > 0) rightStats.push(`<span style="color:#4488cc">MP ${skill.mpCost}</span>`)
  if ((skill as any).hpCost && (skill as any).hpCost > 0) rightStats.push(`<span style="color:#ff6666">HP ${(skill as any).hpCost}</span>`)
  if (rightStats.length) {
    lines.push(`<div style="color:#aaa;font-size:11px;text-align:right;white-space:nowrap;margin-left:12px">${rightStats.join('<br>')}</div>`)
  }
  lines.push(`</div>`)

  // Cast time + recast time row (apply haste if available)
  const haste = context?.haste ?? 0
  const applyHaste = (ms: number) => haste > 0 ? ms * (1 - haste) : ms
  const castLabel = (skill.castTime && skill.castTime > 0) ? `${(applyHaste(skill.castTime) / 1000).toFixed(2)}秒` : '即时'
  const gcdMs = context?.gcdDuration ?? 2500
  const recastLabel = skill.gcd ? `${(applyHaste(gcdMs) / 1000).toFixed(2)}秒` : (skill.cooldown && skill.cooldown > 0) ? `${(skill.cooldown / 1000).toFixed(0)}秒` : '-'
  lines.push(`<div style="display:flex;gap:16px;margin:6px 0;padding:4px 0;border-top:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08)">`)
  lines.push(`<div><div style="color:#888;font-size:9px">咏唱时间</div><div style="color:#fff;font-size:14px;font-weight:bold">${castLabel}</div></div>`)
  lines.push(`<div><div style="color:#888;font-size:9px">复唱时间</div><div style="color:#fff;font-size:14px;font-weight:bold">${recastLabel}</div></div>`)
  lines.push(`</div>`)

  // Required buffs
  if (skill.requiresBuffs?.length) {
    const names = skill.requiresBuffs.map(id => {
      const bd = buffDefs?.get(id)
      return bd ? bd.name : id
    }).join('、')
    lines.push(`<div style="color:#ffcc66;font-size:11px;margin-top:4px">发动条件：需要 ${names}</div>`)
  }
  // Required buff stacks
  if (skill.requiresBuffStacks) {
    const buffName = buffDefs?.get(skill.requiresBuffStacks.buffId)?.name ?? skill.requiresBuffStacks.buffId
    lines.push(`<div style="color:#ffcc66;font-size:11px;margin-top:4px">发动条件：${buffName} ×${skill.requiresBuffStacks.stacks}</div>`)
  }
  // Effects
  if (skill.effects?.length) {
    for (const e of skill.effects) {
      lines.push(`<div style="margin-top:3px;font-size:12px">${formatEffect(e, skill.range, skill.requiresTarget)}</div>`)
      if (e.type === 'apply_buff' && e.buffId && buffDefs) {
        const bd = buffDefs.get(e.buffId)
        if (bd) lines.push(formatBuffDescription(bd))
      }
    }
  }

  if (skill.zones?.length) {
    for (const z of skill.zones) {
      if (z.shape) lines.push(`<div style="color:#777;font-size:10px;margin-top:2px">${formatShape(z.shape)}</div>`)
      if (z.effects) {
        for (const e of z.effects) {
          lines.push(`<div style="margin-top:2px;font-size:12px">${formatEffect(e, skill.range, skill.requiresTarget)}</div>`)
          if (e.type === 'apply_buff' && e.buffId && buffDefs) {
            const bd = buffDefs.get(e.buffId)
            if (bd) lines.push(formatBuffDescription(bd))
          }
        }
      }
    }
  }

  return lines.join('')
}

export function buildBuffTooltip(buff: {
  name: string
  type: string
  description?: string
  stacks: number
  remaining: number
  effects: { type: string; value?: number }[]
}): string {
  const lines: string[] = []

  const color = buff.type === 'debuff' ? '#ff8888' : '#88ff88'
  lines.push(`<div style="color:${color};font-size:14px;font-weight:bold;margin-bottom:4px">${buff.name}</div>`)
  lines.push(`<span style="color:#b8a06a;font-size:11px">${buff.type === 'debuff' ? '减益' : '增益'}</span>`)

  if (buff.stacks > 1) lines.push(` · <span style="color:#ddd">${buff.stacks} 层</span>`)

  if (buff.remaining > 0) {
    lines.push(`<div style="color:#999;font-size:11px;margin-top:4px">剩余 ${(buff.remaining / 1000).toFixed(1)}s</div>`)
  }

  lines.push(`<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:6px;padding-top:4px">`)
  if (buff.description) {
    lines.push(`<div style="color:#ccc;font-size:11px;line-height:1.6">${buff.description}</div>`)
  }
  for (const e of buff.effects) {
    lines.push(`<div style="margin-top:2px;font-size:12px">${formatBuffEffect(e, buff.stacks)}</div>`)
  }
  lines.push(`</div>`)

  return lines.join('')
}

function formatBuffDescription(bd: { name: string; description?: string; duration: number; type: string; effects: { type: string; value?: number }[] }): string {
  const dur = bd.duration > 0 ? ` ${(bd.duration / 1000).toFixed(0)}s` : ' ∞'
  const parts: string[] = []
  if (bd.description) parts.push(bd.description)
  const effectDescs = bd.effects.map((e) => formatBuffEffect(e, 1)).join('，')
  if (effectDescs) parts.push(effectDescs)
  const suffix = parts.length > 0 ? `：${parts.join('，')}` : ''
  return `<div style="color:#aaa;font-size:11px;margin-left:8px;border-left:2px solid rgba(184,160,106,0.3);padding-left:6px;margin-top:2px">${bd.name}${dur}${suffix}</div>`
}

function formatEffect(e: { type: string; potency?: number; buffId?: string; buffIds?: string[]; distance?: number; stacks?: number; percent?: number }, skillRange?: number, requiresTarget?: boolean): string {
  switch (e.type) {
    case 'damage': return `<span style="color:#ff8888">伤害 威力：${formatPotency(e.potency)}</span>`
    case 'heal': return `<span style="color:#88ff88">治疗 威力：${formatPotency(e.potency)}</span>`
    case 'apply_buff': return `<span style="color:#ffcc66">追加效果：${e.buffId}${e.stacks && e.stacks > 1 ? ` ×${e.stacks}` : ''}</span>`
    case 'dash': {
      const desc = requiresTarget
        ? `冲向${skillRange ? ` ${skillRange}m 内的` : ''}目标`
        : `迅速移动到自身前方 ${e.distance ?? skillRange ?? '?'}m 处`
      return `<span style="color:#88ccff">${desc}</span><br><span style="color:#666;font-size:10px">止步状态下无法发动</span>`
    }
    case 'backstep': {
      const desc = requiresTarget
        ? `面对目标后跳 ${e.distance}m`
        : `迅速移动到自身后方 ${e.distance}m 处`
      return `<span style="color:#88ccff">${desc}</span><br><span style="color:#666;font-size:10px">止步状态下无法发动</span>`
    }
    case 'consume_buffs': return `<span style="color:#cc88ff">消耗：${(e.buffIds ?? []).join('、')}</span>`
    case 'consume_all_buff_stacks': return `<span style="color:#cc88ff">消耗所有：${e.buffId}</span>`
    case 'consume_buff_stacks': return `<span style="color:#cc88ff">消耗 ${e.buffId} ×${e.stacks}</span>`
    case 'restore_mp': return `<span style="color:#4488cc">恢复 ${((e.percent ?? 0) * 100).toFixed(0)}% MP</span>`
    case 'dash_forward': return `<span style="color:#88ccff">向前方冲刺 ${e.distance}m</span><br><span style="color:#666;font-size:10px">止步状态下无法发动</span>`
    case 'dash_to_ley_lines': return `<span style="color:#88ccff">迅速回到黑魔纹中心</span>`
    case 'knockback': return `<span style="color:#ffaa66">击退 ${e.distance}m</span>`
    case 'pull': return `<span style="color:#ffaa66">吸引 ${e.distance}m</span>`
    default: return `<span style="color:#888">${e.type}</span>`
  }
}

function formatBuffEffect(e: { type: string; value?: number }, stacks: number): string {
  const v = e.value ?? 0
  const total = v * stacks
  const pct = (total * 100).toFixed(0)
  switch (e.type) {
    case 'damage_increase': return `<span style="color:#ff8888">攻击力 +${pct}%</span>`
    case 'mitigation': return `<span style="color:#88ccff">减伤 ${(v * 100).toFixed(0)}%</span>`
    case 'vulnerability': return `<span style="color:#ff6666">易伤 +${pct}%${stacks > 1 ? ` (${(v * 100).toFixed(0)}% × ${stacks})` : ''}</span>`
    case 'haste': return `<span style="color:#88ccff">咏唱/复唱/自动攻击速度 +${(v * 100).toFixed(0)}%</span>`
    case 'speed_modify': return `<span style="color:#88ff88">速度 ${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%</span>`
    case 'dot': return `<span style="color:#ff8888">持续伤害</span>`
    case 'hot': return `<span style="color:#88ff88">持续治疗</span>`
    case 'lifesteal': return `<span style="color:#88ff88">吸血 ${(v * 100).toFixed(0)}%</span>`
    case 'mp_on_hit': return `<span style="color:#4488cc">受击回复 MP ${v}</span>`
    case 'undying': return `<span style="color:#ffcc66">HP不会低于1</span>`
    case 'silence': return `<span style="color:#ff6666">沉默</span>`
    case 'stun': return `<span style="color:#ff6666">眩晕</span>`
    default: return `<span style="color:#888">${e.type}</span>`
  }
}

function formatPotency(potency?: number): string {
  if (potency == null) return ''
  const pct = potency * 100
  return pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(1)}%`
}

function formatShape(s: { type: string; radius?: number; angle?: number; length?: number; width?: number }): string {
  switch (s.type) {
    case 'circle': return `圆形 r=${s.radius}m`
    case 'fan': return `扇形 r=${s.radius}m ${s.angle}°`
    case 'ring': return `环形`
    case 'rect': return `矩形 ${s.length}×${s.width}m`
    default: return s.type
  }
}
