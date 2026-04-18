// src/game/game-scene.ts
import { Engine } from '@babylonjs/core'
import { SceneManager } from '@/renderer/scene-manager'
import { ArenaRenderer } from '@/renderer/arena-renderer'
import { EntityRenderer } from '@/renderer/entity-renderer'
import { AoeRenderer } from '@/renderer/aoe-renderer'
import { HitEffectRenderer } from '@/renderer/hit-effect-renderer'
import { EventBus } from '@/core/event-bus'
import { EntityManager } from '@/entity/entity-manager'
import { GameLoop } from '@/core/game-loop'
import { SkillResolver } from '@/skill/skill-resolver'
import { BuffSystem } from '@/combat/buff'
import { tickPeriodicBuffs } from '@/combat/buff-periodic'
import { AoeZoneManager } from '@/skill/aoe-zone'
import { Arena } from '@/arena/arena'
import { InputManager } from '@/input/input-manager'
import { CameraController } from './camera-controller'
import { CombatResolver } from './combat-resolver'
import { PlayerInputDriver, type PlayerInputConfig } from './player-input-driver'
import { DisplacementAnimator } from './displacement-animator'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { COMMON_BUFFS } from '@/jobs/commons/buffs'
import type { ArenaDef, BuffDef } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { CreateEntityOptions } from '@/entity/entity'
import type { TimelineEntry } from '@/timeline/types'
import type { DamageLogEntry } from '@/game/types'
import type { SkillBarEntry } from '@/jobs/shared'

export interface GameSceneConfig {
  engine: Engine
  uiRoot: HTMLDivElement
  arena: ArenaDef
  playerInputConfig: PlayerInputConfig
  /** Called to restart this scene (for retry) */
  restart: () => void
}

/**
 * Shared game scene infrastructure. Owns all core systems, renderers, UI, and the game loop.
 * Subclass-like usage: create a GameScene, then use its public members to add entities and logic.
 */
export class GameScene {
  // Core systems
  readonly bus = new EventBus()
  readonly entityMgr = new EntityManager(this.bus)
  readonly buffSystem = new BuffSystem(this.bus)
  readonly zoneMgr: AoeZoneManager
  readonly skillResolver: SkillResolver
  readonly arena: Arena
  readonly gameLoop = new GameLoop()
  readonly combatResolver: CombatResolver
  readonly displacer: DisplacementAnimator

  // Rendering
  readonly sceneManager: SceneManager
  readonly entityRenderer: EntityRenderer
  readonly aoeRenderer: AoeRenderer
  readonly hitEffectRenderer: HitEffectRenderer

  // Input + Camera
  readonly input: InputManager
  readonly camera: CameraController
  playerDriver!: PlayerInputDriver

  // UI (only DevTerminal remains — rest migrated to Preact)
  readonly devTerminal: DevTerminal

  // State
  paused = false
  battleOver = false
  player!: Entity
  // Battle runtime state (migrated from ui/state signals)
  battleResult: 'victory' | 'wipe' | null = null
  announceText: string | null = null
  dialogText = ''
  timelineEntries: TimelineEntry[] = []
  currentPhaseInfo: { label: string; showLabel: boolean } | null = null
  damageLog: DamageLogEntry[] = []
  practiceMode = false
  skillBarEntries: SkillBarEntry[] = []
  buffDefs: Map<string, BuffDef> = new Map()
  private lastTime = performance.now()
  readonly config: GameSceneConfig

  /** Custom logic hook called each logic tick (after player update, before zone update) */
  onLogicTick: ((dt: number) => void) | null = null

  /** External hook called each render frame (for UI state adapter) */
  onRenderTick: ((delta: number) => void) | null = null

  /** Custom hook for combat elapsed time display. Return ms or null. */
  getCombatElapsed: (() => number | null) = () => null

  /** Reference entity for boss HP bar */
  bossEntity: Entity | null = null

