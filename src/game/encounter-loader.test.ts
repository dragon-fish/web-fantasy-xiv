import { describe, it, expect } from 'vitest'
import { parseEncounterYaml } from '@/game/encounter-loader'

const MINIMAL_YAML = `
arena:
  name: Test
  shape: circle
  radius: 10
  boundary: wall

boss:
  hp: 100000
  attack: 1
  speed: 3
  size: 2
  facing: 180

player:
  hp: 30000
  attack: 1000

boss_ai:
  chaseRange: 5
  autoAttackRange: 15
  autoAttackInterval: 3000

skills:
  slash:
    name: Slash
    type: spell
    castTime: 2000
    targetType: aoe
    zones:
      - anchor: { type: caster }
        direction: { type: fixed, angle: 180 }
        shape: { type: fan, radius: 8, angle: 90 }
        resolveDelay: 2000
        hitEffectDuration: 500
        effects: [{ type: damage, potency: 5000 }]

timeline:
  - at: 1000
    use: slash
  - at: 5000
    use: slash
  - at: 10000
    action: enable_ai
`

describe('parseEncounterYaml', () => {
  it('should parse arena', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.arena.name).toBe('Test')
    expect(data.arena.shape).toEqual({ type: 'circle', radius: 10 })
  })

  it('should parse boss entity', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.boss.hp).toBe(100000)
    expect(data.boss.facing).toBe(180)
    expect(data.boss.type).toBe('boss')
    // Also available in entities map
    expect(data.entities.get('boss')).toBe(data.boss)
  })

  it('should parse player overrides', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.player.hp).toBe(30000)
    expect(data.player.attack).toBe(1000)
  })

  it('should parse skills', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.skills.size).toBe(1)
    const slash = data.skills.get('slash')!
    expect(slash.name).toBe('Slash')
    expect(slash.type).toBe('spell')
    expect(slash.zones).toHaveLength(1)
  })

  it('should parse and flatten timeline', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.timeline).toHaveLength(3)
    expect(data.timeline[0]).toEqual({ at: 1000, action: 'use', use: 'slash' })
    expect(data.timeline[2]).toEqual({ at: 10000, action: 'enable_ai', entity: undefined })
  })

  it('should auto-create phase_default from flat timeline', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.phases).toHaveLength(1)
    expect(data.phases[0].id).toBe('phase_default')
    expect(data.phases[0].trigger).toEqual({ type: 'on_combat_start' })
    expect(data.phases[0].actions).toEqual(data.timeline)
  })

  it('should parse boss_ai config', () => {
    const data = parseEncounterYaml(MINIMAL_YAML)
    expect(data.bossAI.chaseRange).toBe(5)
    expect(data.bossAI.autoAttackRange).toBe(15)
  })

  it('should parse unified entities format', () => {
    const yaml = `
arena:
  name: Test
  shape: circle
  radius: 10
  boundary: wall

entities:
  boss:
    type: boss
    hp: 80000
    attack: 1
    speed: 4
    size: 1.5
    facing: 180
  mob_a:
    type: mob
    group: adds_wave1
    hp: 5000
    attack: 1
    visible: false
    targetable: false
    position: { x: 5, y: 0 }

player:
  hp: 50000
  attack: 1000

skills: {}
timeline: []
`
    const data = parseEncounterYaml(yaml)
    expect(data.entities.size).toBe(2)
    expect(data.boss.type).toBe('boss')
    expect(data.boss.hp).toBe(80000)

    const mob = data.entities.get('mob_a')!
    expect(mob.type).toBe('mob')
    expect(mob.group).toBe('adds_wave1')
    expect(mob.visible).toBe(false)
    expect(mob.targetable).toBe(false)
    expect(mob.position).toEqual({ x: 5, y: 0 })
  })
})

describe('encounter-loader local_buffs', () => {
  it('parses local_buffs section into localBuffs map', () => {
    const yaml = `
arena: { name: test, shape: circle, radius: 15, boundary: wall }
entities: {}
player: {}
boss_ai: {}
skills: {}
local_buffs:
  test_enrage:
    name: 测试愤怒
    type: buff
    stackable: true
    maxStacks: 20
    duration: 999999
    effects:
      - { type: damage_increase, value: 0.15 }
`
    const data = parseEncounterYaml(yaml)
    expect(data.localBuffs).toBeDefined()
    expect(data.localBuffs!.test_enrage).toBeDefined()
    expect(data.localBuffs!.test_enrage.stackable).toBe(true)
    expect(data.localBuffs!.test_enrage.maxStacks).toBe(20)
    expect(data.localBuffs!.test_enrage.effects).toEqual([{ type: 'damage_increase', value: 0.15 }])
  })

  it('returns empty localBuffs when section missing', () => {
    const yaml = `
arena: { name: test, shape: circle, radius: 15, boundary: wall }
entities: {}
player: {}
boss_ai: {}
skills: {}
`
    const data = parseEncounterYaml(yaml)
    expect(data.localBuffs).toBeDefined()
    expect(Object.keys(data.localBuffs!).length).toBe(0)
  })
})
