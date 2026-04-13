// src/game/game-scene.ts
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
import { AoeZoneManager } from '@/skill/aoe-zone'
import { Arena } from '@/arena/arena'
import { InputManager } from '@/input/input-manager'
import { CameraController } from './camera-controller'
import { CombatResolver } from './combat-resolver'
import { PlayerInputDriver, type PlayerInputConfig } from './player-input-driver'
import { DisplacementAnimator } from './displacement-animator'
import { UIManager, type SkillBarEntry } from '@/ui/ui-manager'
import { PauseMenu } from '@/ui/pause-menu'
import { DevTerminal } from '@/devtools/dev-terminal'
import { CommandRegistry } from '@/devtools/commands'
import { DebugInfo } from '@/ui/debug-info'
import { CombatAnnounce } from '@/ui/combat-announce'
import type { ArenaDef } from '@/core/types'
import type { Entity } from '@/entity/entity'
import type { CreateEntityOptions } from '@/entity/entity'

export interface GameSceneConfig {
  canvas: HTMLCanvasElement
  uiRoot: HTMLDivElement
  arena: ArenaDef
  playerInputConfig: PlayerInputConfig
  skillBarEntries: SkillBarEntry[]
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

  // UI
  readonly uiManager: UIManager
  readonly pauseMenu: PauseMenu
  readonly devTerminal: DevTerminal
  readonly debugInfo: DebugInfo
  readonly announce: CombatAnnounce

  // State
  paused = false
  battleOver = false
  player!: Entity
  private lastTime = performance.now()
  private onResizeHandler: () => void
  private config: GameSceneConfig

  /** Custom logic hook called each logic tick (after player update, before zone update) */
  onLogicTick: ((dt: number) => void) | null = null

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
    this.combatResolver = new CombatResolver(this.bus, this.entityMgr, this.buffSystem, this.arena, this.zoneMgr, this.displacer)

    // Rendering
    this.sceneManager = new SceneManager(config.canvas)
    new ArenaRenderer(this.sceneManager.scene, config.arena)
    this.entityRenderer = new EntityRenderer(this.sceneManager.scene, this.bus)
    this.aoeRenderer = new AoeRenderer(this.sceneManager.scene, this.bus, this.entityMgr)
    this.hitEffectRenderer = new HitEffectRenderer(this.sceneManager.scene, this.bus, this.entityRenderer)

    // Input + Camera
    this.input = new InputManager(config.canvas)
    this.camera = new CameraController()

    // UI
    this.uiManager = new UIManager(config.uiRoot, this.bus, config.skillBarEntries)
    this.uiManager.bindScene(this.sceneManager)
    this.uiManager.bindBuffSystem(this.buffSystem)
    this.pauseMenu = new PauseMenu(config.uiRoot)
    this.devTerminal = new DevTerminal(this.bus, new CommandRegistry())
    this.devTerminal.mount(config.uiRoot)
    this.debugInfo = new DebugInfo(config.uiRoot)
    this.announce = new CombatAnnounce(config.uiRoot)

    // Pause menu
    this.pauseMenu.onResumeGame(() => { this.paused = false; this.pauseMenu.hide() })
    this.pauseMenu.onRetryGame(() => config.restart())
    this.pauseMenu.onQuitGame(() => window.location.reload())

    // Resize
    this.onResizeHandler = () => this.sceneManager.engine.resize()
    window.addEventListener('resize', this.onResizeHandler)
  }

  /** Create player entity and bind input driver + camera */
  createPlayer(opts: CreateEntityOptions): Entity {
    this.player = this.entityMgr.create(opts)
    this.camera.follow(this.player)
    this.playerDriver = new PlayerInputDriver(
      this.player, this.input, this.skillResolver, this.buffSystem,
      this.entityMgr, this.bus, this.arena, this.config.playerInputConfig,
    )
    return this.player
  }

  /** Show defeat overlay with retry */
  onBattleEnd(result: 'victory' | 'wipe'): void {
    if (this.battleOver) return
    this.battleOver = true
    this.bus.emit('combat:ended', { result })

    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.6); z-index: 80; cursor: pointer;
    `
    const text = document.createElement('h2')
    text.textContent = result === 'wipe' ? 'DEFEATED' : 'VICTORY'
    text.style.cssText = `
      font-size: 32px; color: ${result === 'wipe' ? '#ff4444' : '#44ff44'};
      font-weight: 300; letter-spacing: 6px; margin-bottom: 20px;
    `
    overlay.appendChild(text)
    const hint = document.createElement('p')
    hint.textContent = 'Click to retry'
    hint.style.cssText = 'font-size: 14px; color: #888;'
    overlay.appendChild(hint)
    overlay.addEventListener('click', () => this.config.restart())
    this.config.uiRoot.appendChild(overlay)
  }

  /** Watch for player death */
  watchPlayerDeath(): void {
    this.bus.on('damage:dealt', (payload: { target: Entity }) => {
      if (payload.target.id === this.player.id && payload.target.hp <= 0) {
        this.onBattleEnd('wipe')
      }
    })
  }

  /** Start the game loop + render loop */
  start(): void {
    this.gameLoop.onUpdate((dt) => {
      if (this.paused || this.battleOver) return
      if (this.devTerminal.isVisible()) return

      const result = this.playerDriver.update(dt)
      if (result === 'pause') { this.paused = true; this.pauseMenu.show(); return }

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
      this.sceneManager.setCameraTarget(camPos.x, camPos.y)
      this.entityRenderer.updateAll(this.entityMgr.getAlive())
      this.aoeRenderer.update(now)
      this.hitEffectRenderer.update(delta, (id) => this.entityMgr.get(id))

      const bossForUI = this.bossEntity ?? this.player
      this.uiManager.update(this.player, bossForUI, (sid) => this.skillResolver.getCooldown(this.player.id, sid))
      this.debugInfo.update(delta, this.player, this.getCombatElapsed())
    })
  }

  /** Dispose all resources */
  dispose(): void {
    this.sceneManager.dispose()
    this.input.dispose()
    window.removeEventListener('resize', this.onResizeHandler)
    while (this.config.uiRoot.firstChild) this.config.uiRoot.removeChild(this.config.uiRoot.firstChild)
  }
}
