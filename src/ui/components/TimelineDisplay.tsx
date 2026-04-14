import { timelineEntries, timelineCollapsed } from '../state'

const WINDOW_MS = 30000

export function TimelineDisplay() {
  const collapsed = timelineCollapsed.value
  const entries = timelineEntries.value

  const toggle = () => {
    const next = !collapsed
    timelineCollapsed.value = next
    localStorage.setItem('xiv-timeline-collapsed', String(next))
  }

  return (
    <div
      class="absolute z-50 text-xs"
      style={{ top: 60, left: 12, width: 220, fontFamily: "'Segoe UI', sans-serif", pointerEvents: 'auto' }}
    >
      <div
        class="flex justify-between items-center cursor-pointer select-none"
        style={{
          background: 'rgba(0,0,0,0.7)', padding: '4px 10px',
          borderRadius: collapsed ? 4 : '4px 4px 0 0',
          color: '#aaa',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: collapsed ? undefined : 'none',
        }}
        onClick={toggle}
      >
        <span>Timeline</span>
        <span>{collapsed ? '\u25B8' : '\u25BE'}</span>
      </div>
      {!collapsed && (
        <div
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            overflow: 'hidden',
          }}
        >
          {entries.map((entry) => (
            <TimelineRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function TimelineRow({ entry }: { entry: typeof timelineEntries.value[0] }) {
  let barWidth = '0%'
  let barColor = 'rgba(100, 160, 255, 0.15)'
  let countdownText = ''
  let opacity = '1'

  if (entry.state === 'upcoming') {
    const pct = Math.max(0, 1 - entry.timeUntil / WINDOW_MS) * 100
    barWidth = `${pct}%`
    countdownText = (entry.timeUntil / 1000).toFixed(1)
  } else if (entry.state === 'casting') {
    const castElapsed = -entry.timeUntil
    const remaining = 1 - castElapsed / entry.castTime
    barWidth = `${remaining * 100}%`
    barColor = 'rgba(255, 140, 60, 0.25)'
    countdownText = ((entry.castTime - castElapsed) / 1000).toFixed(1)
  } else if (entry.state === 'flash') {
    barWidth = '100%'
    barColor = 'rgba(255, 200, 80, 0.3)'
    opacity = Math.sin(entry.flashElapsed * 0.01) > 0 ? '1' : '0.5'
  }

  return (
    <div
      class="relative overflow-hidden"
      style={{ padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.05)', opacity }}
    >
      <div class="absolute left-0 top-0 h-full" style={{ width: barWidth, background: barColor }} />
      <div class="relative flex justify-between items-center z-1">
        <span style={{ color: '#ccc' }}>{entry.skillName}</span>
        <span class="tabular-nums" style={{ color: '#888' }}>{countdownText}</span>
      </div>
    </div>
  )
}
