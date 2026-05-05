import { useState } from 'react'

export default function NotesTab({ job, saveJob }) {
  const [notes,  setNotes]  = useState(job.notes || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await saveJob({ notes }).catch(() => {})
    setSaving(false)
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>Personal notes · only visible to you</div>
      <textarea
        className="notes-area"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Recruiter name, interview notes, salary expectations, follow-up actions…"
      />
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 8 }}>
        {saving ? 'Saving…' : 'Changes saved automatically on blur'}
      </div>
    </div>
  )
}
