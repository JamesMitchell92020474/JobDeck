import { useState, useCallback } from 'react'
import {
  DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import KanbanColumn from './KanbanColumn'
import JobCard from '../cards/JobCard'
import { useApp } from '../../context/AppContext'
import api from '../../hooks/useApi'

const COLUMNS = ['Shortlisted', 'Applied', 'Interview', 'Offer', 'Rejected']
const COL_VAR = { Shortlisted: 'shortlisted', Applied: 'applied', Interview: 'interview', Offer: 'offer', Rejected: 'rejected' }

export default function KanbanBoard({ setRoute, setDetailJobId }) {
  const { jobs, setJobs, settings, getSourceColors } = useApp()
  const [query,     setQuery]     = useState('')
  const [srcFilter, setSrcFilter] = useState('All')
  const [activeId,  setActiveId]  = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const kcStyle   = settings.card_style || 'edge'
  const srcColors = getSourceColors()
  const sources   = ['All', ...Object.keys(srcColors)]

  const activeJobs = jobs.filter(j => !j.is_soft_deleted)
  const filtered   = activeJobs.filter(j => {
    const q = query.toLowerCase()
    const matchQ = !q || j.title?.toLowerCase().includes(q) || j.company?.toLowerCase().includes(q)
    const matchS = srcFilter === 'All' || j.source === srcFilter
    return matchQ && matchS
  })

  const handleDragStart = (e) => setActiveId(e.active.id)
  const handleDragEnd   = useCallback(async (e) => {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const newStatus = over.id
    if (!COLUMNS.includes(newStatus)) return
    const job = jobs.find(j => j.id === active.id)
    if (!job || job.status === newStatus) return

    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j))
    try { await api.put(`/jobs/${job.id}/move`, { status: newStatus }) } catch {}
  }, [jobs, setJobs])

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
        <div className="flex-1" />
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
            const colJobs = filtered.filter(j => j.status === col)
            return (
              <SortableContext key={col} items={colJobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
                <KanbanColumn
                  col={col}
                  colVar={COL_VAR[col]}
                  jobs={colJobs}
                  kcStyle={kcStyle}
                  srcColors={srcColors}
                  onCardClick={id => { setDetailJobId(id); setRoute('detail') }}
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
    </div>
  )
}
