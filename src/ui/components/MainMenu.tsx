import { useEffect, useState } from 'preact/hooks'
import { useLocation } from 'preact-iso'
import { JOBS, getJob, JOB_CATEGORY_LABELS } from '@/demo/player-job'
import { selectedJobId } from '../state'
import { buildSkillTooltip } from '../tooltip-builders'

const btnClass = 'block min-w-60 px-8 py-3 my-1 text-sm text-gray-400 tracking-wide rounded border border-white/20 transition-all duration-150 hover:bg-white/20 hover:text-white cursor-pointer'

/** Shared menu chrome: centered column with title */
function MenuShell({ children }: { children: any }) {
  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center z-100"
      style={{ background: '#000', pointerEvents: 'auto' }}
    >
      <h1 class="text-4xl text-gray-200 mb-2 font-light tracking-widest">Web Fantasy XIV</h1>
      <p class="text-sm text-gray-500 mb-10 tracking-wide">Boss Battle Simulator</p>
      {children}
    </div>
  )
}

function BackButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      class="text-xs text-gray-500 hover:text-gray-300 cursor-pointer mb-4 transition-colors"
    >
      {'< '}返回
    </a>
  )
}

// ─── Pages ───────────────────────────────────────────────

export function MainMenu() {
  const { route } = useLocation()

  // First visit: auto-start tutorial
  useEffect(() => {
    if (!localStorage.getItem('xiv-tutorial-seen')) {
      route('/encounter/tutorial')
    }
  }, [route])

  const currentJob = getJob(selectedJobId.value)
  return (
    <MenuShell>
      <a class={btnClass} style={{ background: 'rgba(255,255,255,0.1)' }} href="/encounters">
        {'\u25B6  '}开始关卡
      </a>
      <a class={btnClass} style={{ background: 'rgba(255,255,255,0.08)' }} href="/job">
        {'\u2694  '}查看职业
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>{currentJob.name}</span>
      </a>
      <a class={btnClass} style={{ background: 'rgba(255,255,255,0.04)' }} href="/about">
        {'\u25C6  '}帮助 & 关于
      </a>
    </MenuShell>
  )
}

export function EncounterListPage() {
  const [levels, setLevels] = useState<{ label: string; description: string; file: string }[]>([])
  const base = import.meta.env.BASE_URL

  useEffect(() => {
    fetch(`${base}encounters/index.json`)
      .then((r) => r.json())
      .then(setLevels)
  }, [])

  return (
    <MenuShell>
      <BackButton href="/" />
      {levels.map((lv) => {
        const id = lv.file.replace(/\.yaml$/, '')
        return (
          <a
            key={id}
            href={`/encounter/${id}`}
            class={`${btnClass} text-left`}
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <div>{'\u25B6  '}{lv.label}</div>
            {lv.description && (
              <div class="text-xs text-gray-500 mt-0.5">{lv.description}</div>
            )}
          </a>
        )
      })}
    </MenuShell>
  )
}

