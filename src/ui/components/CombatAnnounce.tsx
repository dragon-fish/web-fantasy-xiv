import { useEffect, useState } from 'preact/hooks'
import { announceText } from '../state'

interface AnnounceItem {
  id: number
  text: string
}

let announceCounter = 0

export function CombatAnnounce() {
  const text = announceText.value
  const [items, setItems] = useState<AnnounceItem[]>([])

  useEffect(() => {
    if (!text) return
    const id = ++announceCounter
    setItems((prev) => [...prev, { id, text }])
    const timer = setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id))
    }, 2000)
    return () => clearTimeout(timer)
  }, [text])

  return (
    <div
      style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        pointerEvents: 'none', zIndex: 60,
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{
            fontSize: 28, fontWeight: 300, letterSpacing: 6,
            color: '#e0e0e0', textShadow: '0 0 12px rgba(0,0,0,0.8)',
            animation: 'announceIn 2s ease-out forwards',
          }}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}
