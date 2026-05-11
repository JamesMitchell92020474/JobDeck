import { useState } from 'react'
import Icon from '../../ui/Icon'
import { FitRing } from '../../ui/FitScore'

export default function OverviewTab({ job, saveJob, descFetching, descError, onRefetchDesc }) {
  const [deadline, setDeadline] = useState(job.deadline || '')
  const [saving, setSaving] = useState(false)

  const save = async (field, value) => {
    setSaving(true)
    await saveJob({ [field]: value }).catch(() => {})
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 28 }}>
      {job.fit_score != null && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '16px 18px', borderRadius: 'var(--radius)', background: 'var(--bg-2)', border: '1px solid var(--rule)' }}>
          <FitRing value={job.fit_score} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>
              {job.fit_score >= 85 ? 'Strong match' : job.fit_score >= 70 ? 'Good match' : job.fit_score >= 50 ? 'Partial match' : 'Low match'}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)' }}>
              {job.ai_summary || `Your profile matches ${job.fit_score}% of the listing's stated requirements.`}
            </p>
            {Array.isArray(job.skills_gaps) && job.skills_gaps.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Skills gaps</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                  {job.skills_gaps.map((g, i) => (
                    <span key={i} className="skill-gap">{g}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="eyebrow">About this role</div>
          {job.source_url && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ padding: '2px 6px', fontSize: 11, opacity: 0.6 }}
              onClick={onRefetchDesc}
              disabled={descFetching}
              title="Re-fetch description from source"
            >
              {descFetching ? <span className="spinner" /> : <Icon name="refresh" size={10} />}
            </button>
          )}
        </div>
        {job.description ? (
          /<[a-z][\s\S]*>/i.test(job.description)
            ? <div className="job-desc-html" dangerouslySetInnerHTML={{ __html: job.description }} />
            : <p className="serif" style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--ink)', margin: 0, fontWeight: 300, whiteSpace: 'pre-wrap' }}>{job.description}</p>
        ) : descError ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--col-rejected)' }}>Couldn't fetch description: {descError}</p>
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onRefetchDesc}>
              <Icon name="refresh" size={11} /> Retry
            </button>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)', fontStyle: 'italic' }}>
            {descFetching ? 'Fetching description…' : job.source_url ? 'No description available.' : 'No description available.'}
          </p>
        )}
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