export function JobPage() {
  const [viewId, setViewId] = useState(selectedJobId.value)
  const job = JOBS.find(j => j.id === viewId) ?? JOBS[0]
  const isActive = viewId === selectedJobId.value

  function selectJob(id: string) {
    selectedJobId.value = id
    localStorage.setItem('xiv-selected-job', id)
  }

  return (
    <MenuShell>
      <BackButton href="/" />
      <div style={{
        display: 'flex', gap: 16,
        maxWidth: 700, width: '90%',
        height: '60vh',
      }}>
        {/* Left: job list */}
        <div style={{
          width: 140, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {JOBS.map((j) => {
            const selected = j.id === viewId
            const equipped = j.id === selectedJobId.value
            return (
              <button
                key={j.id}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  color: selected ? '#fff' : '#888',
                  background: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                  border: selected ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onClick={() => setViewId(j.id)}
              >
                {j.name}
                {equipped && <span style={{ fontSize: 10, color: '#6a6', marginLeft: 4 }}>&#x2713;</span>}
              </button>
            )
          })}
        </div>

        {/* Right: fixed header / scrollable skills / fixed footer */}
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '12px 16px',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header: job name + category + description + stats (fixed) */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <img
                src={`${import.meta.env.BASE_URL}assets/images/class_jobs/class_${job.category}.png`}
                alt={JOB_CATEGORY_LABELS[job.category]}
                style={{ width: 20, height: 20 }}
              />
              <span style={{ fontSize: 14, color: '#ccc', fontWeight: 'bold' }}>{job.name}</span>
              <span style={{ fontSize: 11, color: '#666' }}>{JOB_CATEGORY_LABELS[job.category]}</span>
            </div>
            {job.description && (
              <div style={{ fontSize: 11, color: '#777', lineHeight: 1.6, marginBottom: 8 }}>
                {job.description}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.8, marginBottom: 12 }}>
              HP {job.stats.hp} | ATK {job.stats.attack} | SPD {job.stats.speed}
              {job.stats.mp > 0 ? ` | MP ${job.stats.mp}` : ''}
              {' | '}Range {job.stats.autoAttackRange}m
            </div>
          </div>

          {/* Skill list (scrollable) */}
          <div style={{
            flex: 1, overflowY: 'auto',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 8,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {job.skillBar.map((entry) => (
              <CompactSkillRow key={entry.key} keyLabel={entry.key} skill={entry.skill} buffDefs={job.buffMap} gcdDuration={job.stats.gcdDuration} />
            ))}
          </div>

          {/* Footer: equip + trial buttons (fixed) */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
            <a
              href="/encounter/training-dummy"
              style={{
                padding: '6px 16px', fontSize: 12,
                background: 'rgba(184,160,106,0.15)',
                border: '1px solid rgba(184,160,106,0.4)',
                borderRadius: 4,
                color: '#b8a06a',
                cursor: 'pointer',
                textDecoration: 'none',
              }}
              onClick={() => {
                selectedJobId.value = job.id
                localStorage.setItem('xiv-selected-job', job.id)
              }}
            >
              试玩
            </a>
            <button
              disabled={isActive}
              style={{
                padding: '6px 16px', fontSize: 12,
                background: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)'}`,
                borderRadius: 4,
                color: isActive ? '#666' : '#ddd',
                cursor: isActive ? 'default' : 'pointer',
              }}
              onClick={() => !isActive && selectJob(job.id)}
            >
              {isActive ? '已选择' : '切换为此职业'}
            </button>
          </div>
        </div>
      </div>
    </MenuShell>
  )
}

export function AboutPage() {
  return (
    <MenuShell>
      <BackButton href="/" />
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6, padding: '16px 20px',
        maxWidth: 440, width: '90%',
        fontSize: 12, color: '#999', lineHeight: 2,
      }}>
        <div style={{ fontSize: 14, color: '#ccc', fontWeight: 'bold', marginBottom: 8 }}>
          关于本游戏
        </div>
        <p>
          灵感来源于 Final Fantasy XIV。
          玩家使用 WASD 操控角色在场地中移动，
          观察并躲避 Boss 释放的 AOE 攻击预兆，
          同时尽可能快速地输出以击杀 Boss 通关。
        </p>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 12, paddingTop: 12 }}>
          <div style={{ color: '#ccc', marginBottom: 4 }}>作者</div>
          <div>
            dragon-fish |{' '}
            <a
              href="https://github.com/dragon-fish/web-fantasy-xiv"
              target="_blank"
              rel="noopener"
              style={{ color: '#6af', textDecoration: 'none' }}
            >
              GitHub
            </a>
          </div>
          <div style={{ marginTop: 4, color: '#666' }}>GPL-3.0 License</div>
        </div>
      </div>
    </MenuShell>
  )
}

// ─── Shared sub-components ───────────────────────────────

function CompactSkillRow({ keyLabel, skill, buffDefs, gcdDuration }: {
  keyLabel: string
  skill: any
  buffDefs: Map<string, any>
  gcdDuration?: number
}) {
  const html = buildSkillTooltip(skill, buffDefs.size > 0 ? buffDefs : undefined, { gcdDuration: gcdDuration ?? 2500, haste: 0 })
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      padding: '4px 6px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{
        width: 22, height: 22, flexShrink: 0,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 3,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'rgba(255,255,255,0.4)',
      }}>
        {keyLabel}
      </span>
      <div
        style={{ fontSize: 11, lineHeight: 1.5, color: '#bbb', flex: 1 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
