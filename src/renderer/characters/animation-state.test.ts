import { selectAnimation, resolveClip, type AnimInput } from './animation-state'

const base: AnimInput = { alive: true, casting: false, moving: false, inCombat: false, oneShot: null, now: 1000 }

describe('selectAnimation', () => {
  it('death overrides everything', () => {
    expect(selectAnimation({ ...base, alive: false, casting: true, moving: true, oneShot: { role: 'attack', until: 2000 } })).toBe('death')
  })
  it('an attack swing keeps playing while moving', () => {
    expect(selectAnimation({ ...base, moving: true, oneShot: { role: 'attack', until: 1200 } })).toBe('attack')
  })
  it('a hit flinch does not interrupt casting', () => {
    expect(selectAnimation({ ...base, casting: true, oneShot: { role: 'hit', until: 1200 } })).toBe('castLoop')
  })
  it('moving cancels a hit flinch', () => {
    expect(selectAnimation({ ...base, moving: true, oneShot: { role: 'hit', until: 1200 } })).toBe('move')
  })
  it('expired one-shots are ignored', () => {
    expect(selectAnimation({ ...base, inCombat: true, oneShot: { role: 'attack', until: 999 } })).toBe('combatIdle')
  })
})

describe('resolveClip', () => {
  const has = (c: string) => ['Idle', 'Punch'].includes(c)
  it('falls back through related roles when a clip is missing', () => {
    expect(resolveClip('castLoop', { idle: ['Idle'] }, has)).toBe('Idle')
    expect(resolveClip('castRelease', { attack: ['Punch'] }, has)).toBe('Punch')
  })
  it('skips clip names the model does not have', () => {
    expect(resolveClip('attack', { attack: ['Weapon', 'Punch'] }, has)).toBe('Punch')
  })
  it('returns null when nothing matches', () => {
    expect(resolveClip('hit', { hit: ['HitReact'] }, has)).toBeNull()
  })
})
