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
        background: 'linear-gradient(180deg, rgba(30,28,24,0.97) 0%, rgba(18,16,14,0.97) 100%)',
        border: '2px solid #8b7440',
        borderRadius: 6, padding: '10px 14px',
        fontSize: 12, color: '#ccc', lineHeight: 1.6,
        maxWidth: 280,
        boxShadow: '0 0 1px rgba(184,160,106,0.4), 0 4px 12px rgba(0,0,0,0.6)',
        left: state.x, top: state.y,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}
