// src/timeline/timeline-parser.test.ts
import { describe, it, expect } from 'vitest'
import { flattenTimeline, parsePhases } from '@/timeline/timeline-parser'

describe('flattenTimeline', () => {
  it('should pass through flat entries', () => {
    const raw = [
      { at: 0, use: 'slash' },
      { at: 8000, use: 'raidwide' },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ at: 0, action: 'use', use: 'slash' })
    expect(result[1]).toEqual({ at: 8000, action: 'use', use: 'raidwide' })
  })

  it('should flatten then/after into absolute times', () => {
    const raw = [
      {
        at: 18000,
        use: 'left_right_cleave',
        then: [
          { after: 3000, use: 'raidwide' },
          { after: 5000, use: 'iron_chariot' },
        ],
      },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ at: 18000, action: 'use', use: 'left_right_cleave' })
    expect(result[1]).toEqual({ at: 21000, action: 'use', use: 'raidwide' })
    expect(result[2]).toEqual({ at: 23000, action: 'use', use: 'iron_chariot' })
  })

  it('should handle nested then/after', () => {
    const raw = [
      {
        at: 10000,
        use: 'a',
        then: [
          {
            after: 2000,
            use: 'b',
            then: [
              { after: 1000, use: 'c' },
            ],
          },
        ],
      },
    ]
    const result = flattenTimeline(raw)
    expect(result).toHaveLength(3)
    expect(result[0].at).toBe(10000)
    expect(result[1].at).toBe(12000)
    expect(result[2].at).toBe(13000)
  })

  it('should sort by absolute time', () => {
    const raw = [
      { at: 5000, use: 'b' },
      { at: 1000, use: 'a' },
    ]
    const result = flattenTimeline(raw)
    expect(result[0].at).toBe(1000)
    expect(result[1].at).toBe(5000)
  })

  it('should handle non-use actions', () => {
    const raw = [
      { at: 60000, action: 'switch_arena', arena: 'broken' },
      { at: 62000, action: 'spawn_entity', entity: 'add1', position: { x: 10, y: 0 } },
    ]
    const result = flattenTimeline(raw)
    expect(result[0]).toMatchObject({ at: 60000, action: 'switch_arena', arena: 'broken' })
    expect(result[1]).toMatchObject({
      at: 62000, action: 'spawn_entity',
      spawnId: 'add1', spawnType: 'mob', spawnGroup: 'mob',
      position: { x: 10, y: 0 },
    })
  })
})

describe('parsePhases', () => {
  it('should wrap flat timeline as phase_default when no phases defined', () => {
    const timeline = [
      { at: 0, use: 'slash' },
      { at: 5000, use: 'raidwide' },
    ]
    const phases = parsePhases(undefined, timeline)
    expect(phases).toHaveLength(1)
    expect(phases[0].id).toBe('phase_default')
    expect(phases[0].trigger).toEqual({ type: 'on_combat_start' })
    expect(phases[0].actions).toHaveLength(2)
  })

  it('should parse object-format phases', () => {
    const rawPhases = {
      phase_default: {
        actions: [{ at: 0, use: 'slash' }],
      },
      phase_adds: {
        trigger: { on_all_killed: { group: 'adds_group1' } },
        actions: [{ at: 0, use: 'big_attack' }],
      },
      phase_enrage: {
        trigger: { on_hp_below: { group: 'boss', percent: 10 } },
        actions: [{ at: 0, use: 'enrage' }],
      },
    }
    const phases = parsePhases(rawPhases)
    expect(phases).toHaveLength(3)

    expect(phases[0].id).toBe('phase_default')
    expect(phases[0].trigger).toEqual({ type: 'on_combat_start' })

    expect(phases[1].id).toBe('phase_adds')
    expect(phases[1].trigger).toEqual({ type: 'on_all_killed', group: 'adds_group1' })

    expect(phases[2].id).toBe('phase_enrage')
    expect(phases[2].trigger).toEqual({ type: 'on_hp_below', group: 'boss', percent: 10 })
  })

  it('should default to manual if trigger is missing, except phase_default', () => {
    const rawPhases = {
      phase_default: { actions: [] },
      some_phase: { actions: [] },
    }
    const phases = parsePhases(rawPhases)
    // phase_default always gets on_combat_start
    expect(phases[0].trigger.type).toBe('on_combat_start')
    // non-default without trigger defaults to manual
    expect(phases[1].trigger.type).toBe('manual')
  })
})
