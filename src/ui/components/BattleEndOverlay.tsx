import { battleResult, damageLog, combatElapsed } from '../state'

interface BattleEndOverlayProps {
  onRetry: () => void
}

function formatTime(ms: number): string {
  const sec = ms / 1000
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function formatClearTime(ms: number): string {
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = Math.floor(totalSec % 60)
  const frac = (ms % 1000).toString().padStart(3, '0')
  return `${m}'${s.toString().padStart(2, '0')}.${frac}''`
}

export function BattleEndOverlay({ onRetry }: BattleEndOverlayProps) {
  const result = battleResult.value
  if (!result) return null

  const log = damageLog.value
  const elapsed = combatElapsed.value

  const isWipe = result === 'wipe'

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)', zIndex: 80,
        pointerEvents: 'auto', cursor: 'pointer',
      }}
      onClick={onRetry}
    >
      <h2
        style={{
          fontSize: 32, color: isWipe ? '#ff4444' : '#44ff44',
          fontWeight: 300, letterSpacing: 6, marginBottom: 16,
        }}
      >
        {isWipe ? 'DEFEATED' : 'VICTORY'}
      </h2>

      {isWipe && log.length > 0 && (
        <div
          style={{
            fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8,
            color: '#aaa', marginBottom: 16, textAlign: 'left',
            background: 'rgba(0,0,0,0.4)', padding: '10px 16px',
            borderRadius: 4, maxWidth: 500,
          }}
        >
          {log.slice(-5).map((d, i, arr) => {
            const isLast = i === arr.length - 1
            const timeStr = formatTime(d.time)
            const mitStr = d.mitigation > 0
              ? ` 减伤${(d.mitigation * 100).toFixed(0)}%`
              : ''
            const tag = isLast ? '【致命】' : ''
            return (
              <div key={i}>
                <span style={{ color: '#666' }}>{timeStr}</span>
                {' ['}
                <span style={{ color: '#ff8888' }}>{d.sourceName}</span>
                {`] ${d.skillName} `}
                <span style={{ color: '#ff6666' }}>{d.amount}</span>
                {` (HP:${Math.max(0, d.hpAfter)}`}
                {mitStr && <span style={{ color: '#88ccff' }}>{mitStr}</span>}
                {')'}
                {isLast && <span style={{ color: '#ff4444', fontWeight: 'bold' }}> {tag}</span>}
              </div>
            )
          })}
        </div>
      )}

      {!isWipe && elapsed !== null && (
        <p style={{ fontSize: 18, color: '#ccc', marginBottom: 16, letterSpacing: 2 }}>
          通关用时 {formatClearTime(elapsed)}
        </p>
      )}

      <p style={{ fontSize: 14, color: '#666' }}>Click to retry</p>
    </div>
  )
}
