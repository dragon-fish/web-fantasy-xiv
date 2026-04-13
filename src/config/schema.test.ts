import { describe, it, expect } from 'vitest'
import { parseArenaConfig, parseEntityConfig, parseSkillConfig, parseTimelineConfig } from '@/config/schema'

describe('parseArenaConfig', () => {
  it('should parse circle arena', () => {
    const raw = { name: '圆形竞技场', shape: 'circle', radius: 20, boundary: 'lethal' }
    const arena = parseArenaConfig(raw)
    expect(arena.name).toBe('圆形竞技场')
    expect(arena.shape).toEqual({ type: 'circle', radius: 20 })
    expect(arena.boundary).toBe('lethal')
  })

  it('should parse rect arena', () => {
    const raw = { name: '方形竞技场', shape: 'rect', width: 40, height: 30, boundary: 'wall' }
    const arena = parseArenaConfig(raw)
    expect(arena.shape).toEqual({ type: 'rect', width: 40, height: 30 })
  })
})

describe('parseEntityConfig', () => {
  it('should parse boss entity', () => {
    const raw = {
      name: '试炼BOSS', type: 'boss', model: 'models/boss.glb',
      size: 2, hp: 100000, attack: 1,
      autoAttackInterval: 3000, autoAttackRange: 5,
      skills: ['melee/heavy_swing', 'aoe/left_right_cleave'],
    }
    const entity = parseEntityConfig(raw)
    expect(entity.name).toBe('试炼BOSS')
    expect(entity.type).toBe('boss')
    expect(entity.hp).toBe(100000)
    expect(entity.skills).toEqual(['melee/heavy_swing', 'aoe/left_right_cleave'])
  })
})

describe('parseSkillConfig', () => {
  it('should parse single target weaponskill', () => {
    const raw = {
      id: 'melee/slash', name: 'Slash', type: 'weaponskill',
      castTime: 0, cooldown: 0, gcd: true,
      targetType: 'single', range: 5,
      effects: [{ type: 'damage', potency: 2 }],
    }
    const skill = parseSkillConfig(raw)
    expect(skill.type).toBe('weaponskill')
    expect(skill.effects).toHaveLength(1)
  })

  it('should parse aoe skill with zones', () => {
    const raw = {
      id: 'aoe/slam', name: 'Slam', type: 'ability',
      castTime: 0, cooldown: 0, gcd: false,
      targetType: 'aoe', range: 0,
      zones: [{
        anchor: { type: 'caster' },
        direction: { type: 'none' },
        shape: { type: 'circle', radius: 8 },
        resolveDelay: 3000,
        hitEffectDuration: 500,
        effects: [{ type: 'damage', potency: 5000 }],
      }],
    }
    const skill = parseSkillConfig(raw)
    expect(skill.zones).toHaveLength(1)
    expect(skill.zones![0].shape).toEqual({ type: 'circle', radius: 8 })
  })
})

describe('parseTimelineConfig', () => {
  it('should parse timeline with arenas, entities, and actions', () => {
    const raw = {
      arenas: { default: 'arenas/round' },
      entities: { boss: 'entities/boss1' },
      local_skills: {},
      timeline: [
        { at: 0, use: 'melee/slash' },
        { at: 8000, use: 'aoe/slam' },
      ],
      enrage: { time: 600000, castTime: 10000, skill: 'enrage_blast' },
    }
    const tl = parseTimelineConfig(raw)
    expect(tl.arenas.default).toBe('arenas/round')
    expect(tl.timeline).toHaveLength(2)
    expect(tl.enrage.time).toBe(600000)
  })
})
