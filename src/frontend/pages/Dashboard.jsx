import { useEffect, useState, useRef } from 'react'
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
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + iH * (1 - f)} y2={PAD.t + iH * (1 - f)}
          stroke="var(--rule)" strokeWidth="1" strokeDasharray={f === 0 ? 'none' : '3 3'} />
      ))}
      {polyline('listings',     'var(--accent)')}
      {polyline('applications', 'var(--col-offer)')}
      {data.map((d, i) => (
        <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="10.5"
          fill="var(--ink-3)" fontFamily="var(--font-body)">{d.day}</text>
      ))}
    </svg>
  )
}

const COLUMNS = ['New', 'Interested', 'Applied', 'Interview', 'Offer', 'Rejected', 'Archived']

export default function Dashboard({ setRoute, setDetailJobId, onNewJob }) {
  const { jobs, setJobs, loadJobs, getSourceColors } = useApp()
  const [welcome,        setWelcome]        = useState('')
  const [statsData,      setStats]          = useState(null)
  const [loadingWelcome, setLoadingWelcome] = useState(true)
  const [news,           setNews]           = useState([])
  const [syncing,        setSyncing]        = useState(false)
  const [syncResult,     setSyncResult]     = useState(null)
  const [filtering,      setFiltering]      = useState(false)
  const [filterResult,   setFilterResult]   = useState(null)
  const newsTimer = useRef(null)

  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const loadNews = () => api.get('/news').then(setNews).catch(() => {})

  useEffect(() => {
    api.get('/stats').then(setStats).catch(() => {})
    api.get('/stats/welcome').then(d => setWelcome(d.message)).catch(() => {
      setWelcome('Welcome back. You have jobs to review today.')
    }).finally(() => setLoadingWelcome(false))
    loadNews()
    newsTimer.current = setInterval(loadNews, 30 * 60 * 1000)
    return () => clearInterval(newsTimer.current)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await api.post('/scrape', {})
      const total = Object.values(res.results || {}).reduce((s, r) => s + (r.new || 0), 0)
      setSyncResult(total)
      await loadJobs()
      api.get('/stats').then(setStats).catch(() => {})
    } catch {}
    finally { setSyncing(false) }
  }

  const handleFilter = async () => {
    setFiltering(true)
    setFilterResult(null)
    try {
      const result = await api.post('/jobs/filter-new', { threshold: 40 })
      const archivedIds = new Set(result.archived.map(j => j.id))
      setJobs(prev => prev.map(j => archivedIds.has(j.id) ? { ...j, status: 'Archived' } : j))
      setFilterResult({ archived: result.archived.length, kept: result.kept })
    } catch {}
    finally { setFiltering(false) }
  }

  const activeJobs = jobs.filter(j => !j.is_soft_deleted)
  const counts = COLUMNS.reduce((acc, c) => { acc[c] = activeJobs.filter(j => j.status === c).length; return acc }, {})

  const newJobs = activeJobs
    .filter(j => j.status === 'New')
    .sort((a, b) => {
      if (b.fit_score != null && a.fit_score != null) return b.fit_score - a.fit_score
      if (b.fit_score != null) return 1
      if (a.fit_score != null) return -1
      return new Date(b.created_at) - new Date(a.created_at)
    })
    .slice(0, 8)

  const deadlines = activeJobs
    .filter(j => j.deadline && j.deadline !== '—')
    .sort((a, b) => a.deadline?.localeCompare(b.deadline))
    .slice(0, 4)

  const activity = statsData?.activity || Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return { day: d.toLocaleDateString('en-NZ', { weekday: 'short' }), listings: 0, applications: 0 }
  })
  const maxAct = Math.max(...activity.map(a => Math.max(a.listings || 0, a.applications || 0)), 1)

  const sources   = statsData?.sources || []
  const totalSrc  = sources.reduce((s, r) => s + r.n, 0) || 1
  const srcColors = getSourceColors()
  let pct = 0
  const stops = sources.map(s => {
    const start = pct; pct += (s.n / totalSrc) * 100
    return `${srcColors[s.source] || 'var(--ink-3)'} ${start}% ${pct}%`
  }).join(', ')

  const hour   = new Date().getHours()
  const greet  = hour < 5 ? "You're up early" : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dayStr = new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

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

      {/* Stat strip */}
      <div className="stat-strip" onClick={() => setRoute('board')}>
        {COLUMNS.map((c, i) => (
          <div key={c} className="stat-pill">
            {i > 0 && <span className="stat-sep" />}
            <span className="stat-dot" style={{ background: `var(--col-${c.toLowerCase()})` }} />
            <span className="stat-num">{counts[c]}</span>
            <span className="stat-label">{c}</span>
            {c === 'New' && statsData?.recent > 0 && (
              <span className="stat-delta">+{statsData.recent} today</span>
            )}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="dash-actions">
        <button className="btn btn-ghost btn-sm" onClick={handleSync} disabled={syncing}>
          {syncing
            ? <span className="spinner" style={{ width: 11, height: 11 }} />
            : <Icon name="refresh" size={12} />}
          {syncing ? 'Syncing…' : 'Sync sources'}
        </button>
        {syncResult != null && (
          <span className="dash-action-note">{syncResult > 0 ? `+${syncResult} new` : 'Up to date'}</span>
        )}
        <button className="btn-ai-filter dash-ai-btn" onClick={handleFilter} disabled={filtering}>
          {filtering
            ? <span className="spinner" style={{ width: 11, height: 11, borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
            : <Icon name="wand" size={12} />}
          {filtering ? 'Filtering…' : 'Filter with AI'}
        </button>
        {filterResult && (
          <span className="dash-action-note">Archived {filterResult.archived} · kept {filterResult.kept}</span>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onNewJob}>
          <Icon name="plus" size={12} /> Add job
        </button>
      </div>

      {/* Latest New + News */}
      <div className="grid-3">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>New listings</div>
              <div className="card-title">{counts['New']} unreviewed{newJobs.some(j => j.fit_score != null) ? ' · sorted by fit' : ''}</div>
            </div>
            <span className="btn btn-ghost btn-sm" onClick={() => setRoute('board')}>
              View all <Icon name="external" size={11} />
            </span>
          </div>
          {newJobs.length > 0 ? (
            <div className="jobs-strip">
              {newJobs.map(j => (
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
              No new listings — sync a source or add a job manually.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <div className="eyebrow">News</div>
          </div>
          {news.length > 0 ? (
            <div className="news-feed">
              {news.map((item, i) => (
                <a key={i} className="news-item" href={item.url} target="_blank" rel="noopener noreferrer">
                  <span className={`news-source news-source--${item.source === 'Hacker News' ? 'hn' : 'gz'}`}>
                    {item.source === 'Hacker News' ? 'HN' : 'GZ'}
                  </span>
                  <span className="news-title">{item.title}</span>
                  <span className="news-time">{timeAgo(item.published_at)}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--ink-3)', fontSize: 13, padding: '16px 0' }}>Loading news…</div>
          )}
        </div>
      </div>

      {/* Charts */}
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

      {/* Deadlines — only shown when relevant */}
      {deadlines.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Upcoming · 7 days</div>
              <div className="card-title">Deadlines</div>
            </div>
          </div>
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
        </div>
      )}

      <div style={{ height: 12 }} />
    </div>
  )
}
