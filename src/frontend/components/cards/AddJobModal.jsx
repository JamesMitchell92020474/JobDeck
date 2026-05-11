import { useState } from 'react'
import Icon from '../ui/Icon'
import api from '../../hooks/useApi'

const SOURCES    = ['Manual', 'Seek', 'Trade Me Jobs', 'LinkedIn', 'Other']
const JOB_TYPES  = ['', 'Full-time', 'Part-time', 'Contract', 'Casual', 'Internship']
const CATEGORIES = [{ value: '', label: 'Auto-detect' }, { value: 'tech', label: 'Tech / IT' }, { value: 'hospitality', label: 'Hospitality / Retail' }]

const EMPTY = {
  title: '', company: '', location: '', source: 'Manual', source_url: '',
  description: '', salary: '', job_type: '', posting_date: '', expiry_date: '',
  deadline: '', is_remote: false, is_hybrid: false, job_category: '',
}

export default function AddJobModal({ initialStatus, onSaved, onCancel }) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    try {
      const job = await api.post('/jobs', { ...form, status: initialStatus })
      onSaved(job)
    } catch (err) {
      setError(err?.message || 'Failed to save job')
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>Add job to {initialStatus}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ padding: '4px 8px' }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="modal-body">

          {/* Title */}
          <div className="form-row full">
            <label className="form-label">Job title <span style={{ color: 'var(--col-rejected)' }}>*</span></label>
            <input className="input" autoFocus value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Front End Developer" />
          </div>

          {/* Company + Location */}
          <div className="form-row-2">
            <div className="form-row">
              <label className="form-label">Company</label>
              <input className="input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="e.g. Xero" />
            </div>
            <div className="form-row">
              <label className="form-label">Location</label>
              <input className="input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Christchurch" />
            </div>
          </div>

          {/* Source + Source URL */}
          <div className="form-row-2">
            <div className="form-row">
              <label className="form-label">Source</label>
              <select className="input" value={form.source} onChange={e => set('source', e.target.value)}>
                {SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">Listing URL</label>
              <input className="input" value={form.source_url} onChange={e => set('source_url', e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {/* Description */}
          <div className="form-row full">
            <label className="form-label">Description</label>
            <textarea
              className="input"
              style={{ minHeight: 180, resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.6 }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Paste the job description here…"
            />
          </div>

          {/* Salary + Job type */}
          <div className="form-row-2">
            <div className="form-row">
              <label className="form-label">Salary</label>
              <input className="input" value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="e.g. $75,000–$90,000" />
            </div>
            <div className="form-row">
              <label className="form-label">Job type</label>
              <select className="input" value={form.job_type} onChange={e => set('job_type', e.target.value)}>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t || '— select —'}</option>)}
              </select>
            </div>
          </div>

          {/* Category + Deadline */}
          <div className="form-row-2">
            <div className="form-row">
              <label className="form-label">Category</label>
              <select className="input" value={form.job_category} onChange={e => set('job_category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label className="form-label">Deadline</label>
              <input className="input" value={form.deadline} onChange={e => set('deadline', e.target.value)} placeholder="e.g. 30 May" />
            </div>
          </div>

          {/* Posting date + Expiry date */}
          <div className="form-row-2">
            <div className="form-row">
              <label className="form-label">Posting date</label>
              <input className="input" value={form.posting_date} onChange={e => set('posting_date', e.target.value)} placeholder="e.g. 10 May" />
            </div>
            <div className="form-row">
              <label className="form-label">Expiry date</label>
              <input className="input" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} placeholder="e.g. 31 May" />
            </div>
          </div>

          {/* Remote / Hybrid */}
          <div className="form-row full" style={{ flexDirection: 'row', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_remote} onChange={e => set('is_remote', e.target.checked)} />
              Remote
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.is_hybrid} onChange={e => set('is_hybrid', e.target.checked)} />
              Hybrid
            </label>
          </div>

          {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--col-rejected)' }}>{error}</p>}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-accent" disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : 'Add job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
