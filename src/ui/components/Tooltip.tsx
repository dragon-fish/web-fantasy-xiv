import { signal } from '@preact/signals'

interface TooltipState {
  html: string
  x: number
  y: number
}

export const tooltipState = signal<TooltipState | null>(null)

export function showTooltip(html: string, x: number, y: number) {
  tooltipState.value = { html, x, y }
}

export function hideTooltip() {
  tooltipState.value = null
}

export function Tooltip() {
  const state = tooltipState.value
  if (!state) return null

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
        left: state.x, top: state.y,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}
