import { Engine } from '@babylonjs/core'
import { GameScene } from '@/game/game-scene'
import { BossBehavior } from '@/ai/boss-behavior'
import { PhaseScheduler } from '@/timeline/phase-scheduler'
import { loadEncounter } from '@/game/encounter-loader'
import { DeathZoneManager } from '@/arena/death-zone-manager'
import { DEMO_SKILLS, AUTO_ATTACK, SKILL_DASH, SKILL_BACKSTEP } from './demo-skills'
import { DEMO_BUFFS } from './demo-buffs'
import { announceText, battleResult, damageLog, combatElapsed as combatElapsedSignal, timelineEntries, type TimelineEntry } from '@/ui/state'
import type { TimelineAction } from '@/config/schema'
import type { Entity } from '@/entity/entity'
import type { EncounterData } from '@/game/encounter-loader'

let scene: GameScene | null = null

export function disposeActiveScene(): void {
  scene?.dispose()
  scene = null
}

export function getActiveScene(): GameScene | null {
  return scene
}

export async function startTimelineDemo(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLDivElement,
  encounterUrl?: string,
): Promise<void> {
  scene?.dispose()

  const loading = document.createElement('div')
  loading.style.cssText = `
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.9); z-index: 200;
    color: #888; font-size: 16px; letter-spacing: 2px;
  `
  loading.textContent = 'Loading...'
  uiRoot.appendChild(loading)

  const url = encounterUrl ?? `${import.meta.env.BASE_URL}encounters/timeline-test.yaml`

  try {
    const encounter = await loadEncounter(url)
    loading.remove()
    initScene(canvas, uiRoot, encounter, url)
  } catch (err) {
    loading.textContent = `Failed to load encounter: ${err}`
    loading.style.color = '#ff4444'
  }
}