  constructor(config: GameSceneConfig) {
    this.config = config

    this.arena = new Arena(config.arena)
    this.displacer = new DisplacementAnimator(this.arena)
    this.zoneMgr = new AoeZoneManager(this.bus, this.entityMgr)
    this.skillResolver = new SkillResolver(this.bus, this.entityMgr, this.buffSystem, this.zoneMgr)
    this.combatResolver = new CombatResolver(
      this.bus, this.entityMgr, this.buffSystem, this.arena,
      this.zoneMgr, this.displacer,
      () => this.gameLoop.logicTime,
    )

    // Rendering
    this.sceneManager = new SceneManager(config.engine)
    new ArenaRenderer(this.sceneManager.scene, config.arena, this.bus)
    this.entityRenderer = new EntityRenderer(this.sceneManager.scene, this.bus)
    this.aoeRenderer = new AoeRenderer(this.sceneManager.scene, this.bus, this.entityMgr)
    this.hitEffectRenderer = new HitEffectRenderer(this.sceneManager.scene, this.bus, this.entityRenderer)

    // Input + Camera
    this.input = new InputManager(
      config.engine.getRenderingCanvas()!,
      () => this.devTerminal?.isVisible() ?? false,
    )
    this.camera = new CameraController()

    // DevTerminal (only remaining vanilla UI)
    const registry = new CommandRegistry()
    if (import.meta.env.DEV) this.registerDevCommands(registry)
    this.devTerminal = new DevTerminal(this.bus, registry)
    this.devTerminal.mount(config.uiRoot)
  }

  /** Create player entity and bind input driver + camera */
  createPlayer(opts: CreateEntityOptions): Entity {
    this.player = this.entityMgr.create(opts)
    this.camera.follow(this.player)
    this.playerDriver = new PlayerInputDriver(
      this.player, this.input, this.skillResolver, this.buffSystem,
      this.entityMgr, this.bus, this.arena, this.config.playerInputConfig,
    )
    this.playerDriver.setDisplacer(this.displacer)
    return this.player
  }

  /** Watch for player death — ends the battle with 'wipe' result */
  watchPlayerDeath(): void {
    this.bus.on('damage:dealt', (payload: { target: Entity }) => {
      if (payload.target.id === this.player.id && payload.target.hp <= 0) {
        if (this.battleOver) return
        this.endBattle('wipe')
        this.bus.emit('combat:ended', { result: 'wipe' })
      }
    })
  }

  /** Start the game loop + render loop */
  start(): void {
    this.gameLoop.onUpdate((dt) => {
      if (this.paused || this.battleOver) return
      if (this.devTerminal.isVisible()) return

      const result = this.playerDriver.update(dt)
      if (result === 'pause') { this.pause(); return }

      // Tick all alive entities' buff durations + periodic effects in one pass
      const alive = this.entityMgr.getAlive()
      for (const e of alive) {
        this.buffSystem.update(e, dt)
      }
      tickPeriodicBuffs(alive, this.gameLoop.logicTime, this.buffSystem)

      this.onLogicTick?.(dt)

      this.displacer.update(dt)
      this.zoneMgr.update(dt)
    })

    this.sceneManager.startRenderLoop(() => {
      const now = performance.now()
      const delta = now - this.lastTime
      this.lastTime = now

      const mousePos = this.sceneManager.pickGroundPosition()
      if (mousePos) this.input.updateMouseWorldPos(mousePos)
      this.gameLoop.tick(delta)

      const camPos = this.camera.update(delta)
      const fallOffset = (this.player as any)?._fallOffset ?? 0
      this.sceneManager.setCameraTarget(camPos.x, camPos.y, fallOffset)
      this.sceneManager.updateRoll(delta)
      this.entityRenderer.updateAll(this.entityMgr.getAlive(), this.player?.target)
      this.aoeRenderer.update(now)
      this.hitEffectRenderer.update(delta, (id) => this.entityMgr.get(id))

      this.onRenderTick?.(delta)
    })
  }

  /** Set pause state */
  pause(): void { this.paused = true }

  /** Clear pause state */
  resume(): void { this.paused = false }

  /** Toggle pause state */
  togglePause(): void { this.paused = !this.paused }

  /** Mark battle ended with a result */
  endBattle(result: 'victory' | 'wipe'): void {
    this.battleOver = true
    this.battleResult = result
  }

  /** Set combat announce text (null clears) */
  setAnnounce(text: string | null): void { this.announceText = text }

  /** Set dialog text */
  setDialog(text: string): void { this.dialogText = text }

  /** Dispose all resources */
  dispose(): void {
    this.sceneManager.dispose()
    this.input.dispose()
  }

  /** Register dev-mode-only debug commands. Gated by import.meta.env.DEV at caller. */
  private registerDevCommands(registry: CommandRegistry): void {
    registry.register('opm', '[dev] Apply 一拳超人 buff (+999% damage) to player', () => {
      if (!this.player) return 'Player not spawned yet.'
      const buff = COMMON_BUFFS.one_punch_man
      this.combatResolver.registerBuffs({ one_punch_man: buff })
      this.buffSystem.applyBuff(this.player, buff, 'devtools')
      return `Applied ${buff.name}: ${buff.description}`
    })
  }
}
