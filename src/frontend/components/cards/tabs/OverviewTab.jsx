import { useState, useEffect } from 'react'
import Icon from '../../ui/Icon'
import { FitRing } from '../../ui/FitScore'
import api from '../../../hooks/useApi'

const ACTION_LABELS = {
  'ADDED':                    'Job added',
  'MOVED':                    'Status changed',
  'SCORED':                   'AI scored',
  'ARCHIVED':                 'Archived',
  'COVER-LETTER-GENERATED':   'Cover letter generated',
  'COVER-LETTER-EXPORTED-PDF':'Cover letter exported (PDF)',
  'COVER-LETTER-EXPORTED-WORD':'Cover letter exported (Word)',
  'FILE-ATTACHED':            'File attached',
}

export default function OverviewTab({ job, saveJob, descFetching, descError, onRefetchDesc }) {
  const [deadline,   setDeadline]   = useState(job.deadline || '')
  const [saving,     setSaving]     = useState(false)
  const [rescoring,  setRescoring]  = useState(false)
  const [activity,   setActivity]   = useState(null)

  useEffect(() => {
    api.get(`/jobs/${job.id}/activity`).then(setActivity).catch(() => setActivity([]))
  }, [job.id])

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                {job.fit_score >= 85 ? 'Strong match' : job.fit_score >= 70 ? 'Good match' : job.fit_score >= 50 ? 'Partial match' : 'Low match'}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 6px', fontSize: 11, opacity: 0.6 }}
                disabled={rescoring}
                title="Re-score against your CV"
                onClick={async () => {
                  setRescoring(true)
                  try {
                    const result = await api.post(`/jobs/${job.id}/ai-score`)
                    saveJob({ fit_score: result.fit_score, ai_summary: result.summary, skills_gaps: result.skills_gaps })
                  } catch {}
                  setRescoring(false)
                }}
              >
                {rescoring ? <span className="spinner" /> : <Icon name="refresh" size={10} />}
              </button>
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
        {activity === null ? (
          <span className="spinner" />
        ) : activity.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontStyle: 'italic' }}>No activity logged yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
            {activity.map(a => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 14, alignItems: 'baseline' }}>
                <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
                  {new Date(a.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }).toUpperCase()}
                </span>
                <span>
                  {ACTION_LABELS[a.action] || a.action}
                  {a.reason ? <span style={{ color: 'var(--ink-3)' }}> · {a.reason}</span> : null}
                  {a.trigger_type === 'AUTO' && <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--accent-soft)', color: 'var(--accent)', padding: '1px 5px', borderRadius: 3 }}>AUTO</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
