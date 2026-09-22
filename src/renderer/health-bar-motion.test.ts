import { HealthBarMotion } from './health-bar-motion'

it('retains the entire damage burst until a quiet interval, then settles', () => {
  const bar = new HealthBarMotion(100, 100)
  bar.update(80, 100, 0)
  bar.update(55, 100, 400)
  bar.update(40, 100, 400)
  expect(bar.snapshot.damageEnd).toBe(1)
  bar.update(40, 100, 900)
  expect(bar.snapshot.damageEnd).toBe(1)
  bar.update(40, 100, 400)
  expect(bar.snapshot.damageEnd).toBeCloseTo(0.4)
})

it('settles a continuous damage burst after ten seconds even if hits continue', () => {
  const bar = new HealthBarMotion(100, 100)
  bar.update(99, 100, 0)
  for (let i = 1; i <= 20; i++) bar.update(99 - i, 100, 500)
  bar.update(78, 100, 300)
  expect(bar.snapshot.damageEnd).toBeLessThan(0.85)
})

it('clears all trails immediately at zero and resets for a new maximum', () => {
  const bar = new HealthBarMotion(100, 100)
  bar.update(50, 100, 0)
  bar.update(0, 100, 10)
  expect(bar.snapshot.damageEnd).toBe(0)
  bar.update(150, 200, 10)
  expect(bar.snapshot.damageEnd).toBe(0.75)
})

it('healing cancels the matching lost segment and settles quickly', () => {
  const bar = new HealthBarMotion(100, 100)
  bar.update(40, 100, 0)
  bar.update(70, 100, 100)
  expect(bar.snapshot.healStart).toBe(0.4)
  expect(bar.snapshot.damageEnd).toBe(1)
  bar.update(70, 100, 300)
  expect(bar.snapshot.healStart).toBe(0.7)
  bar.update(100, 100, 0)
  expect(bar.snapshot.damageEnd).toBe(1)
})

it('holds the visible remainder again when another hit interrupts quiet-time settling', () => {
  const bar = new HealthBarMotion(100, 100)
  bar.update(80, 100, 0)
  bar.update(80, 100, 1100)
  const visible = bar.snapshot.damageEnd
  expect(visible).toBeGreaterThan(0.8)
  bar.update(60, 100, 0)
  bar.update(60, 100, 150)
  expect(bar.snapshot.damageEnd).toBe(visible)
  bar.update(60, 100, 1100)
  expect(bar.snapshot.damageEnd).toBeCloseTo(0.6)
})
