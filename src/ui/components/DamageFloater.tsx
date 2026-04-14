import { damageEvents } from '../state'

export function DamageFloater() {
  const events = damageEvents.value

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'hidden',
      }}
    >
      {events.map((ev) => (
        <div
          key={ev.id}
          class="animate-float-up"
          style={{
            position: 'absolute',
            left: ev.screenX, top: ev.screenY,
            fontSize: 18, fontWeight: 'bold',
            color: ev.isHeal ? '#4eff4e' : '#ff4444',
            textShadow: '1px 1px 3px #000',
            pointerEvents: 'none',
          }}
        >
          {ev.isHeal ? `+${ev.amount}` : `${ev.amount}`}
        </div>
      ))}
    </div>
  )
}
