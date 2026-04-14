import { buffs } from '../state'
import { buildBuffTooltip } from '../tooltip-builders'
import { showTooltip, hideTooltip } from './Tooltip'
import type { BuffSnapshot } from '../state'

/**
 * Resolve the icon src for a buff at its current stack count.
 * Returns the exact per-stack image, or the fallback (key 0), or the base icon, or null.
 * Also returns whether the stack count text should be rendered manually
 * (i.e. when we fell back to key-0 or base icon for a multi-stack buff).
 */
function resolveBuffIcon(buff: BuffSnapshot): { src: string | null; showStackText: boolean } {
  const { icon, iconPerStack, stacks } = buff

  if (iconPerStack) {
    const exact = iconPerStack[stacks]
    if (exact) return { src: exact, showStackText: false }
    const fallback = iconPerStack[0]
    if (fallback) return { src: fallback, showStackText: stacks > 1 }
  }

  if (icon) return { src: icon, showStackText: stacks > 1 }

  return { src: null, showStackText: false }
}

function BuffIcon({ buff }: { buff: BuffSnapshot }) {
  const isDebuff = buff.type === 'debuff'
  const borderColor = isDebuff ? 'rgba(255,80,80,0.4)' : 'rgba(80,255,80,0.4)'
  const arrowColor = isDebuff ? '#ff6666' : '#66ff66'
  const { src: iconSrc, showStackText } = resolveBuffIcon(buff)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 1,
        pointerEvents: 'auto', cursor: 'default',
      }}
      onMouseEnter={(e) => showTooltip(buildBuffTooltip(buff as any), e.clientX, e.clientY)}
      onMouseMove={(e) => showTooltip(buildBuffTooltip(buff as any), e.clientX, e.clientY)}
      onMouseLeave={hideTooltip}
    >
      {/* Icon box */}
      <div
        style={{
          width: 28, height: 28,
          background: iconSrc ? 'transparent' : 'rgba(0,0,0,0.7)',
          border: iconSrc ? 'none' : `1px solid ${borderColor}`,
          borderRadius: 3,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {iconSrc ? (
          <img src={iconSrc} style={{ width: 28, height: 28, objectFit: 'contain', pointerEvents: 'none' }} />
        ) : (
          <>
            <span style={{ fontSize: 12, lineHeight: 1, color: arrowColor }}>
              {isDebuff ? '▼' : '▲'}
            </span>
            {buff.stacks > 1 && (
              <span
                style={{
                  position: 'absolute', top: -1, right: 1,
                  fontSize: 9, fontWeight: 'bold', color: '#fff',
                  textShadow: '0 0 2px #000, 0 0 2px #000',
                  lineHeight: 1,
                }}
              >
                {buff.stacks}
              </span>
            )}
          </>
        )}
        {/* Stack count badge (when icon exists but no exact per-stack image) */}
        {iconSrc && showStackText && (
          <span
            style={{
              position: 'absolute', top: -1, right: 1,
              fontSize: 9, fontWeight: 'bold', color: '#fff',
              textShadow: '0 0 2px #000, 0 0 2px #000',
              lineHeight: 1,
            }}
          >
            {buff.stacks}
          </span>
        )}
      </div>
      {/* Duration below icon */}
      <span style={{ fontSize: 9, color: '#aaa', lineHeight: 1, textAlign: 'center' }}>
        {buff.remaining > 0 ? (buff.remaining / 1000).toFixed(0) : '∞'}
      </span>
    </div>
  )
}

export function BuffBar() {
  const buffList = buffs.value

  return (
    <div
      style={{
        position: 'absolute', bottom: 145, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 2, pointerEvents: 'none',
      }}
    >
      {buffList.map((buff) => (
        <BuffIcon key={buff.defId} buff={buff} />
      ))}
    </div>
  )
}
