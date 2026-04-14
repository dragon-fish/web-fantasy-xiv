import { useState } from 'preact/hooks'
import { skillBarEntries, cooldowns, gcdState, buffDefs } from '../state'
import { buildSkillTooltip } from '../tooltip-builders'

interface TooltipState {
  html: string
  x: number
  y: number
}

function TooltipEl({ html, x, y }: TooltipState) {
  return (
    <div
      style={{
        position: 'fixed', zIndex: 200, pointerEvents: 'none',
        background: 'rgba(10,10,15,0.95)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 4, padding: '8px 12px',
        fontSize: 12, color: '#ccc', lineHeight: 1.6,
        maxWidth: 260,
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        left: x, top: y,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function SkillBar() {
  const entries = skillBarEntries.value
  const cds = cooldowns.value
  const gcd = gcdState.value
  const defs = buffDefs.value
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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

        return (
          <div
            key={entry.key}
            style={{
              width: 48, height: 48,
              background: 'rgba(0,0,0,0.8)',
              border: '2px solid rgba(255,255,255,0.4)',
              borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', fontSize: 12, cursor: 'default',
            }}
            onMouseEnter={(e) => {
              const html = buildSkillTooltip(skill as any, defs.size > 0 ? defs as any : undefined)
              setTooltip({ html, x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => {
              const html = buildSkillTooltip(skill as any, defs.size > 0 ? defs as any : undefined)
              setTooltip({ html, x: e.clientX, y: e.clientY })
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
              {entry.key}
            </span>
            <span style={{ fontSize: 9, textAlign: 'center' }}>{skill.name.slice(0, 3)}</span>
            {cdPct > 0 && (
              <div
                style={{
                  position: 'absolute', bottom: 0, left: 0,
                  width: '100%', height: `${cdPct}%`,
                  background: 'rgba(0,0,0,0.7)', transition: 'height 0.05s',
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
      {tooltip && <TooltipEl {...tooltip} />}
    </div>
  )
}
