import { useState, useEffect, useRef } from 'react'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'
import { useSpeech } from '../../../hooks/useSpeech'

export default function ChatTab({ job, onCountChange }) {
  const [messages,      setMessages]      = useState([])
  const [cvText,        setCvText]        = useState(null)
  const [draft,         setDraft]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [interviewMode, setInterviewMode] = useState(false)
  const [voiceMode,     setVoiceMode]     = useState(false)

  const bottomRef    = useRef(null)
  const prevCountRef = useRef(0)
  const voiceRef     = useRef(false)  // ref copy — safe to read inside callbacks/effects
  const sendTextRef  = useRef(null)
  const callbackRef  = useRef(null)

  const mode = interviewMode ? 'interview' : 'chat'
  const { listening, ttsEnabled, setTtsEnabled, startListening, stopListening, speak, stopSpeaking, supported } = useSpeech()

  // Always-current voice callback — no stale closures
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

  const sendText = async (text) => {
    if (!text.trim() || loading) return
    stopListening()
    setLoading(true); setError('')
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    try {
      const res = await api.post(`/jobs/${job.id}/chat`, { content: text, mode, cvText })
      setMessages(prev => [...prev, res])
      if (mode === 'chat') onCountChange?.(messages.length + 2)
    } catch (e) {
      setError(e.message)
    } finally { setLoading(false) }
  }
  sendTextRef.current = sendText

  // Load messages + CV when job/mode changes
  useEffect(() => {
    let cancelled = false
    setMessages([])
    setError('')

    if (!cvText) api.get(`/jobs/${job.id}/chat-context`).then(r => setCvText(r.cvText)).catch(() => {})
    api.get(`/jobs/${job.id}/chat?mode=${mode}`).then(async msgs => {
      if (cancelled) return
      setMessages(msgs)
      prevCountRef.current = msgs.length  // don't TTS already-existing messages
      if (mode === 'chat') onCountChange?.(msgs.length)

      if (mode === 'interview' && msgs.length === 0 && !cancelled) {
        const beginMsg = { role: 'user', content: 'Start mock interview', id: 'begin' }
        setMessages([beginMsg])
        setLoading(true)
        try {
          const res = await api.post(`/jobs/${job.id}/chat`, { content: 'Start mock interview', mode: 'interview', cvText })
          if (!cancelled) setMessages([beginMsg, res])
        } catch (e) {
          if (!cancelled) setError(e.message)
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [job.id, mode]) // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') speak(last.content)
    }
    prevCountRef.current = messages.length
  }, [messages]) // eslint-disable-line

  const send = () => {
    if (!draft.trim() || loading) return
    const text = draft.trim()
    setDraft('')
    sendText(text)
  }

  // Single mic button: click once → enters continuous voice mode (mic restarts after each response)
  //                    click again → exits voice mode entirely
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

  const toggleInterview = () => {
    stopListening()
    setInterviewMode(v => !v)
    setDraft('')
  }

  return (
    <div className="chat">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
        <div className="eyebrow">
          {interviewMode
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="person" size={12} /> Mock Interview · {job.company}</span>
            : `Claude · scoped to ${job.company}`}
        </div>
        <button
          className={`btn btn-sm ${interviewMode ? 'btn-primary' : 'btn-ghost'}`}
          onClick={toggleInterview}
          title="Toggle mock interview mode"
          style={{ gap: 5, fontSize: 11 }}
        >
          <Icon name="person" size={11} />
          {interviewMode ? 'Exit Interview' : 'Mock Interview'}
        </button>
      </div>

      {interviewMode && (
        <div style={{
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12,
          color: 'var(--ink-2)', marginBottom: 14, flexShrink: 0,
        }}>
          <strong style={{ color: 'var(--accent)' }}>Interview mode</strong> — Claude is playing the interviewer.
          {supported && ' Click the mic once to enter voice mode — it restarts automatically after each response.'}
        </div>
      )}

      <div className="chat-stream">
        {messages.length === 0 && !loading && !interviewMode && (
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
              <b>{m.role === 'user' ? 'James' : (interviewMode ? 'Interviewer' : 'Claude')}</b>
              <p>{m.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg">
            <div className="chat-av ai">C</div>
            <div className="chat-body">
              <b>{interviewMode ? 'Interviewer' : 'Claude'}</b>
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
          placeholder={
            listening ? 'Listening…'
              : voiceMode ? 'Voice mode — speak at any time…'
              : interviewMode ? 'Type or speak your answer…'
              : `Ask Claude about ${job.company}…`
          }
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
          rows={2}
        />
        <div className="chat-foot">
          <span className="hints" style={{ fontSize: 13 }}>
            {interviewMode
              ? '⌘↵ to send · interview mode'
              : '⌘↵ to send · context: JD + your CV'}
          </span>
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
                  title={voiceMode ? 'Click to exit voice mode' : 'Click to enter voice mode — mic restarts automatically after each response'}
                  style={listening ? { color: '#DC3545' } : voiceMode ? { color: 'var(--accent)' } : {}}
                >
                  <Icon name={listening ? 'mic-off' : 'mic'} size={15} />
                </button>
              </>
            )}
            <button
              className={`btn btn-ghost btn-sm${ttsEnabled ? ' active' : ''}`}
              onClick={() => setTtsEnabled(v => !v)}
              title={ttsEnabled ? 'Mute responses' : 'Read responses aloud'}
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
  )
}
