import { useState, useEffect, useRef } from 'react'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

function fileExt(name) {
  return (name || '').split('.').pop().toUpperCase().slice(0, 4) || 'FILE'
}
function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export default function FilesTab({ job, onCountChange }) {
  const [files,    setFiles]    = useState(job.files || [])
  const [uploading,setUploading]= useState(false)
  const inputRef = useRef(null)

  useEffect(() => { onCountChange?.(files.length) }, [files])

  const upload = async (file) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch(`/api/jobs/${job.id}/files`, { method: 'POST', body: fd })
      const data = await res.json()
      setFiles(prev => [...prev, { filename: data.filename, original_name: data.originalname, file_size: data.size, created_at: new Date().toISOString() }])
    } catch {}
    setUploading(false)
  }

  const deleteFile = async (id) => {
    if (!confirm('Remove this file?')) return
    await api.delete(`/jobs/${job.id}/files/${id}`).catch(() => {})
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="eyebrow">Attached files · {files.length}</div>
        <button className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <span className="spinner" /> : <Icon name="upload" size={11} />}
          Upload
        </button>
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && upload(e.target.files[0])} />
      </div>

      {files.length > 0 ? (
        <div className="files">
          {files.map((f, i) => (
            <div key={f.id || i} className="file-row">
              <div className="file-ic">{fileExt(f.original_name || f.filename)}</div>
              <div>
                <b>{f.original_name || f.filename}</b>
              </div>
              <span className="file-meta">{fmtSize(f.file_size)}</span>
              <span className="file-meta">
                {f.created_at ? new Date(f.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) : ''}
              </span>
              {f.id && (
                <button className="btn btn-ghost btn-sm icon-btn" onClick={() => deleteFile(f.id)} title="Remove">
                  <Icon name="trash" size={12} />
                </button>
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
  )
}
