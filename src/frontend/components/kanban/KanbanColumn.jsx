import { useDroppable } from '@dnd-kit/core'
import JobCard from '../cards/JobCard'
import Icon from '../ui/Icon'

const COL_COLORS = {
  shortlisted: 'var(--col-shortlisted)',
  applied:     'var(--col-applied)',
  interview:   'var(--col-interview)',
  offer:       'var(--col-offer)',
  rejected:    'var(--col-rejected)',
  archived:    'var(--col-archived)',
}

export default function KanbanColumn({ col, colVar, jobs, kcStyle, srcColors, onCardClick, onAddJob }) {
  const { setNodeRef, isOver } = useDroppable({ id: col })

  return (
    <div className={`col ${isOver ? 'drop-target' : ''}`}>
      <div className="col-head">
        <div className="nm">
          <span className="dot" style={{ background: COL_COLORS[colVar] }} />
          {col}
        </div>
        <div className="ct">{jobs.length}</div>
      </div>

      <div ref={setNodeRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 40 }}>
        {jobs.map(j => (
          <JobCard
            key={j.id}
            job={j}
            colVar={colVar}
            kcStyle={kcStyle}
            srcColors={srcColors}
            onClick={() => onCardClick(j.id)}
          />
        ))}
      </div>

      <div className="add-card" onClick={() => onAddJob(col)}>
        <Icon name="plus" size={11} /> Add to {col}
      </div>
    </div>
  )
}
