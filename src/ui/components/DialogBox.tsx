import { dialogText } from '../state'

export function DialogBox() {
  const text = dialogText.value
  if (!text) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '12%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '70%',
        maxWidth: 700,
        minHeight: 60,
        padding: '16px 24px',
        background: 'rgba(0, 0, 0, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: 8,
        color: '#e8e8e8',
        fontSize: 16,
        lineHeight: 1.6,
        letterSpacing: 1,
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
        zIndex: 55,
      }}
    >
      {text}
    </div>
  )
}
