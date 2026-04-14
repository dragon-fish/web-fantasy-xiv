import { useState } from 'preact/hooks'
import { buffs } from '../state'
import { buildBuffTooltip } from '../tooltip-builders'
import type { BuffSnapshot } from '../state'

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
        maxWidth: 260, boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        left: x, top: y,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function BuffIcon({ buff, onEnter, onMove, onLeave }: {
  buff: BuffSnapshot
  onEnter: (e: MouseEvent) => void
  onMove: (e: MouseEvent) => void
  onLeave: () => void
}) {
  const isDebuff = buff.type === 'debuff'
  const borderColor = isDebuff ? 'rgba(255,80,80,0.4)' : 'rgba(80,255,80,0.4)'
  const arrowColor = isDebuff ? '#ff6666' : '#66ff66'

  return (
    <div
      style={{
        width: 28, height: 28,
        background: 'rgba(0,0,0,0.7)',
        border: `1px solid ${borderColor}`,
        borderRadius: 3,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 10, position: 'relative',
        pointerEvents: 'auto', cursor: 'default',
      }}
      onMouseEnter={onEnter as any}
      onMouseMove={onMove as any}
      onMouseLeave={onLeave}
    >
      <span style={{ fontSize: 12, lineHeight: 1, color: arrowColor }}>
        {isDebuff ? '▼' : '▲'}
      </span>
      <span style={{ fontSize: 9, color: '#aaa', lineHeight: 1 }}>
        {buff.remaining > 0 ? (buff.remaining / 1000).toFixed(0) : '∞'}
      </span>
      {buff.stacks > 1 && (
        <span
          style={{
            position: 'absolute', bottom: -2, right: -2,
            fontSize: 9, fontWeight: 'bold', color: '#fff',
            background: 'rgba(0,0,0,0.8)', borderRadius: 2,
            padding: '0 2px', lineHeight: 1.2,
          }}
        >
          {buff.stacks}
        </span>
      )}
    </div>
  )
}

export function BuffBar() {
  const buffList = buffs.value
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  return (
    <div
      style={{
        position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, pointerEvents: 'none',
      }}
    >
      {buffList.map((buff) => (
        <BuffIcon
          key={buff.defId}
          buff={buff}
          onEnter={(e) => setTooltip({ html: buildBuffTooltip(buff as any), x: e.clientX, y: e.clientY })}
          onMove={(e) => setTooltip({ html: buildBuffTooltip(buff as any), x: e.clientX, y: e.clientY })}
          onLeave={() => setTooltip(null)}
        />
      ))}
      {tooltip && <TooltipEl {...tooltip} />}
    </div>
  )
}