function initScene(canvas: HTMLCanvasElement, uiRoot: HTMLDivElement, enc: EncounterData, encounterUrl: string): void {
  const engine = Engine.Instances.find(e => e.getRenderingCanvas() === canvas) as Engine | undefined
  if (!engine) throw new Error('No Engine found for canvas')

  scene = new GameScene({
    engine, uiRoot, arena: enc.arena,
    playerInputConfig: {
      skills: DEMO_SKILLS,
      extraSkills: new Map([[100, SKILL_DASH], [101, SKILL_BACKSTEP]]),
      autoAttackSkill: AUTO_ATTACK,
      autoAttackInterval: 3000,
    },
    restart: () => startTimelineDemo(canvas, uiRoot, encounterUrl),
  })

  const s = scene

  s.createPlayer({
    id: 'player', type: 'player',
    position: { x: 0, y: -12, z: 0 },
    ...enc.player,
  })

  // Create all entities from encounter data
  const entityMap = new Map<string, Entity>()
  const aiMap = new Map<string, BossBehavior>()
  const aiEnabled = new Set<string>()

  for (const [id, opts] of enc.entities) {
    const entity = s.entityMgr.create(opts)
    entityMap.set(id, entity)

    // Boss entity shortcut
    if (id === 'boss') s.bossEntity = entity

    // Create AI for boss/mob type entities
    if (opts.type === 'boss' || opts.type === 'mob') {
      const ai = new BossBehavior(entity, id === 'boss' ? enc.bossAI : {})
      ai.lockFacing(entity.facing)
      aiMap.set(id, ai)
    }
  }

  const boss = entityMap.get('boss')!
  s.combatResolver.registerBuffs(DEMO_BUFFS)

  let combatStarted = false
  const bossAutoSkill = enc.skills.get('boss_auto')
  const scheduler = new PhaseScheduler(s.bus, enc.phases)
  const deathZoneMgr = new DeathZoneManager(s.bus)
  if (enc.arena.deathZones) deathZoneMgr.loadInitial(enc.arena.deathZones)

  // Helper: resolve entity from action (default: boss)
  function resolveEntity(action: TimelineAction): Entity | undefined {
    return action.entity ? entityMap.get(action.entity) : boss
  }

  // Engage
  function engageCombat() {
    if (combatStarted) return
    combatStarted = true
    s.player.inCombat = true
    boss.inCombat = true
    announceText.value = '战斗开始'
    s.bus.emit('combat:started', { entities: [s.player, boss] })
  }

  s.bus.on('damage:dealt', (payload: { source: Entity; target: Entity; amount: number; skill: any }) => {
    if (payload.target.id === boss.id && !combatStarted) engageCombat()
    // Check victory: boss dead
    if (payload.target.id === boss.id && payload.target.hp <= 0) {
      if (!s.battleOver) {
        s.battleOver = true
        s.bus.emit('combat:ended', { result: 'victory' })
        battleResult.value = 'victory'
      }
    }
    // Check player dead
    if (payload.target.id === s.player.id && payload.target.hp <= 0) {
      if (!s.battleOver) {
        s.battleOver = true
        s.bus.emit('combat:ended', { result: 'wipe' })
        battleResult.value = 'wipe'
      }
    }
    // Mob death: destroy entity when hp reaches 0
    if (payload.target.type === 'mob' && payload.target.hp <= 0 && payload.target.alive) {
      s.entityMgr.destroy(payload.target.id)
    }
    // Damage log for death recap HUD
    if (payload.target.id === s.player.id && payload.amount > 0) {
      const elapsed = combatStarted ? scheduler.combatElapsed : 0
      const mitigations = s.buffSystem.getMitigations(payload.target)
      const totalMit = mitigations.length > 0
        ? 1 - mitigations.reduce((acc: number, v: number) => acc * (1 - v), 1)
        : 0
      const log = damageLog.value
      damageLog.value = [...log.slice(-19), {
        time: elapsed,
        sourceName: payload.source?.id ?? '?',
        skillName: payload.skill?.name ?? '自动攻击',
        amount: payload.amount,
        hpAfter: payload.target.hp,
        mitigation: totalMit,
      }]
    }
  })

  // Generic mob death cleanup: clear stale target + cancel orphan AOE zones
  s.bus.on('entity:died', (payload: { entity: Entity }) => {
    const dead = payload.entity
    if (s.player.target === dead.id) {
      s.player.target = null
      s.bus.emit('target:released', { entity: s.player })
    }
    s.zoneMgr.cancelAllByCaster(dead.id)
  })

  // Timeline actions
  s.bus.on('timeline:action', (action: TimelineAction) => {
    if (s.battleOver) return
    const target = resolveEntity(action)

    switch (action.action) {
      case 'use':
        if (action.use && target) {
          // Ensure mobs target player so toward_target AOE works
          if (target.type === 'mob' || target.type === 'boss') target.target = s.player.id
          const skill = enc.skills.get(action.use)
          if (skill) s.skillResolver.tryUse(target, skill)
        }
        break
      case 'lock_facing':
        if (action.facing != null && target) {
          const ai = aiMap.get(target.id)
          ai?.lockFacing(action.facing)
        }
        break
      case 'enable_ai':
        if (target) {
          aiEnabled.add(target.id)
          const ai = aiMap.get(target.id)
          ai?.unlockFacing()
          target.target = s.player.id
        }
        break
      case 'disable_ai':
        if (target) aiEnabled.delete(target.id)
        break
      case 'teleport':
        if (target && action.position) {
          s.displacer.start(target, action.position.x, action.position.y, 400)
        }
        break
      case 'set_visible':
        if (target) target.visible = action.value ?? true
        break
      case 'set_targetable':
        if (target) {
          target.targetable = action.value ?? true
          // Clear player target if entity becomes untargetable
          if (!target.targetable && s.player.target === target.id) {
            s.player.target = null
            s.bus.emit('target:released', { entity: s.player })
          }
        }
        break
      case 'add_death_zone':
        if (action.deathZone) {
          deathZoneMgr.add({
            id: action.deathZone.id,
            center: { x: action.deathZone.center.x, y: action.deathZone.center.y },
            facing: action.deathZone.facing ?? 0,
            shape: action.deathZone.shape,
          })
        }
        break
      case 'remove_death_zone':
        if (action.deathZoneId) deathZoneMgr.remove(action.deathZoneId)
        break
      case 'camera_roll':
        if (action.angle != null) {
          s.sceneManager.rollCamera(action.angle, action.snapMs ?? 150, action.returnMs ?? 1500)
        }
        break
    }
  })

  s.getCombatElapsed = () => combatStarted ? scheduler.combatElapsed : null

  const DEATH_ZONE_DAMAGE = 999999
  const FALL_DURATION = 600 // ms to fall before dying
  let falling = false
  let fallElapsed = 0
  let fallReason = ''

  s.onLogicTick = (dt) => {
    if (!combatStarted) {
      const bossAI = aiMap.get('boss')
      if (bossAI?.checkAggro(s.player)) engageCombat()
    }
    if (combatStarted) {
      scheduler.checkTriggers({
        allKilledInGroup: (group) => {
          const alive = s.entityMgr.getAlive()
          return !alive.some((e) => e.group === group)
        },
      })
      scheduler.update(dt)
      combatElapsedSignal.value = scheduler.combatElapsed
    } else {
      combatElapsedSignal.value = null
    }

    // Falling animation (triggered by death zone / out of bounds)
    if (falling) {
      fallElapsed += dt
      // Accelerating fall: quadratic ease-in
      const t = Math.min(fallElapsed / FALL_DURATION, 1)
      ;(s.player as any)._fallOffset = t * t * 8 // fall up to 8 units deep

      if (fallElapsed >= FALL_DURATION) {
        falling = false
        s.player.hp -= DEATH_ZONE_DAMAGE
        s.bus.emit('damage:dealt', {
          source: { id: '场地' } as any, target: s.player,
          amount: DEATH_ZONE_DAMAGE,
          skill: { name: fallReason },
        })
      }
      return // freeze game logic while falling
    }

    // Out-of-bounds: fall off the edge
    if (s.player.alive && !falling) {
      const pos = { x: s.player.position.x, y: s.player.position.y }
      if (s.arena.def.boundary === 'lethal' && !s.arena.isInBounds(pos)) {
        falling = true
        fallElapsed = 0
        fallReason = '场外坠落'
        ;(s.player as any)._fallOffset = 0
      }
    }

    // Death zone: instant kill (no fall animation)
    if (s.player.alive && !falling) {
      const pos = { x: s.player.position.x, y: s.player.position.y }
      if (deathZoneMgr.isInAnyZone(pos)) {
        s.player.hp -= DEATH_ZONE_DAMAGE
        s.bus.emit('damage:dealt', {
          source: { id: '场地' } as any, target: s.player,
          amount: DEATH_ZONE_DAMAGE,
          skill: { name: '死亡区域' },
        })
      }
    }

    // Update AI for all enabled entities
    for (const entityId of aiEnabled) {
      const entity = entityMap.get(entityId)
      const ai = aiMap.get(entityId)
      if (!entity?.alive || !ai || entity.casting) continue

      ai.updateFacing(s.player)
      ai.updateMovement(s.player, dt)

      if (bossAutoSkill && ai.tickAutoAttack(dt) && ai.isInAutoAttackRange(s.player)) {
        entity.target = s.player.id
        s.skillResolver.tryUse(entity, bossAutoSkill)
      }
    }

    updateTimelineSignal(dt, scheduler, enc.skills)
  }

  s.start()
}

