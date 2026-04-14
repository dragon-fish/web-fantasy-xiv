import { debugFps, debugPlayerPos, combatElapsed } from '../state'

export function DebugInfo() {
  const fps = debugFps.value
  const pos = debugPlayerPos.value
  const elapsed = combatElapsed.value

  let timeText: string
  if (elapsed === null) {
    timeText = '--:--'
  } else {
    const sec = elapsed / 1000
    const m = Math.floor(sec / 60)
    const s = (sec % 60).toFixed(1).padStart(4, '0')
    timeText = `${m}:${s}`
  }

  return (
    <div
      style={{
        position: 'absolute', top: 12, right: 12,
        background: 'rgba(0,0,0,0.5)', padding: '6px 10px',
        borderRadius: 4, fontSize: 11, fontFamily: 'monospace',
        color: '#999', lineHeight: 1.6, pointerEvents: 'none',
        minWidth: 160,
      }}
    >
      <div>
        <span style={{ color: '#666' }}>FPS </span>
        <span>{fps}</span>
      </div>
      <div>
        <span style={{ color: '#666' }}>POS </span>
        <span>{pos.x.toFixed(1)}, {pos.y.toFixed(1)}</span>
      </div>
      <div>
        <span style={{ color: '#666' }}>TIME </span>
        <span style={{ color: elapsed === null ? '#666' : '#999' }}>{timeText}</span>
      </div>
    </div>
  )
}
