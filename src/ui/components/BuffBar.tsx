import { buffs } from '../state'
import { buildBuffTooltip } from '../tooltip-builders'
import { showTooltip, hideTooltip } from './Tooltip'
import type { BuffSnapshot } from '../state'

function BuffIcon({ buff }: { buff: BuffSnapshot }) {
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
      onMouseEnter={(e) => showTooltip(buildBuffTooltip(buff as any), e.clientX, e.clientY)}
      onMouseMove={(e) => showTooltip(buildBuffTooltip(buff as any), e.clientX, e.clientY)}
      onMouseLeave={hideTooltip}
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

  return (
    <div
      style={{
        position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 4, pointerEvents: 'none',
      }}
    >
      {buffList.map((buff) => (
        <BuffIcon key={buff.defId} buff={buff} />
      ))}
    </div>
  )
}
