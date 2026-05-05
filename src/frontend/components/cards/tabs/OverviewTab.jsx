import { useState } from 'react'

export default function OverviewTab({ job, saveJob }) {
  const [deadline, setDeadline] = useState(job.deadline || '')
  const [saving, setSaving] = useState(false)

  const save = async (field, value) => {
    setSaving(true)
    await saveJob({ [field]: value }).catch(() => {})
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
      {job.ai_summary && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>AI match summary</div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>{job.ai_summary}</p>
        </div>
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>About this role</div>
        <p className="serif" style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--ink)', margin: 0, fontWeight: 300 }}>
          {job.description?.slice(0, 600) || 'No description available.'}
          {(job.description?.length || 0) > 600 && '…'}
        </p>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Deadline</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            className="input"
            style={{ maxWidth: 200 }}
            type="text"
            placeholder="e.g. May 15"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            onBlur={() => save('deadline', deadline)}
          />
          {saving && <span className="spinner" />}
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Activity</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13, color: 'var(--ink-2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 14 }}>
            <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
              {new Date(job.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }).toUpperCase()}
            </span>
            <span>Job added from {job.source || 'manual'} · matched {job.fit_score != null ? `${job.fit_score}%` : 'not scored'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
