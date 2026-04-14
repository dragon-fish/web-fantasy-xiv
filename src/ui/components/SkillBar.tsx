import { skillBarEntries, cooldowns, gcdState, buffDefs, buffs, tooltipContext } from '../state'
import { buildSkillTooltip } from '../tooltip-builders'
import { showTooltip, hideTooltip } from './Tooltip'

export function SkillBar() {
  const entries = skillBarEntries.value
  const cds = cooldowns.value
  const gcd = gcdState.value
  const defs = buffDefs.value
  const activeBuffIds = new Set(buffs.value.map(b => b.defId))
  const ctx = tooltipContext.value

  return (
    <div
      style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 6, pointerEvents: 'auto',
      }}
    >
      {entries.map((entry) => {
        const skill = entry.skill
        const isGcd = skill.gcd ?? false
        const cdRemaining = cds.get(skill.id) ?? 0
        const cdTotal = isGcd ? gcd.total : (skill.cooldown ?? 0)
        const active = isGcd ? gcd.remaining : cdRemaining
        const cdPct = cdTotal > 0 && active > 0 ? (active / cdTotal) * 100 : 0
        const cdText = active > 0 ? (active / 1000).toFixed(1) : null
        const reqBuffs = (skill as any).requiresBuffs as string[] | undefined
        const reqStacks = (skill as any).requiresBuffStacks as { buffId: string; stacks: number } | undefined
        const lockedByBuffs = reqBuffs ? !reqBuffs.every(id => activeBuffIds.has(id)) : false
        const lockedByStacks = reqStacks
          ? (buffs.value.find(b => b.defId === reqStacks.buffId)?.stacks ?? 0) < reqStacks.stacks
          : false
        const locked = lockedByBuffs || lockedByStacks

        return (
          <div
            key={entry.key}
            style={{
              width: 48, height: 48,
              background: 'rgba(0,0,0,0.8)',
              border: locked ? '2px solid rgba(255,50,50,0.4)' : '2px solid rgba(255,255,255,0.4)',
              opacity: locked ? 0.5 : 1,
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', fontSize: 12, cursor: 'default',
            }}
            onMouseEnter={(e) => {
              const html = buildSkillTooltip(skill as any, defs.size > 0 ? defs as any : undefined, ctx)
              showTooltip(html, e.clientX, e.clientY)
            }}
            onMouseMove={(e) => {
              const html = buildSkillTooltip(skill as any, defs.size > 0 ? defs as any : undefined, ctx)
              showTooltip(html, e.clientX, e.clientY)
            }}
            onMouseLeave={hideTooltip}
          >
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              {entry.key}
            </span>
            {skill.icon
              ? <img src={skill.icon} style={{ width: 40, height: 40, objectFit: 'contain', pointerEvents: 'none' }} />
              : <span style={{ fontSize: 9, textAlign: 'center' }}>{skill.name.slice(0, 3)}</span>
            }
            {cdPct > 0 && (
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0, width: '100%',
                  height: `${cdPct}%`, background: 'rgba(0,0,0,0.7)',
                }}
              />
            )}
            {cdText && (
              <span
                style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: 14, fontWeight: 'bold', zIndex: 1,
                  textShadow: '1px 1px 2px #000',
                }}
              >
                {cdText}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
