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
  const [activeId,      setActiveId]      = useState(null)
  const [addingToCol,   setAddingToCol]   = useState(null)
  const [filteringNew,  setFilteringNew]  = useState(false)
  const [filterResult,  setFilterResult]  = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const kcStyle   = settings.card_style || 'edge'
  const srcColors = getSourceColors()
  const sources   = ['All', ...Object.keys(srcColors)]

  const activeJobs = jobs.filter(j => !j.is_soft_deleted)
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

  const handleFilterNew = async () => {
    setFilteringNew(true)
    setFilterResult(null)
    try {
      const result = await api.post('/jobs/filter-new', { threshold: 40 })
      const archivedIds = new Set(result.archived.map(j => j.id))
      setJobs(prev => prev.map(j => archivedIds.has(j.id) ? { ...j, status: 'Archived' } : j))
      setFilterResult({ archived: result.archived.length, kept: result.kept, scored: result.scored })
    } catch {}
    finally { setFilteringNew(false) }
  }

  const activeJob = activeId ? jobs.find(j => j.id === activeId) : null

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
        <div className="filter-chips" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
          {[['All', 'All'], ['tech', 'Tech'], ['hospitality', 'Hospitality'], ['general', 'General']].map(([val, label]) => (
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
          <div className="filter-chips" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
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
        <div className="flex-1" />
        {filterResult && (
          <span className="ai-filter-result">
            Archived {filterResult.archived} · kept {filterResult.kept}
            {filterResult.scored > 0 ? ` · scored ${filterResult.scored}` : ''}
          </span>
        )}
        <button
          className="btn-ai-filter"
          onClick={handleFilterNew}
          disabled={filteringNew}
          title="Score unscored New jobs and archive poor fits (below 40)"
        >
          {filteringNew
            ? <span className="spinner" style={{ width: 13, height: 13, borderColor: 'rgba(255,255,255,.35)', borderTopColor: '#fff' }} />
            : <Icon name="wand" size={13} />
          }
          Filter with AI
        </button>
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
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
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
