import { useDroppable } from '@dnd-kit/core'
import JobCard from '../cards/JobCard'
import Icon from '../ui/Icon'

const COL_COLORS = {
  new:         'var(--col-new)',
  interested:  'var(--col-interested)',
  applied:     'var(--col-applied)',
  interview:   'var(--col-interview)',
  offer:       'var(--col-offer)',
  rejected:    'var(--col-rejected)',
  archived:    'var(--col-archived)',
}

export default function KanbanColumn({ col, colVar, jobs, kcStyle, srcColors, onCardClick, onAddJob, onFilterNew, filteringNew, filterResult }) {
  const { setNodeRef, isOver } = useDroppable({ id: col })

  return (
    <div className={`col ${isOver ? 'drop-target' : ''}`}>
      <div className="col-head">
        <div className="nm">
          <span className="dot" style={{ background: COL_COLORS[colVar] }} />
          {col}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onFilterNew && (
            <button
              className="col-filter-btn"
              onClick={onFilterNew}
              disabled={filteringNew}
              title="Score unscored jobs and archive poor fits (below 40)"
            >
              {filteringNew ? <span className="spinner" style={{ width: 10, height: 10 }} /> : 'Filter'}
            </button>
          )}
          <div className="ct">{jobs.length}</div>
        </div>
      </div>
      {filterResult && (
        <div className="col-filter-result">
          Archived {filterResult.archived} · kept {filterResult.kept}
          {filterResult.scored > 0 ? ` · scored ${filterResult.scored}` : ''}
        </div>
      )}

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
