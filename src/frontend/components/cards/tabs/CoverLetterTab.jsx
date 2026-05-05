import { useState } from 'react'
import RichTextEditor from '../../editor/RichTextEditor'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

export default function CoverLetterTab({ job, saveJob }) {
  const [content,    setContent]    = useState(job.cover_letter || '')
  const [generating, setGenerating] = useState(false)
  const [exporting,  setExporting]  = useState(null)
  const [error,      setError]      = useState('')

  const generate = async () => {
    setGenerating(true); setError('')
    try {
      const res = await api.post(`/jobs/${job.id}/cover-letter`, {})
      setContent(res.content)
      await saveJob({ cover_letter: res.content })
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  const handleChange = async (html) => {
    setContent(html)
    await saveJob({ cover_letter: html }).catch(() => {})
  }

  const exportAs = async (type) => {
    setExporting(type)
    try {
      const res = await api.post(`/jobs/${job.id}/export-${type}`, { html: content })
      alert(`Saved: ${res.filename}`)
    } catch (e) { setError(e.message) }
    finally { setExporting(null) }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <RichTextEditor content={content} onChange={handleChange} />

      <div className="cl-actions">
        <button className="btn btn-accent" onClick={generate} disabled={generating}>
          {generating ? <span className="spinner" /> : <Icon name="wand" size={12} />}
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>
        <button className="btn" onClick={() => exportAs('pdf')} disabled={!!exporting}>
          {exporting === 'pdf' ? <span className="spinner" /> : <Icon name="doc" size={12} />}
          Export as PDF
        </button>
        <button className="btn" onClick={() => exportAs('word')} disabled={!!exporting}>
          {exporting === 'word' ? <span className="spinner" /> : <Icon name="doc" size={12} />}
          Export as Word
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )
}
