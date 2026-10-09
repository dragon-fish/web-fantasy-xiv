import type { BuffDef } from '@/core/types'
import { pickControlStatus } from './control-status'

const def = (id: string, effects: BuffDef['effects'], duration = 3000): BuffDef =>
  ({ id, name: id, type: 'debuff', duration, stackable: false, maxStacks: 1, effects })

const defs: Record<string, BuffDef> = {
  launch: def('launch', [{ type: 'stun' }]),
  march: def('march', [{ type: 'stun' }], 9000),
  mute: def('mute', [{ type: 'silence' }]),
  vuln: def('vuln', [{ type: 'vulnerability', value: 0.1 }], 90000),
}
const at = (defId: string, remaining: number) => ({ defId, sourceId: 'x', remaining, stacks: 1 })

describe('pickControlStatus', () => {
  it('ignores debuffs that do not block input', () => {
    expect(pickControlStatus([at('vuln', 80000)], id => defs[id])).toBeNull()
  })

  it('reports the input-blocking debuff that lasts longest', () => {
    const s = pickControlStatus([at('launch', 1000), at('march', 6000), at('mute', 2000)], id => defs[id])
    expect(s?.defId).toBe('march')
    expect(s?.total).toBe(9500)
  })

  it('never reports a countdown above full when the duration was overridden', () => {
    expect(pickControlStatus([at('launch', 8000)], id => defs[id])?.total).toBe(8000)
  })
})
