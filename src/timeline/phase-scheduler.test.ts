import { EventBus } from '@/core/event-bus'
import { PhaseScheduler } from './phase-scheduler'
import type { PhaseDef } from '@/config/schema'

describe('PhaseScheduler loop', () => {
  it('jumps back to the target time without replaying earlier actions', () => {
    const bus = new EventBus()
    const fired: string[] = []
    bus.on('timeline:action', (a: any) => fired.push(a.use))
    const phases: PhaseDef[] = [{
      id: 'phase_default', trigger: { type: 'on_combat_start' },
      actions: [
        { at: 0, action: 'use', use: 'opener' },
        { at: 1000, action: 'use', use: 'loopA' },
        { at: 1500, action: 'use', use: 'loopB' },
        { at: 2000, action: 'loop', loop: 1000 },
      ],
    }]
    const scheduler = new PhaseScheduler(bus, phases)
    for (let t = 0; t < 3600; t += 100) scheduler.update(100)
    expect(fired).toEqual(['opener', 'loopA', 'loopB', 'loopA', 'loopB', 'loopA', 'loopB'])
  })
})

describe('PhaseScheduler seek', () => {
  it('re-emits skipped actions once as fast-forward, then resumes normally', () => {
    const bus = new EventBus()
    const seen: string[] = []
    bus.on('timeline:action', (a: any) => seen.push(`${a.use ?? a.action}${a.fastForward ? '(ff)' : ''}`))
    const scheduler = new PhaseScheduler(bus, [{
      id: 'phase_default', trigger: { type: 'on_combat_start' },
      actions: [
        { at: 500, action: 'set_visible' },
        { at: 900, action: 'use', use: 'cast' },
        { at: 1500, action: 'use', use: 'after' },
      ],
    }])
    scheduler.seek(1000)
    scheduler.update(600)
    expect(seen).toEqual(['set_visible(ff)', 'cast(ff)', 'after'])
  })
})

describe('PhaseScheduler HP push', () => {
  it('an exclusive phase cuts the old timeline short and takes over the HP floor', () => {
    const bus = new EventBus()
    const fired: string[] = []
    bus.on('timeline:action', (a: any) => fired.push(a.use))
    const phases: PhaseDef[] = [
      { id: 'phase_default', trigger: { type: 'on_combat_start' }, hpFloor: 85,
        actions: [{ at: 1000, action: 'use', use: 'p1a' }, { at: 5000, action: 'use', use: 'p1b' }] },
      { id: 'p2', trigger: { type: 'on_hp_below', group: 'boss', percent: 85 }, exclusive: true, hpFloor: 55,
        actions: [{ at: 1000, action: 'use', use: 'p2a' }] },
    ]
    const scheduler = new PhaseScheduler(bus, phases)
    expect(scheduler.hpFloor()).toBe(85)
    scheduler.update(2000)
    scheduler.checkTriggers({ groupHpBelow: (_g, pct) => pct >= 85 })
    expect(scheduler.hpFloor()).toBe(55)
    scheduler.update(4000)
    expect(fired).toEqual(['p1a', 'p2a'])
  })
  it('background phases survive an exclusive phase', () => {
    const bus = new EventBus()
    const fired: string[] = []
    bus.on('timeline:action', (a: any) => fired.push(a.use))
    const stopped: string[] = []
    bus.on('phase:stopped', (p: { phaseId: string }) => stopped.push(p.phaseId))
    const phases: PhaseDef[] = [
      { id: 'phase_default', trigger: { type: 'on_combat_start' }, actions: [{ at: 3000, action: 'use', use: 'p1' }] },
      { id: 'enrage', trigger: { type: 'on_combat_start' }, background: true, actions: [{ at: 3000, action: 'use', use: 'enrage' }] },
      { id: 'p2', trigger: { type: 'on_hp_below', group: 'boss', percent: 85 }, exclusive: true, actions: [] },
    ]
    const scheduler = new PhaseScheduler(bus, phases)
    scheduler.update(1000)
    scheduler.checkTriggers({ groupHpBelow: () => true })
    scheduler.update(3000)
    expect(fired).toEqual(['enrage'])
    expect(stopped).toEqual(['phase_default'])
  })
  it('actions name the phase that fired them (casts are cut when it stops)', () => {
    const bus = new EventBus()
    const fired: string[] = []
    bus.on('timeline:action', (a: any) => fired.push(`${a.phaseId}:${a.use}`))
    const scheduler = new PhaseScheduler(bus, [
      { id: 'phase_default', trigger: { type: 'on_combat_start' }, actions: [{ at: 1000, action: 'use', use: 'a' }] },
    ])
    scheduler.update(1000)
    expect(fired).toEqual(['phase_default:a'])
  })
})
