import { useState, useEffect, useRef } from 'react'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

export default function ChatTab({ job, onCountChange }) {
  const [messages, setMessages] = useState([])
  const [draft,    setDraft]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    api.get(`/jobs/${job.id}/chat`).then(msgs => {
      setMessages(msgs)
      onCountChange?.(msgs.length)
    }).catch(() => {})
  }, [job.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!draft.trim() || loading) return
    const text = draft.trim()
    setDraft(''); setLoading(true); setError('')
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    try {
      const res = await api.post(`/jobs/${job.id}/chat`, { content: text })
      setMessages(prev => [...prev, res])
      onCountChange?.(messages.length + 2)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="chat">
      <div className="eyebrow" style={{ marginBottom: 18, flexShrink: 0 }}>
        Claude · scoped to {job.company}
      </div>

      <div className="chat-stream">
        {messages.length === 0 && !loading && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            Ask Claude anything about this role — prep questions, cover letter tips, company research…
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id || i} className="chat-msg">
            <div className={`chat-av ${m.role === 'user' ? 'me' : 'ai'}`}>
              {m.role === 'user' ? 'J' : 'C'}
            </div>
            <div className="chat-body">
              <b>{m.role === 'user' ? 'James' : 'Claude'}</b>
              <p>{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg">
            <div className="chat-av ai">C</div>
            <div className="chat-body">
              <b>Claude</b>
              <p style={{ color: 'var(--ink-3)' }}><span className="spinner" style={{ marginRight: 6 }} />thinking…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 8 }}>{error}</div>}

      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          placeholder={`Ask Claude about ${job.company}…`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          rows={2}
        />
        <div className="chat-foot">
          <span className="hints">⌘↵ to send · context: JD + your CV</span>
          <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !draft.trim()}>
            <Icon name="send" size={11} /> Send
          </button>
        </div>
      </div>
    </div>
  )
}
