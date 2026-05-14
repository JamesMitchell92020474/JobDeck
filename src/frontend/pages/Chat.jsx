// The global chat page — a full conversation with Claude about the user's
// entire job search pipeline. Supports named sessions (like browser tabs),
// voice mode (mic auto-restarts after each response), and text-to-speech.
//
// Key design decisions:
//  - Job context is fetched once on mount and passed with every message
//    so the database isn't queried on each send.
//  - Sessions are stored in global_chat_sessions and messages in global_chat.
//  - Voice mode is driven by useSpeech — clicking the mic once enters a loop
//    where the mic restarts automatically after Claude replies.
import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import Icon from '../components/ui/Icon'
import api from '../hooks/useApi'
import { useSpeech } from '../hooks/useSpeech'

// Formats an ISO date string into a human-readable NZ date like "5 Jan 2025".
function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Chat() {
  const { jobs, settings } = useApp()
  const [sessions,         setSessions]         = useState([])
  const [activeSessionId,  setActiveSessionId]  = useState(null)
  const [messages,         setMessages]         = useState([])
  const [jobContext,       setJobContext]        = useState(null)
  const [draft,            setDraft]            = useState('')
  const [deep,             setDeep]             = useState(false)
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState('')
  const [showPicker,       setShowPicker]       = useState(false)
  const [editingName,      setEditingName]      = useState(false)
  const [nameInput,        setNameInput]        = useState('')

  const [voiceMode, setVoiceMode] = useState(false)

  const bottomRef  = useRef(null)
  const prevCount  = useRef(0)
  const pickerRef  = useRef(null)
  const nameRef    = useRef(null)
  const voiceRef   = useRef(false)
  const sendTextRef = useRef(null)
  const callbackRef = useRef(null)

  const { listening, ttsEnabled, setTtsEnabled, startListening, stopListening, speak, stopSpeaking, supported } = useSpeech()

  // Load sessions + context on mount
  useEffect(() => {
    api.get('/chat/sessions').then(async loaded => {
      if (loaded.length === 0) {
        const s = await api.post('/chat/sessions', {})
        setSessions([s])
        setActiveSessionId(s.id)
      } else {
        setSessions(loaded)
        setActiveSessionId(loaded[0].id)
      }
    }).catch(() => {})
    api.get('/chat/context').then(r => setJobContext(r.context)).catch(() => {})
  }, [])

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) return
    setMessages([])
    setError('')
    api.get(`/chat?session_id=${activeSessionId}`).then(msgs => {
      setMessages(msgs)
      prevCount.current = msgs.length  // don't TTS already-existing messages
    }).catch(() => {})
  }, [activeSessionId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Always-current voice callback
  callbackRef.current = (transcript, isFinal) => {
    stopSpeaking()
    setDraft(transcript)
    if (isFinal) {
      stopListening()
      setDraft('')
      sendTextRef.current?.(transcript)
    }
  }

  const startVoice = () => {
    if (!voiceRef.current) return
    startListening(
      (...args) => callbackRef.current?.(...args),
      () => { if (voiceRef.current) setTimeout(startVoice, 100) }  // natural timeout → restart
    )
  }

  // Auto-restart mic after each assistant message while voice mode is on
  useEffect(() => {
    if (!voiceRef.current) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const t = setTimeout(startVoice, 200)
    return () => clearTimeout(t)
  }, [messages]) // eslint-disable-line

  // TTS on new assistant messages
  useEffect(() => {
    if (messages.length > prevCount.current) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') speak(last.content)
    }
    prevCount.current = messages.length
  }, [messages]) // eslint-disable-line

  // Close picker on outside click
  useEffect(() => {
    const handler = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeSession = sessions.find(s => s.id === activeSessionId)

  const sendText = async (text) => {
    if (!text.trim() || loading || !activeSessionId) return
    stopListening()
    setLoading(true); setError('')
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    try {
      const res = await api.post('/chat', { content: text, deep_analysis: deep, context: jobContext, session_id: activeSessionId })
      setMessages(prev => [...prev, res])
      if (res.session_name) {
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, name: res.session_name } : s))
      }
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }
  sendTextRef.current = sendText

  const send = () => {
    if (!draft.trim() || loading) return
    const text = draft.trim()
    setDraft('')
    sendText(text)
  }

  const newChat = async () => {
    try {
      const s = await api.post('/chat/sessions', {})
      setSessions(prev => [s, ...prev].slice(0, 20))
      setActiveSessionId(s.id)
      setMessages([])
      setShowPicker(false)
    } catch {}
  }

  const switchSession = (id) => {
    setActiveSessionId(id)
    setShowPicker(false)
  }

  const deleteSession = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this chat?')) return
    await api.delete(`/chat/sessions/${id}`).catch(() => {})
    const remaining = sessions.filter(s => s.id !== id)
    setSessions(remaining)
    if (id === activeSessionId) {
      if (remaining.length > 0) {
        setActiveSessionId(remaining[0].id)
      } else {
        // Auto-create a new session if none left
        const s = await api.post('/chat/sessions', {}).catch(() => null)
        if (s) { setSessions([s]); setActiveSessionId(s.id) }
      }
      setMessages([])
    }
    setShowPicker(false)
  }

  const startRename = () => {
    setNameInput(activeSession?.name || '')
    setEditingName(true)
    setTimeout(() => nameRef.current?.focus(), 30)
  }

  const commitRename = async () => {
    setEditingName(false)
    const name = nameInput.trim()
    if (!name || name === activeSession?.name) return
    await api.patch(`/chat/sessions/${activeSessionId}`, { name }).catch(() => {})
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, name } : s))
  }

  const handleMic = () => {
    if (voiceRef.current) {
      voiceRef.current = false
      setVoiceMode(false)
      stopListening()
      stopSpeaking()
      setDraft('')
    } else {
      voiceRef.current = true
      setVoiceMode(true)
      if (!ttsEnabled) setTtsEnabled(true)
      stopSpeaking()
      startVoice()
    }
  }

  const sessionDisplayName = activeSession?.name || 'New chat'

  return (
    <div style={{ padding: 'var(--pad)', height: 'calc(100vh - var(--topbar-h))', display: 'flex', flexDirection: 'column', maxWidth: 860, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Global chat</div>
          {editingName ? (
            <input
              ref={nameRef}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(false) }}
              style={{
                fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22,
                letterSpacing: '-0.02em', background: 'transparent',
                border: 'none', borderBottom: '2px solid var(--accent)',
                outline: 'none', color: 'var(--ink-1)', width: '100%', padding: '2px 0',
              }}
            />
          ) : (
            <h2
              onClick={startRename}
              title="Click to rename"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 22, letterSpacing: '-0.02em', cursor: 'text', display: 'inline-block' }}
            >
              {sessionDisplayName}
            </h2>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 16, paddingTop: 20 }}>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {jobs.filter(j => !j.is_soft_deleted).length} active jobs
          </span>

          {/* Session picker */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowPicker(v => !v)}
              style={{ gap: 4 }}
            >
              <Icon name="chat" size={12} /> Chats
            </button>
            {showPicker && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 6,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                minWidth: 280, zIndex: 200, overflow: 'hidden',
              }}>
                {sessions.map(s => (
                  <div
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '9px 12px', cursor: 'pointer',
                      background: s.id === activeSessionId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                      borderLeft: s.id === activeSessionId ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                    onMouseEnter={e => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'var(--bg-2)' }}
                    onMouseLeave={e => { if (s.id !== activeSessionId) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: s.id === activeSessionId ? 500 : 400, color: 'var(--ink-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name || 'New chat'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{formatDate(s.created_at)}</div>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={e => deleteSession(e, s.id)}
                      style={{ padding: '2px 4px', color: 'var(--ink-3)', flexShrink: 0 }}
                      title="Delete chat"
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                ))}
                {sessions.length === 20 && (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-3)', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                    Showing 20 most recent chats · older chats are removed
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="btn btn-ghost btn-sm" onClick={newChat}>
            <Icon name="plus" size={12} /> New
          </button>
        </div>
      </div>

      {/* Chat */}
      <div className="chat" style={{ flex: 1, overflow: 'hidden' }}>
        <div className="chat-stream">
          {messages.length === 0 && !loading && (
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
                  {m.role === 'user' ? (settings.display_name || 'You') : 'Claude'}
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
            placeholder={listening ? 'Listening…' : 'Ask about your job search…'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            rows={2}
          />
          <div className="chat-foot">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
                <span className={`toggle ${deep ? 'on' : ''}`} onClick={() => setDeep(d => !d)} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="cpu" size={12} /> Deep Analysis
                </span>
              </label>
              {deep && <span className="deep-analysis-badge">Uses Opus · higher cost</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {supported && (
                <>
                  {voiceMode && (
                    <span style={{ fontSize: 11, color: listening ? '#DC3545' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
                      {listening ? 'Listening…' : 'waiting…'}
                    </span>
                  )}
                  <button
                    className={`btn btn-ghost btn-sm${(voiceMode || listening) ? ' active' : ''}`}
                    onClick={handleMic}
                    title={voiceMode ? 'Click to exit voice mode' : 'Click to enter voice mode — mic restarts after each response'}
                    style={listening ? { color: '#DC3545' } : voiceMode ? { color: 'var(--accent)' } : {}}
                  >
                    <Icon name={listening ? 'mic-off' : 'mic'} size={15} />
                  </button>
                </>
              )}
              <button
                className={`btn btn-ghost btn-sm${ttsEnabled ? ' active' : ''}`}
                onClick={() => setTtsEnabled(v => !v)}
                title={ttsEnabled ? 'Mute Claude responses' : 'Read Claude responses aloud'}
                style={ttsEnabled ? { color: 'var(--accent)' } : {}}
              >
                <Icon name={ttsEnabled ? 'speaker' : 'speaker-off'} size={15} />
              </button>
              <button className="btn btn-primary btn-sm" onClick={send} disabled={loading || !draft.trim()}>
                <Icon name="send" size={13} /> Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
