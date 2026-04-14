import { useLocation } from 'preact-iso'
import { paused } from '../state'

interface PauseMenuProps {
  onRetry: () => void
}

export function PauseMenu({ onRetry }: PauseMenuProps) {
  if (!paused.value) return null

  const { route } = useLocation()

  const btnStyle = {
    padding: '10px 28px', fontSize: 14, margin: 6,
    background: 'rgba(255,255,255,0.08)', color: '#bbb',
    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3,
    cursor: 'pointer', letterSpacing: 1, minWidth: 160,
    pointerEvents: 'auto' as const,
  }

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', zIndex: 90, pointerEvents: 'auto',
      }}
    >
      <h2
        style={{
          fontSize: 28, color: '#ddd', marginBottom: 30,
          fontWeight: 300, letterSpacing: 6,
        }}
      >
        PAUSED
      </h2>
      <button style={btnStyle} onClick={() => { paused.value = false }}>
        Resume
      </button>
      <button style={btnStyle} onClick={onRetry}>
        Retry
      </button>
      <button
        style={btnStyle}
        onClick={() => {
          window.history.pushState(null, '', '/')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }}
      >
        Quit to Menu
      </button>
    </div>
  )
}
