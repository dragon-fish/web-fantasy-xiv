import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import { skillBarEntries, buffDefs, type SkillBarEntry } from '../state'
import { buildSkillTooltip } from '../tooltip-builders'

export const skillPanelOpen = signal(false)

export function toggleSkillPanel() {
  skillPanelOpen.value = !skillPanelOpen.value
}

/** Hook to bind P key for toggling skill panel */
export function useSkillPanelKey() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyP') toggleSkillPanel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

/** In-game skill panel (reads from signals) */
export function SkillPanel() {
  if (!skillPanelOpen.value) return null
  return (
    <SkillPanelOverlay
      entries={skillBarEntries.value}
      buffDefs={buffDefs.value}
      onClose={() => { skillPanelOpen.value = false }}
    />
  )
}

/** Standalone skill panel for main menu (accepts props) */
export function SkillPanelOverlay({ entries, buffDefs: defs, onClose }: {
  entries: SkillBarEntry[]
  buffDefs: Map<string, any>
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, pointerEvents: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(30,28,24,0.97) 0%, rgba(18,16,14,0.97) 100%)',
          border: '2px solid #8b7440',
          borderRadius: 6,
          padding: '20px 24px',
          maxWidth: 500,
          width: '90%',
          maxHeight: '70vh',
          overflowY: 'auto',
          boxShadow: '0 0 1px rgba(184,160,106,0.4), 0 4px 12px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, borderBottom: '1px solid rgba(184,160,106,0.2)', paddingBottom: 8,
        }}>
          <span style={{ fontSize: 16, fontWeight: 'bold', color: '#b8a06a' }}>技能一览</span>
          <span
            style={{ cursor: 'pointer', color: '#888', fontSize: 18, lineHeight: 1 }}
            onClick={onClose}
          >
            ✕
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {entries.map((entry) => (
            <SkillCard key={entry.key} keyLabel={entry.key} skill={entry.skill} buffDefs={defs} />
          ))}
        </div>
      </div>
    </div>
  )
}

function SkillCard({ keyLabel, skill, buffDefs: defs }: {
  keyLabel: string
  skill: any
  buffDefs: Map<string, any>
}) {
  const html = buildSkillTooltip(skill, defs.size > 0 ? defs : undefined)

  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(184,160,106,0.2)',
      borderRadius: 4, padding: '10px 12px',
    }}>
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        border: '1px solid rgba(184,160,106,0.4)',
        borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
      }}>
        {keyLabel}
      </div>
      <div
        style={{ fontSize: 12, lineHeight: 1.6, color: '#ccc', flex: 1 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
