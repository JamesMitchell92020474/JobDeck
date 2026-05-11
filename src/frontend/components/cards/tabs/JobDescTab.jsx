import { useState } from 'react'
import { Pill } from '../../ui/FitScore'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

export default function JobDescTab({ job, onDescriptionFetched }) {
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)

  const fetchDescription = async () => {
    setFetching(true)
    setFetchError(null)
    try {
      const res = await api.post(`/jobs/${job.id}/fetch-description`)
      onDescriptionFetched?.(res.description)
    } catch (err) {
      setFetchError(err.message || 'Could not fetch description')
    }
    setFetching(false)
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Meta strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {job.salary   && <Pill>{job.salary}</Pill>}
        {job.job_type && <Pill>{job.job_type}</Pill>}
        {job.is_remote ? <Pill>Remote</Pill> : null}
        {job.is_hybrid ? <Pill>Hybrid</Pill> : null}
        {job.location  && <Pill>{job.location}</Pill>}
      </div>

      {/* Description */}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 16, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {job.description || (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ color: 'var(--ink-3)' }}>No description scraped yet.</span>
            {job.source_url && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={fetchDescription}
                  disabled={fetching}
                >
                  {fetching
                    ? <><span className="spinner" /> Fetching…</>
                    : <><Icon name="refresh" size={11} /> Fetch description</>}
                </button>
                {fetchError && <span style={{ color: 'var(--col-rejected)', fontSize: 13 }}>{fetchError}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {job.source_url && (
        <div style={{ marginTop: 28 }}>
          <a
            href={job.source_url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="external" size={11} /> View on {job.source || 'site'}
          </a>
        </div>
      )}
    </div>
  )
}
