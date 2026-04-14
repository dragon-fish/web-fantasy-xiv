import { playerCast, bossCast } from '../state'

interface CastBarBaseProps {
  name: string
  pct: number
  top?: number | string
  bottom?: number | string
  color: string
}

function CastBarBase({ name, pct, top, bottom, color }: CastBarBaseProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top, bottom,
        left: '50%', transform: 'translateX(-50%)',
        width: 250, height: 18,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 3, overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          background: color,
          width: `${Math.min(100, pct)}%`,
          transition: 'width 0.05s',
        }}
      />
      <span
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 11, textShadow: '1px 1px 2px #000',
        }}
      >
        {name}
      </span>
    </div>
  )
}

export function PlayerCastBar() {
  const cast = playerCast.value
  if (!cast) return null
  const pct = cast.total > 0 ? (cast.elapsed / cast.total) * 100 : 0
  return (
    <CastBarBase
      name={cast.name}
      pct={pct}
      bottom={120}
      color="linear-gradient(90deg, #4a9eff, #82c0ff)"
    />
  )
}

export function BossCastBar() {
  const cast = bossCast.value
  if (!cast) return null
  const pct = cast.total > 0 ? (cast.elapsed / cast.total) * 100 : 0
  return (
    <CastBarBase
      name={cast.name}
      pct={pct}
      top={50}
      color="linear-gradient(90deg, #cc5533, #ff7744)"
    />
  )
}
