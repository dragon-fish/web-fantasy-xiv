import { playerHp, playerMp, bossHp } from '../state'

interface BarProps {
  current: number
  max: number
  color: string
  shield?: number
  height?: number
  top?: number | string
  bottom?: number | string
}

function Bar({ current, max, color, shield, height = 24, top, bottom }: BarProps) {
  const pct = max > 0 ? (current / max) * 100 : 0
  const shieldPct = shield && max > 0 ? (shield / max) * 100 : 0
  // Cap combined HP + shield at 100%
  const clampedShieldPct = Math.min(shieldPct, 100 - pct)

  return (
    <div
      style={{
        position: 'absolute',
        top, bottom,
        left: '50%', transform: 'translateX(-50%)',
        width: 300, height,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 3, overflow: 'hidden',
      }}
    >
      <div style={{ height: '100%', background: color, width: `${pct}%`, transition: 'width 0.1s' }} />
      {clampedShieldPct > 0 && (
        <div
          style={{
            position: 'absolute', top: 0,
            left: `${pct}%`,
            height: '100%',
            background: '#ddcc44',
            width: `${clampedShieldPct}%`,
            transition: 'width 0.1s, left 0.1s',
          }}
        />
      )}
      <span
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, zIndex: 1, textShadow: '1px 1px 2px #000',
        }}
      >
        {shield ? `${Math.floor(current)}+${shield} / ${max}` : `${Math.floor(current)} / ${max}`}
      </span>
    </div>
  )
}

export function BossHpBar() {
  const hp = bossHp.value
  return <Bar current={hp.current} max={hp.max} color="#cc3333" top={20} />
}

export function PlayerHpBar() {
  const hp = playerHp.value
  return <Bar current={hp.current} max={hp.max} color="#44aa44" shield={hp.shield} bottom={80} />
}

export function PlayerMpBar() {
  const mp = playerMp.value
  if (mp.max === 0) return null
  return <Bar current={mp.current} max={mp.max} color="#4488cc" height={16} bottom={108} />
}