const TIMELINE_WINDOW_MS = 30000
const TIMELINE_MAX_ENTRIES = 5
const TIMELINE_FLASH_DURATION = 1000

function updateTimelineSignal(dt: number, scheduler: PhaseScheduler, skillMap: Map<string, import('@/core/types').SkillDef>): void {
  const elapsed = scheduler.combatElapsed
  const allActions = scheduler.getAllActions()
  const upcoming: TimelineEntry[] = []

  for (const { action, phaseId, absoluteAt } of allActions) {
    if (action.action !== 'use' || !action.use) continue
    const skill = skillMap.get(action.use)
    if (!skill) continue

    const timeUntil = absoluteAt - elapsed
    if (timeUntil > TIMELINE_WINDOW_MS) continue
    if (timeUntil < -TIMELINE_FLASH_DURATION - (skill.castTime || 0)) continue

    const key = `${phaseId}_${action.at}_${action.use}_${action.entity ?? ''}`
    const isInstant = skill.type !== 'spell' || skill.castTime === 0

    let state: 'upcoming' | 'casting' | 'flash' = 'upcoming'
    let flashElapsed = 0

    if (timeUntil <= 0) {
      if (isInstant) {
        state = 'flash'
      } else if (-timeUntil < skill.castTime) {
        state = 'casting'
      } else {
        state = 'flash'
      }
    }

    // Carry over flash elapsed from previous frame
    const prev = timelineEntries.value.find((e) => e.key === key)
    if (state === 'flash') {
      flashElapsed = prev?.state === 'flash' ? prev.flashElapsed + dt : 0
    }

    if (flashElapsed < TIMELINE_FLASH_DURATION) {
      upcoming.push({ key, skillName: skill.name, state, timeUntil, castTime: skill.castTime, flashElapsed })
    }
  }

  upcoming.sort((a, b) => a.timeUntil - b.timeUntil)
  timelineEntries.value = upcoming.slice(0, TIMELINE_MAX_ENTRIES)
}
