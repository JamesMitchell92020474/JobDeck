import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Fit, Pill } from '../ui/FitScore'
import { useApp } from '../../context/AppContext'
import api from '../../hooks/useApi'

const CAT = {
  tech:        { label: 'Tech',        style: { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } },
  hospitality: { label: 'Hospitality', style: { borderColor: '#E07B39',       color: '#E07B39',        background: '#E07B3918' } },
}

const COL_COLORS = {
  new:         'var(--col-new)',
  interested:  'var(--col-interested)',
  applied:     'var(--col-applied)',
  interview:   'var(--col-interview)',
  offer:       'var(--col-offer)',
  rejected:    'var(--col-rejected)',
}

function relativeDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1d ago'
  if (days < 7)   return `${days}d ago`
  if (days < 30)  return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function isExpiringSoon(expiryDate) {
  if (!expiryDate) return false
  const d = new Date(expiryDate)
  if (isNaN(d.getTime())) return false
  const diff = d.getTime() - Date.now()
  return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000
}

export default function JobCard({ job, colVar, kcStyle, srcColors, onClick, isDragging }) {
  const { setJobs, settings } = useApp()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: job.id,
    disabled: isDragging, // overlay card is non-sortable
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  }

  const edgeColor = COL_COLORS[colVar] || 'var(--accent)'
  const srcColor  = srcColors?.[job.source]

  const cycleCategory = (e) => {
    e.stopPropagation()
    const next = job.job_category === 'tech' ? 'hospitality'
               : job.job_category === 'hospitality' ? null
               : 'tech'
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, job_category: next } : j))
    api.put(`/jobs/${job.id}`, { job_category: next }).catch(() => {})
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`kc ${isDragging ? 'is-dragging' : ''}`}
      onClick={onClick}
    >
      {kcStyle === 'edge' && (
        <span className="edge-bar" style={{ background: edgeColor }} aria-hidden />
      )}

      <div className="kc-top">
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{job.title}</b>
          <div className="company">{job.company}{job.location ? ` · ${job.location}` : ''}</div>
        </div>
        {job.fit_score != null && <Fit value={job.fit_score} />}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {job.job_category && (
          <Pill
            style={CAT[job.job_category]?.style}
            onClick={cycleCategory}
            title="Click to change category"
          >
            {job.job_category === 'tech' ? (settings.cv_label_1 || 'CV Profile 1') : (settings.cv_label_2 || 'CV Profile 2')}
          </Pill>
        )}
        {job.source && (
          <Pill style={srcColor ? { borderColor: srcColor, color: srcColor, background: `${srcColor}18` } : {}}>
            {job.source}
          </Pill>
        )}
        {isExpiringSoon(job.expiry_date) && (
          <span className="kc-badge kc-badge--warn">Expiring soon</span>
        )}
        {job.deadline && job.deadline !== '—' && (
          <span className="kc-badge kc-badge--due">Due {job.deadline}</span>
        )}
      </div>

      <div className="kc-meta">
        <span className="kc-source">{job.job_type || ''}</span>
        <span className="kc-date">
          {job.posting_date ? `Posted ${job.posting_date}` : relativeDate(job.created_at)}
        </span>
      </div>
    </div>
  )
}
