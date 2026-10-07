import { judgeDanceNote } from './dance'

describe('judgeDanceNote', () => {
  const c = { x: 0, y: -6 }
  it('requires both standing in the ring and facing the arrow', () => {
    expect(judgeDanceNote({ x: 0, y: -6 }, 90, c, 2.5, 90)).toBe(true)
    expect(judgeDanceNote({ x: 0, y: -6 }, 270, c, 2.5, 90)).toBe(false)
    expect(judgeDanceNote({ x: 3, y: -6 }, 90, c, 2.5, 90)).toBe(false)
  })
  it('allows 45° either side and wraps around north', () => {
    expect(judgeDanceNote(c, 315, c, 2.5, 0)).toBe(true)
    expect(judgeDanceNote(c, 44, c, 2.5, 0)).toBe(true)
    expect(judgeDanceNote(c, 46, c, 2.5, 0)).toBe(false)
  })
})
