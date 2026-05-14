import { useState, useCallback } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import KanbanColumn from './KanbanColumn'
import JobCard from '../cards/JobCard'
import AddJobModal from '../cards/AddJobModal'
import Icon from '../ui/Icon'
import { useApp } from '../../context/AppContext'
import api from '../../hooks/useApi'

const COLUMNS = ['New', 'Interested', 'Applied', 'Interview', 'Offer', 'Rejected', 'Archived']
const COL_VAR = { New: 'new', Interested: 'interested', Applied: 'applied', Interview: 'interview', Offer: 'offer', Rejected: 'rejected', Archived: 'archived' }

export default function KanbanBoard({ setRoute, setDetailJobId }) {
  const { jobs, setJobs, settings, getSourceColors } = useApp()
  const [query,       setQuery]       = useState('')
  const [srcFilter,   setSrcFilter]   = useState('All')
  const [catFilter,   setCatFilter]   = useState('All')
  const [typeFilter,  setTypeFilter]  = useState('All')
  const [sortBy,      setSortBy]      = useState('added')
  const [sortDir,     setSortDir]     = useState('desc')
  const [activeId,      setActiveId]      = useState(null)
  const [addingToCol,   setAddingToCol]   = useState(null)
  const [filteringNew,  setFilteringNew]  = useState(false)
  const [filterResult,  setFilterResult]  = useState(null)
  const [syncing,       setSyncing]       = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const kcStyle   = settings.card_style || 'edge'
  const srcColors  = getSourceColors()
  const activeJobs = jobs.filter(j => !j.is_soft_deleted)
  const sources    = ['All', ...[...new Set(activeJobs.map(j => j.source).filter(Boolean))]]
  const TYPE_ORDER = ['Full time', 'Part time', 'Contract/Temp', 'Casual', 'Internship']
  const jobTypes   = ['All', ...TYPE_ORDER.filter(t => activeJobs.some(j => j.job_type === t))]
  const filtered   = activeJobs.filter(j => {
    const q = query.toLowerCase()
    const matchQ = !q || j.title?.toLowerCase().includes(q) || j.company?.toLowerCase().includes(q)
    const matchS = srcFilter === 'All' || j.source === srcFilter
    const matchC = catFilter === 'All' || j.job_category === catFilter || (catFilter === 'general' && !j.job_category)
    const matchT = typeFilter === 'All' || j.job_type === typeFilter
    return matchQ && matchS && matchC && matchT
  })

  const handleDragStart = (e) => setActiveId(e.active.id)
  const handleDragEnd   = useCallback(async (e) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return

    // over.id is either a column name or a card id — resolve to column
    let newStatus = COLUMNS.includes(over.id)
      ? over.id
      : jobs.find(j => j.id === over.id)?.status

    if (!newStatus) return
    const job = jobs.find(j => j.id === active.id)
    if (!job || job.status === newStatus) return

    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j))
    try { await api.put(`/jobs/${job.id}/move`, { status: newStatus }) } catch {}
  }, [jobs, setJobs])

  const handleSync = async () => {
    setSyncing(true)
    await api.post('/scrape', {}).catch(() => {})
    setSyncing(false)
  }

  const handleFilterNew = async () => {
    setFilteringNew(true)
    setFilterResult(null)
    try {
      const result = await api.post('/jobs/filter-new', {})
      const archivedIds = new Set(result.archived.map(j => j.id))
      setJobs(prev => prev.map(j => archivedIds.has(j.id) ? { ...j, status: 'Archived' } : j))
      setFilterResult({ archived: result.archived.length, kept: result.kept, scored: result.scored })
    } catch {}
    finally { setFilteringNew(false) }
  }

  const activeJob = activeId ? jobs.find(j => j.id === activeId) : null

  const SORT_OPTIONS = [
    { value: 'title',    label: 'Title' },
    { value: 'company',  label: 'Company' },
    { value: 'added',    label: 'Date added' },
    { value: 'posted',   label: 'Date posted' },
    { value: 'deadline', label: 'Deadline' },
    { value: 'score',    label: 'Score' },
  ]

  function sortJobs(a, b) {
    const d = sortDir === 'desc' ? -1 : 1
    switch (sortBy) {
      case 'score': {
        if (a.fit_score != null && b.fit_score != null) return (b.fit_score - a.fit_score) * d
        if (a.fit_score != null) return -1
        if (b.fit_score != null) return 1
        return new Date(b.created_at) - new Date(a.created_at)
      }
      case 'posted': {
        const pa = a.posting_date ? new Date(a.posting_date) : null
        const pb = b.posting_date ? new Date(b.posting_date) : null
        if (pa && pb) return (pb - pa) * d
        if (pa) return -1
        if (pb) return 1
        return new Date(b.created_at) - new Date(a.created_at)
      }
      case 'deadline': {
        const da = a.deadline && a.deadline !== '—' ? new Date(a.deadline) : null
        const db_ = b.deadline && b.deadline !== '—' ? new Date(b.deadline) : null
        if (da && db_) return (da - db_) * d
        if (da) return -1
        if (db_) return 1
        return new Date(b.created_at) - new Date(a.created_at)
      }
      case 'company':
        return (a.company || '').localeCompare(b.company || '') * d
      case 'title':
        return (a.title || '').localeCompare(b.title || '') * d
      default:
        return (new Date(b.created_at) - new Date(a.created_at)) * d
    }
  }

  return (
    <div className="kanban-shell" data-kc-style={kcStyle}>
      {/* Toolbar */}
      <div className="kanban-toolbar">
        <input
          className="input input-search search"
          placeholder="Search by title, company…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="filter-chips">
          {sources.map(s => (
            <span
              key={s}
              className={`filter-chip ${srcFilter === s ? 'active' : ''}`}
              onClick={() => setSrcFilter(s)}
            >
              {s !== 'All' && (
                <span className="filter-chip-dot" style={{ background: srcColors[s] }} />
              )}
              {s}
            </span>
          ))}
        </div>
        <div className="filter-chips" style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 10 }}>
          {[['All', 'All'], ['tech', settings.cv_label_1 || 'CV Profile 1'], ['hospitality', settings.cv_label_2 || 'CV Profile 2'], ['general', 'General']].map(([val, label]) => (
            <span
              key={val}
              className={`filter-chip ${catFilter === val ? 'active' : ''}`}
              onClick={() => setCatFilter(val)}
            >
              {label}
            </span>
          ))}
        </div>
        {jobTypes.length > 1 && (
          <div className="filter-chips" style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 10 }}>
            {jobTypes.map(t => (
              <span
                key={t}
                className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div style={{ borderLeft: '1px solid var(--rule)', paddingLeft: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>Sort by</span>
          <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="sort-dir-btn" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')} title={sortDir === 'desc' ? 'Descending' : 'Ascending'}>
            {sortDir === 'desc' ? '↓' : '↑'}
          </button>
          <button
            className="btn-ai-filter"
            onClick={handleSync}
            disabled={syncing || !settings.scraper_keywords_tech?.trim()}
            title={settings.scraper_keywords_tech?.trim() ? 'Scrape Seek and Trade Me Jobs for new listings' : 'Add search keywords and upload a CV in Settings before syncing'}
          >
            {syncing
              ? <span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
              : <Icon name="refresh" size={13} />
            }
            Sync sources
          </button>
          <button
            className="btn-ai-filter"
            onClick={handleFilterNew}
            disabled={filteringNew || jobs.filter(j => !j.is_soft_deleted).length === 0}
            title="Score new jobs against your CV and archive poor fits"
          >
            {filteringNew
              ? <span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
              : <Icon name="wand" size={13} />
            }
            Filter with AI
          </button>
          {filterResult && (
            <span className="ai-filter-result">
              Archived {filterResult.archived} · kept {filterResult.kept}
              {filterResult.scored > 0 ? ` · scored ${filterResult.scored}` : ''}
              {filterResult.fetching > 0 ? ` · fetching ${filterResult.fetching} in background` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="board">
          {COLUMNS.map(col => {
            const colJobs = filtered
              .filter(j => j.status === col)
              .sort(sortJobs)
            return (
              <SortableContext key={col} items={colJobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
                <KanbanColumn
                  col={col}
                  colVar={COL_VAR[col]}
                  jobs={colJobs}
                  kcStyle={kcStyle}
                  srcColors={srcColors}
                  onCardClick={id => { setDetailJobId(id); setRoute('detail') }}
                  onAddJob={col => setAddingToCol(col)}
                />
              </SortableContext>
            )
          })}
        </div>

        <DragOverlay>
          {activeJob && (
            <JobCard job={activeJob} kcStyle={kcStyle} srcColors={srcColors} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {addingToCol && (
        <AddJobModal
          initialStatus={addingToCol}
          onSaved={job => { setJobs(prev => [...prev, job]); setAddingToCol(null) }}
          onCancel={() => setAddingToCol(null)}
        />
      )}
    </div>
  )
}
