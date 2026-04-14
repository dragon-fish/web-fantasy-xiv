import { useEffect, useRef, useState, useCallback } from 'preact/hooks'
import { useRoute, useLocation } from 'preact-iso'
import { useEngine } from '../engine-context'
import { createStateAdapter } from '../state-adapter'
import { startTimelineDemo, getActiveScene, disposeActiveScene } from '@/demo/demo-timeline'
import { resetState, skillBarEntries as skillBarEntriesSignal, buffDefs as buffDefsSignal, selectedJobId, tooltipContext } from '../state'
import { getJob } from '@/demo/player-job'
import { BossHpBar, PlayerHpBar, PlayerMpBar } from './HpBar'
import { PlayerCastBar, BossCastBar } from './CastBar'
import { SkillBar } from './SkillBar'
import { BuffBar } from './BuffBar'
import { DamageFloater } from './DamageFloater'
import { CombatAnnounce } from './CombatAnnounce'
import { DialogBox } from './DialogBox'
import { PauseMenu } from './PauseMenu'
import { BattleEndOverlay } from './BattleEndOverlay'
import { DebugInfo } from './DebugInfo'
import { SidePanel } from './TimelineDisplay'
import { Tooltip } from './Tooltip'
import { SkillPanel, toggleSkillPanel, useSkillPanelKey } from './SkillPanel'

function SkillPanelButton() {
  return (
    <div
      style={{
        position: 'absolute', bottom: 74, left: '50%',
        transform: 'translateX(calc(-50% + 180px))',
        pointerEvents: 'auto', cursor: 'pointer',
        width: 24, height: 24,
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, color: '#aaa',
      }}
      title="技能一览 (P)"
      onClick={toggleSkillPanel}
    >
      ?
    </div>
  )
}

export function GameView() {
  useSkillPanelKey()
  const { params } = useRoute()
  const { canvas } = useEngine()
  const uiRef = useRef<HTMLDivElement>(null)
  const [gameKey, setGameKey] = useState(0)

  const isTutorial = params.id === 'tutorial'

  useEffect(() => {
    const uiRoot = uiRef.current!
    const id = params.id
    const base = import.meta.env.BASE_URL
    const encounterUrl = `${base}encounters/${id}.yaml`

    // Tutorial locks job to Adventurer (temporary, don't change saved selection)
    // Edge case: if selected job is invalid, save 'default' to localStorage
    let job = getJob(selectedJobId.value)
    if (isTutorial) {
      job = getJob('default')
    } else if (job.id === 'default' && selectedJobId.value !== 'default') {
      // Invalid job ID stored — fix it
      selectedJobId.value = 'default'
      localStorage.setItem('xiv-selected-job', 'default')
    }

    // Set skill bar + buff defs for HUD based on resolved job
    skillBarEntriesSignal.value = job.skillBar
    buffDefsSignal.value = job.buffMap as any
    tooltipContext.value = { gcdDuration: job.stats.gcdDuration ?? 2500, haste: 0 }

    let adapter: ReturnType<typeof createStateAdapter> | null = null
    let active = true

    startTimelineDemo(canvas!, uiRoot, encounterUrl, isTutorial ? 'default' : undefined).then(() => {
      if (!active) return
      const scene = getActiveScene()
      if (scene) {
        adapter = createStateAdapter({
          bus: scene.bus,
          sceneManager: scene.sceneManager,
          buffSystem: scene.buffSystem,
        })
        scene.onRenderTick = (delta) => {
          const bossForUI = scene.bossEntity ?? scene.player
          adapter!.writeFrame(
            scene.player,
            bossForUI,
            (sid) => scene.skillResolver.getCooldown(scene.player.id, sid),
          )
        }
      }
    })

    return () => {
      active = false
      adapter?.dispose()
      disposeActiveScene()
      resetState()
    }
  }, [params.id, canvas, gameKey])

  const handleRetry = () => setGameKey((k) => k + 1)
  const { route } = useLocation()

  const handleSkipTutorial = useCallback(() => {
    localStorage.setItem('xiv-tutorial-seen', '1')
    route('/')
  }, [route])

  // Mark tutorial as seen when battle ends (victory)
  useEffect(() => {
    if (isTutorial) {
      localStorage.setItem('xiv-tutorial-seen', '1')
    }
  }, [isTutorial])

  return (
    <div
      ref={uiRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <BossHpBar />
      <PlayerHpBar />
      <PlayerMpBar />
      <PlayerCastBar />
      <BossCastBar />
      <SkillBar />
      <SkillPanelButton />
      <BuffBar />
      <DamageFloater />
      <CombatAnnounce />
      <DialogBox />
      <PauseMenu onRetry={handleRetry} />
      <BattleEndOverlay onRetry={handleRetry} />
      <DebugInfo />
      <SidePanel />
      <Tooltip />
      <SkillPanel />
      {isTutorial && (
        <div
          style={{
            position: 'absolute', top: 16, right: 16,
            pointerEvents: 'auto', cursor: 'pointer',
            padding: '6px 16px', fontSize: 13,
            color: '#aaa', background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
          }}
          onClick={handleSkipTutorial}
        >
          跳过教程 &gt;
        </div>
      )}
    </div>
  )
}
