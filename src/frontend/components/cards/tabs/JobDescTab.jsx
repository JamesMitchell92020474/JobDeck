import { useState } from 'react'
import { Pill } from '../../ui/FitScore'
import Icon from '../../ui/Icon'

export default function JobDescTab({ job }) {
  return (
    <div style={{ maxWidth: 760 }}>
      {/* Meta strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {job.salary  && <Pill>{job.salary}</Pill>}
        {job.job_type && <Pill>{job.job_type}</Pill>}
        {job.is_remote  ? <Pill>Remote</Pill>  : null}
        {job.is_hybrid  ? <Pill>Hybrid</Pill>  : null}
        {job.location   && <Pill>{job.location}</Pill>}
      </div>

      {/* Description */}
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 16, lineHeight: 1.8, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
        {job.description || (
          <span style={{ color: 'var(--ink-3)' }}>No description available for this listing.</span>
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
