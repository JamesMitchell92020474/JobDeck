import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import Icon from '../components/ui/Icon'
import api from '../hooks/useApi'

export default function Chat() {
  const { jobs } = useApp()
  const [messages, setMessages] = useState([])
  const [draft,    setDraft]    = useState('')
  const [deep,     setDeep]     = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    api.get('/chat').then(setMessages).catch(() => {})
  }, [])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!draft.trim() || loading) return
    const text = draft.trim()
    setDraft(''); setLoading(true); setError('')
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    try {
      const res = await api.post('/chat', { content: text, deep_analysis: deep })
      setMessages(prev => [...prev, res])
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }

  const clear = async () => {
    if (!confirm('Clear chat history?')) return
    await api.delete('/chat').catch(() => {})
    setMessages([])
  }

  return (
    <div style={{ padding: 'var(--pad)', height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Global chat</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 24, letterSpacing: '-0.02em' }}>
            Claude · your full job search
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            Context: {jobs.filter(j => !j.is_soft_deleted).length} active jobs
          </span>
          <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
        </div>
      </div>

      <div className="chat" style={{ flex: 1, overflow: 'hidden' }}>
        <div className="chat-stream">
          {messages.length === 0 && (
            <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
              Ask anything about your job search — compare opportunities, prep for interviews, analyse your pipeline, draft emails…
            </div>
          )}
          {messages.map((m, i) => (
            <div key={m.id || i} className="chat-msg">
              <div className={`chat-av ${m.role === 'user' ? 'me' : 'ai'}`}>
                {m.role === 'user' ? 'J' : 'C'}
              </div>
              <div className="chat-body">
                <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.role === 'user' ? 'James' : 'Claude'}
                  {m.is_deep_analysis ? <span className="deep-analysis-badge"><Icon name="cpu" size={10} /> Deep Analysis</span> : null}
                </b>
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

        <div className="chat-input-wrap" style={{ flexShrink: 0 }}>
          <textarea
            className="chat-input"
            placeholder="Ask about your job search…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            rows={2}
          />
          <div className="chat-foot">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="hints">⌘↵ to send</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
                <span
                  className={`toggle ${deep ? 'on' : ''}`}
                  onClick={() => setDeep(d => !d)}
                  style={{ width: 28, height: 16 }}
                />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="cpu" size={12} /> Deep Analysis
                </span>
              </label>
              {deep && <span className="deep-analysis-badge">Uses Opus · higher cost</span>}
            </div>
            <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !draft.trim()}>
              <Icon name="send" size={11} /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
