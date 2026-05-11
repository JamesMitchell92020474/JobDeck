import { useState, useEffect, useRef } from 'react'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

function fileExt(name) {
  return (name || '').split('.').pop().toLowerCase()
}
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}
function extLabel(name) {
  return fileExt(name).toUpperCase().slice(0, 4) || 'FILE'
}

const PREVIEWABLE = ['pdf']

export default function FilesTab({ job, onCountChange, onFilesChange }) {
  const [files,     setFiles]     = useState(job.files || [])
  const [uploading, setUploading] = useState(false)
  const [selected,  setSelected]  = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { setFiles(job.files || []) }, [job.id])
  useEffect(() => { onCountChange?.(files.length) }, [files])

  const upload = async (file) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/jobs/${job.id}/files`, { method: 'POST', body: fd })
      const data = await res.json()
      const newFile = { filename: data.filename, original_name: data.originalname, file_size: data.size, created_at: new Date().toISOString() }
      setFiles(prev => { const next = [...prev, newFile]; onFilesChange?.(next); return next })
    } catch {}
    setUploading(false)
  }

  const deleteFile = async (id) => {
    if (!confirm('Remove this file?')) return
    await api.delete(`/jobs/${job.id}/files/${id}`).catch(() => {})
    setFiles(prev => { const next = prev.filter(f => f.id !== id); onFilesChange?.(next); return next })
    if (selected?.id === id) setSelected(null)
  }

  const serveUrl = (file, download = false) =>
    `/api/jobs/${job.id}/files/${file.id}/serve${download ? '?download=1' : ''}`

  const canPreview = (file) => PREVIEWABLE.includes(fileExt(file.original_name || file.filename))

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 280px)' }}>
      {/* File list — fixed width, never shrinks */}
      <div style={{ width: 520, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="eyebrow">Attached files · {files.length}</div>
          <button className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : <Icon name="upload" size={11} />}
            Upload
          </button>
          <input ref={inputRef} type="file" style={{ display: 'none' }}
            onChange={e => e.target.files[0] && upload(e.target.files[0])} />
        </div>

        {files.length > 0 ? (
          <div className="files">
            {files.map((f, i) => (
              <div
                key={f.id || i}
                className={`file-row ${selected?.id === f.id ? 'file-row-active' : ''}`}
                onClick={() => f.id && setSelected(selected?.id === f.id ? null : f)}
                style={{ cursor: f.id ? 'pointer' : 'default' }}
                title={f.original_name || f.filename}
              >
                <div className="file-ic">{extLabel(f.original_name || f.filename)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.original_name || f.filename}
                  </b>
                  <span className="file-meta">{fmtSize(f.file_size)}</span>
                </div>
                {f.id && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <a
                      href={serveUrl(f, true)}
                      download
                      className="btn btn-ghost btn-sm icon-btn"
                      title="Download"
                      onClick={e => e.stopPropagation()}
                    >
                      <Icon name="download" size={12} />
                    </a>
                    <button className="btn btn-ghost btn-sm icon-btn" onClick={e => { e.stopPropagation(); deleteFile(f.id) }} title="Remove">
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="file-drop" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={18} />
            <div style={{ marginTop: 8 }}><b>Drop files here</b> or click to browse</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>CV, cover letters, portfolio, notes</div>
          </div>
        )}
      </div>

      {/* Preview panel */}
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.original_name || selected.filename}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <a href={serveUrl(selected, true)} download className="btn btn-ghost btn-sm">
                <Icon name="download" size={11} /> Download
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
                <Icon name="x" size={11} />
              </button>
            </div>
          </div>

          {canPreview(selected) ? (
            <iframe
              src={serveUrl(selected)}
              style={{ flex: 1, border: '1px solid var(--rule)', borderRadius: 6, width: '100%', background: '#fff', display: 'block' }}
              title={selected.original_name}
            />
          ) : (
            <div style={{
              flex: 1, minHeight: 200, border: '1px solid var(--rule)', borderRadius: 6,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 12, color: 'var(--ink-3)', background: 'var(--bg-2)'
            }}>
              <div style={{ fontSize: 32 }}>📄</div>
              <div style={{ fontSize: 14 }}>.{fileExt(selected.original_name || selected.filename).toUpperCase()} files can't be previewed in the browser</div>
              <a href={serveUrl(selected, true)} download className="btn btn-accent btn-sm">
                <Icon name="download" size={11} /> Download to open
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
