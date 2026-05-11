import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { Fit, Pill } from '../components/ui/FitScore'
import Icon from '../components/ui/Icon'
import api from '../hooks/useApi'

function LineChart({ data, maxVal }) {
  const W = 500, H = 110, PAD = { t: 16, r: 8, b: 28, l: 28 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b
  const n  = data.length

  const xPos = i => PAD.l + (i / (n - 1)) * iW
  const yPos = v => PAD.t + iH - (v / maxVal) * iH

  const polyline = (key, color) => {
    const pts = data.map((d, i) => `${xPos(i)},${yPos(d[key] || 0)}`).join(' ')
    return (
      <g key={key}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (d[key] || 0) > 0 && (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(d[key])} r="3.5" fill={color} />
            <text x={xPos(i)} y={yPos(d[key]) - 7} textAnchor="middle" fontSize="10" fill={color} fontFamily="var(--font-mono)">{d[key]}</text>
          </g>
        ))}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
      {/* Grid lines */}
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + iH * (1 - f)} y2={PAD.t + iH * (1 - f)}
          stroke="var(--rule)" strokeWidth="1" strokeDasharray={f === 0 ? 'none' : '3 3'} />
      ))}
      {polyline('listings',     'var(--accent)')}
      {polyline('applications', 'var(--col-offer)')}
      {/* X axis labels */}
      {data.map((d, i) => (
        <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="10.5"
          fill="var(--ink-3)" fontFamily="var(--font-body)">{d.day}</text>
      ))}
    </svg>
  )
}

const COLUMNS = ['Shortlisted', 'Applied', 'Interview', 'Offer', 'Rejected', 'Archived']

export default function Dashboard({ setRoute, setDetailJobId }) {
  const { jobs, getSourceColors } = useApp()
  const [welcome, setWelcome]   = useState('')
  const [statsData, setStats]   = useState(null)
  const [loadingWelcome, setLoadingWelcome] = useState(true)

  useEffect(() => {
    api.get('/stats').then(setStats).catch(() => {})
    api.get('/stats/welcome').then(d => setWelcome(d.message)).catch(() => {
      setWelcome('Welcome back. You have jobs to review today.')
    }).finally(() => setLoadingWelcome(false))
  }, [])

  const activeJobs = jobs.filter(j => !j.is_soft_deleted)
  const counts = COLUMNS.reduce((acc, c) => { acc[c] = activeJobs.filter(j => j.status === c).length; return acc }, {})
  const shortlisted = activeJobs.filter(j => j.status === 'Shortlisted').slice(0, 4)
  const deadlines   = activeJobs
    .filter(j => j.deadline && j.deadline !== '—')
    .sort((a, b) => a.deadline?.localeCompare(b.deadline))
    .slice(0, 4)

  const activity = statsData?.activity || Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return { day: d.toLocaleDateString('en-NZ', { weekday: 'short' }), listings: 0, applications: 0 }
  })
  const maxAct = Math.max(...activity.map(a => Math.max(a.listings || 0, a.applications || 0)), 1)

  const sources    = statsData?.sources || []
  const totalSrc   = sources.reduce((s, r) => s + r.n, 0) || 1
  const srcColors  = getSourceColors()
  let pct = 0
  const stops = sources.map(s => {
    const start = pct; pct += (s.n / totalSrc) * 100
    return `${srcColors[s.source] || 'var(--ink-3)'} ${start}% ${pct}%`
  }).join(', ')

  const hour   = new Date().getHours()
  const greet  = hour < 5 ? "You're up early" : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dayStr = new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

  const pipeDeltas = {
    Shortlisted: statsData?.recent ? `+${statsData.recent} new` : '—',
    Applied: '—', Interview: '—', Offer: '—', Rejected: '—', Archived: '—',
  }

  return (
    <div className="dash">
      {/* Welcome */}
      <div className="hello">
        <div className="hello-meta">
          <span className="eyebrow">{dayStr}</span>
          <span className="eyebrow">Christchurch · NZ</span>
        </div>
        <h1 className="hello-h">
          {greet}, <em>James</em>.{' '}
          <span className="quiet">
            {loadingWelcome
              ? <span className="spinner" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
              : welcome}
          </span>
        </h1>
      </div>

      {/* Pipeline strip */}
      <div className="pipeline">
        {COLUMNS.map(c => (
          <div key={c} className="pipe-cell" onClick={() => setRoute('board')}>
            <div className="pipe-label">{c}</div>
            <div className="pipe-num">{counts[c]}</div>
            <div className="pipe-delta">{pipeDeltas[c]}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Weekly activity</div>
              <div className="card-title">Listings &amp; applications this week</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-3)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 20, height: 2, background: 'var(--accent)', display: 'inline-block', borderRadius: 1 }} />
                Listings
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 20, height: 2, background: 'var(--col-offer)', display: 'inline-block', borderRadius: 1 }} />
                Applied
              </span>
            </div>
          </div>
          <LineChart data={activity} maxVal={maxAct} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Sources</div>
              <div className="card-title">Where {totalSrc} jobs came from</div>
            </div>
          </div>
          <div className="donut-wrap">
            <div
              className="donut"
              style={{ background: stops ? `conic-gradient(from -90deg, ${stops})` : 'var(--rule-2)' }}
            />
            <div className="donut-legend">
              {sources.slice(0, 5).map(s => (
                <div key={s.source} className="row">
                  <span className="sw" style={{ background: srcColors[s.source] || 'var(--ink-3)' }} />
                  <span className="nm">{s.source}</span>
                  <span className="vl">{s.n}</span>
                </div>
              ))}
              {sources.length === 0 && (
                <div className="row"><span className="nm text-muted">No data yet</span></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Latest + Deadlines */}
      <div className="grid-3">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Latest shortlisted</div>
              <div className="card-title">{shortlisted.length} jobs added recently</div>
            </div>
            <span className="btn btn-ghost btn-sm" onClick={() => setRoute('board')}>
              View all <Icon name="external" size={11} />
            </span>
          </div>
          {shortlisted.length > 0 ? (
            <div className="jobs-strip">
              {shortlisted.map(j => (
                <div key={j.id} className="job-mini" onClick={() => { setDetailJobId(j.id); setRoute('detail') }}>
                  <div className="job-mini-top">
                    <div>
                      <b>{j.title}</b>
                      <div className="meta">{j.company}{j.location ? ` · ${j.location}` : ''}</div>
                    </div>
                    {j.fit_score != null && <Fit value={j.fit_score} />}
                  </div>
                  <div className="tags">
                    <Pill>{j.source}</Pill>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
              No shortlisted jobs yet — sync a source or add a job manually.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Upcoming · 7 days</div>
              <div className="card-title">Deadlines</div>
            </div>
          </div>
          {deadlines.length > 0 ? (
            <div className="deadlines">
              {deadlines.map(d => {
                const parts = (d.deadline || '').split(' ')
                return (
                  <div key={d.id} className="deadline-row" onClick={() => { setDetailJobId(d.id); setRoute('detail') }}>
                    <div className="deadline-date">
                      <b>{parts[1] || parts[0]}</b>
                      <span>{parts[0]}</span>
                    </div>
                    <div className="deadline-mid">
                      <b>{d.title}</b>
                      <span>{d.company} · {d.status}</span>
                    </div>
                    {d.fit_score != null && <Fit value={d.fit_score} />}
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '24px 0' }}>
              No deadlines set.
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 12 }} />
    </div>
  )
}
