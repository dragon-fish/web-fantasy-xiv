import { useEffect, useState } from 'preact/hooks'
import { JOBS, type PlayerJob } from '@/demo/player-job'
import { buildSkillTooltip } from '../tooltip-builders'

type Page = 'home' | 'encounters' | 'info' | 'about'

interface EncounterEntry {
  label: string
  description: string
  file: string
}

export function MainMenu() {
  const [page, setPage] = useState<Page>('home')
  const [levels, setLevels] = useState<EncounterEntry[]>([])
  const base = import.meta.env.BASE_URL

  useEffect(() => {
    fetch(`${base}encounters/index.json`)
      .then((r) => r.json())
      .then(setLevels)
  }, [])

  return (
    <div
      class="absolute inset-0 flex flex-col items-center justify-center z-100"
      style={{ background: '#000', pointerEvents: 'auto' }}
    >
      <h1 class="text-4xl text-gray-200 mb-2 font-light tracking-widest">Web Fantasy XIV</h1>
      <p class="text-sm text-gray-500 mb-10 tracking-wide">Boss Battle Simulator</p>

      {page === 'home' && <HomePage onNav={setPage} />}
      {page === 'encounters' && <EncounterList levels={levels} onBack={() => setPage('home')} />}
      {page === 'info' && <InfoPage onBack={() => setPage('home')} />}
      {page === 'about' && <AboutPage onBack={() => setPage('home')} />}
    </div>
  )
}

const btnClass = 'block min-w-60 px-8 py-3 my-1 text-sm text-gray-400 tracking-wide rounded border border-white/20 transition-all duration-150 hover:bg-white/20 hover:text-white cursor-pointer'

function HomePage({ onNav }: { onNav: (p: Page) => void }) {
  return (
    <>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => onNav('encounters')}>
        {'\u25B6  '}开始关卡
      </button>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.08)' }} onClick={() => onNav('info')}>
        {'\u25A0  '}查看信息
      </button>
      <button class={btnClass} style={{ background: 'rgba(255,255,255,0.05)' }} onClick={() => onNav('about')}>
        {'\u25C6  '}帮助 & 关于
      </button>
    </>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      class="text-xs text-gray-500 hover:text-gray-300 cursor-pointer mb-4 transition-colors"
      onClick={onClick}
    >
      {'< '}返回
    </button>
  )
}

function EncounterList({ levels, onBack }: { levels: EncounterEntry[]; onBack: () => void }) {
  return (
    <>
      <BackButton onClick={onBack} />
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
    </>
  )
}

function InfoPage({ onBack }: { onBack: () => void }) {
  const [selectedId, setSelectedId] = useState(JOBS[0].id)
  const job = JOBS.find(j => j.id === selectedId) ?? JOBS[0]

  return (
    <>
      <BackButton onClick={onBack} />
      <div style={{
        display: 'flex', gap: 16,
        maxWidth: 700, width: '90%',
        maxHeight: '60vh',
      }}>
        {/* Left: job list */}
        <div style={{
          width: 140, flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {JOBS.map((j) => (
            <button
              key={j.id}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                color: j.id === selectedId ? '#fff' : '#888',
                background: j.id === selectedId ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                border: j.id === selectedId ? '1px solid rgba(255,255,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
              }}
              onClick={() => setSelectedId(j.id)}
            >
              {j.name}
            </button>
          ))}
        </div>

        {/* Right: job details + skills */}
        <div style={{
          flex: 1, overflowY: 'auto',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6, padding: '12px 16px',
        }}>
          <JobDetail job={job} />
        </div>
      </div>
    </>
  )
}

function JobDetail({ job }: { job: PlayerJob }) {
  const { stats } = job
  return (
    <>
      <div style={{ fontSize: 14, color: '#ccc', fontWeight: 'bold', marginBottom: 6 }}>
        {job.name}
      </div>
      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.8, marginBottom: 12 }}>
        HP {stats.hp} | MP {stats.mp} | ATK {stats.attack} | SPD {stats.speed} | Range {stats.autoAttackRange}m
      </div>
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {job.skillBar.map((entry) => (
          <CompactSkillRow key={entry.key} keyLabel={entry.key} skill={entry.skill} buffDefs={job.buffMap} />
        ))}
      </div>
    </>
  )
}

function CompactSkillRow({ keyLabel, skill, buffDefs }: {
  keyLabel: string
  skill: any
  buffDefs: Map<string, any>
}) {
  const html = buildSkillTooltip(skill, buffDefs.size > 0 ? buffDefs : undefined)
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

function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <>
      <BackButton onClick={onBack} />
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
    </>
  )
}
