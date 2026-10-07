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
