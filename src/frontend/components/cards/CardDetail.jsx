import { useState, useEffect } from 'react'
import AddJobModal from './AddJobModal'
import { useApp } from '../../context/AppContext'
import Icon from '../ui/Icon'
import api from '../../hooks/useApi'
import OverviewTab    from './tabs/OverviewTab'
import CoverLetterTab from './tabs/CoverLetterTab'
import ChatTab        from './tabs/ChatTab'
import NotesTab       from './tabs/NotesTab'
import FilesTab       from './tabs/FilesTab'

const COLUMNS = ['New', 'Interested', 'Applied', 'Interview', 'Offer', 'Rejected', 'Archived']
const COL_COLORS = {
  New:        'var(--col-new)',        Interested: 'var(--col-interested)',
  Applied:    'var(--col-applied)',    Interview:  'var(--col-interview)',
  Offer:      'var(--col-offer)',      Rejected:   'var(--col-rejected)',
  Archived:   'var(--col-archived)',
}
const TABS = ['Overview', 'Cover Letter', 'Chat', 'Notes', 'Files']

export default function CardDetail({ jobId, setRoute }) {
  const { jobs, setJobs, settings } = useApp()
  const [job, setJob]         = useState(null)
  const [tab, setTab]         = useState('Overview')
  const [chatCount, setChatCount] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  const [descFetching, setDescFetching] = useState(false)
  const [descError,    setDescError]    = useState(null)
  const [editing,      setEditing]      = useState(false)

  const fetchDescription = async (jobId) => {
    setDescFetching(true)
    setDescError(null)
    try {
      const res = await api.post(`/jobs/${jobId}/fetch-description`)
      setJob(prev => ({ ...prev, description: res.description, logo_url: res.logoUrl || prev.logo_url }))
    } catch (err) {
      setDescError(err?.message || 'Could not fetch description')
    }
    setDescFetching(false)
  }

  useEffect(() => {
    if (!jobId) return
    api.get(`/jobs/${jobId}`).then(data => {
      setJob(data)
      setFileCount(data.files?.length || 0)
      if (!data.description && data.source_url) fetchDescription(jobId)
    }).catch(() => setRoute('board'))

    api.get(`/jobs/${jobId}/chat`).then(msgs => setChatCount(msgs.length)).catch(() => {})
  }, [jobId])

  if (!job) {
    return <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)' }}>Loading…</div>
  }

  const moveJob = async (status) => {
    setJob(prev => ({ ...prev, status }))
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status } : j))
    await api.put(`/jobs/${job.id}/move`, { status })
  }

  const saveJob = async (updates) => {
    setJob(prev => ({ ...prev, ...updates }))
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...updates } : j))
    await api.put(`/jobs/${job.id}`, updates)
  }

  const tabCounts = { Chat: chatCount || undefined, Files: fileCount || undefined }

  return (
    <>
    <div className="detail">
      {/* LEFT: context panel */}
      <aside className="detail-aside">
        <div className="detail-back" onClick={() => setRoute('board')}>
          <Icon name="back" size={12} /> Back to board
        </div>

        <div>
          {job.logo_url && (
            <img
              src={job.logo_url}
              alt={job.company || ''}
              style={{ maxWidth: 160, maxHeight: 80, width: 'auto', height: 'auto', objectFit: 'contain', marginBottom: 12, display: 'block' }}
              onError={e => e.target.style.display = 'none'}
            />
          )}
          <div className="eyebrow" style={{ marginBottom: 10 }}>{job.status}</div>
          <h1 className="detail-h">{job.title}</h1>
          <div className="detail-company">{job.company}{job.location ? ` · ${job.location}` : ''}</div>
        </div>

        <div className="detail-meta">
          <div><div className="k">Source</div><div className="v">{job.source || '—'}</div></div>
          <div><div className="k">Posted</div><div className="v">{job.posting_date || '—'}</div></div>
          <div>
            <div className="k">Deadline</div>
            <div className="v">{job.deadline || <span style={{ color: 'var(--ink-3)' }}>None set</span>}</div>
          </div>
          <div><div className="k">Type</div><div className="v">{job.job_type || '—'}</div></div>
          <div style={{ gridColumn: '1/-1' }}><div className="k">Salary</div><div className="v">{job.salary || '—'}</div></div>
          <div style={{ gridColumn: '1/-1' }}>
            <div className="k">Category</div>
            <div className="v">
              <select
                className="input"
                style={{ fontSize: 11, padding: '2px 6px', height: 'auto', width: 'auto' }}
                value={job.job_category || ''}
                onChange={e => saveJob({ job_category: e.target.value || null })}
              >
                <option value="tech">{settings.cv_label_1 || 'CV Profile 1'}</option>
                <option value="hospitality">{settings.cv_label_2 || 'CV Profile 2'}</option>
                <option value="">General</option>
              </select>
            </div>
          </div>
          {job.source_url && (
            <div style={{ gridColumn: '1/-1' }}>
              <div className="k">Listing</div>
              <div className="v mono" style={{ wordBreak: 'break-all', fontSize: 11 }}>
                <a href={job.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  {job.source_url}
                </a>
              </div>
            </div>
          )}
        </div>



        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Move to</div>
          <div className="status-select">
            {COLUMNS.map(c => (
              <div
                key={c}
                className={`status-pill ${c === job.status ? 'active' : ''}`}
                onClick={() => moveJob(c)}
              >
                <span className="dot" style={{ background: COL_COLORS[c] }} />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* RIGHT: tabbed workspace */}
      <div className="detail-main">
        <div className="tabs">
          {TABS.map(t => (
            <div
              key={t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
              {tabCounts[t] != null && <span className="tab-ct">{tabCounts[t]}</span>}
            </div>
          ))}
          <div className="flex-1" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0' }}>
            <button className="btn btn-accent btn-sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={11} /> Edit job
            </button>
            {job.source_url && (
              <a href={job.source_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                <Icon name="external" size={11} />
                View on {job.source || 'site'}
              </a>
            )}
          </div>
        </div>

        <div className="tab-body">
          {tab === 'Overview'     && <OverviewTab    job={job} saveJob={saveJob} descFetching={descFetching} descError={descError} onRefetchDesc={() => fetchDescription(job.id)} />}
          {tab === 'Cover Letter' && <CoverLetterTab job={job} saveJob={saveJob} onFileExported={file => { setJob(prev => ({ ...prev, files: [...(prev.files || []), file] })); setFileCount(c => c + 1) }} />}
          {tab === 'Chat'         && <ChatTab        job={job} onCountChange={setChatCount} />}
          {tab === 'Notes'        && <NotesTab       job={job} saveJob={saveJob} />}
          {tab === 'Files'        && <FilesTab       job={job} onCountChange={setFileCount} onFilesChange={files => setJob(prev => ({ ...prev, files }))} />}
        </div>
      </div>
    </div>

    {editing && (
      <AddJobModal
        initialJob={job}
        onSaved={updated => { setJob(updated); setJobs(prev => prev.map(j => j.id === updated.id ? updated : j)); setEditing(false) }}
        onCancel={() => setEditing(false)}
      />
    )}
    </>
  )
}
