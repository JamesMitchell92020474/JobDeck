// The chat tab inside a job card detail view.
// Supports two modes:
//   "chat"      — a regular Q&A with Claude about this specific role (uses the job
//                 description and the user's CV as context).
//   "interview" — a mock interview where Claude plays the interviewer. Tracks answer
//                 duration and filler words for the final assessment. Transcripts can
//                 be saved and compared across sessions.
//
// Voice mode: clicking the mic once enters a hands-free loop — the mic restarts
// automatically after each response so the user can speak continuously.
import { useState, useEffect, useRef } from 'react'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'
import { useApp } from '../../../context/AppContext'
import { useSpeech } from '../../../hooks/useSpeech'

// Filler words to detect in interview answers — counted and reported in the assessment.
const FILLERS = {
  'um':        /\bum+\b/gi,
  'uh':        /\buh+\b/gi,
  'er':        /\ber+\b/gi,
  'like':      /\blike\b/gi,
  'you know':  /\byou know\b/gi,
  'sort of':   /\bsort of\b/gi,
  'kind of':   /\bkind of\b/gi,
  'basically': /\bbasically\b/gi,
  'literally': /\bliterally\b/gi,
  'i mean':    /\bi mean\b/gi,
  'actually':  /\bactually\b/gi,
}

function detectFillerWords(text) {
  const result = {}
  for (const [word, regex] of Object.entries(FILLERS)) {
    const count = (text.match(regex) || []).length
    if (count > 0) result[word] = count
  }
  return result
}

export default function ChatTab({ job, onCountChange }) {
  const { settings } = useApp()
  const [messages,      setMessages]      = useState([])
  const [cvText,        setCvText]        = useState(null)
  const [draft,         setDraft]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [interviewMode, setInterviewMode] = useState(false)
  const [voiceMode,     setVoiceMode]     = useState(false)
  const [runs,          setRuns]          = useState([])
  const [expandedRun,   setExpandedRun]   = useState(null)
  const [saving,        setSaving]        = useState(false)
  const hasSavedRunsRef = useRef(false)  // prevents auto-begin after a save

  const bottomRef          = useRef(null)
  const prevCountRef       = useRef(0)
  const voiceRef           = useRef(false)
  const sendTextRef        = useRef(null)
  const callbackRef        = useRef(null)
  const questionTimestamp  = useRef(null)  // when the last interviewer question appeared

  const mode = interviewMode ? 'interview' : 'chat'
  const { listening, ttsEnabled, setTtsEnabled, startListening, stopListening, speak, stopSpeaking, supported } = useSpeech()

  // Build answer metadata — called just before submitting in interview mode
  const buildAnswerMeta = (text) => {
    if (!interviewMode || !questionTimestamp.current) return null
    const duration   = Math.round((Date.now() - questionTimestamp.current) / 1000)
    const wordCount  = text.trim().split(/\s+/).filter(Boolean).length
    const fillerWords = detectFillerWords(text)
    questionTimestamp.current = null
    return { duration, wordCount, fillerWords }
  }

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
      () => { if (voiceRef.current) setTimeout(startVoice, 100) }
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
    const answerMeta = buildAnswerMeta(text)
    setLoading(true); setError('')
    setMessages(prev => [...prev, { role: 'user', content: text, id: Date.now() }])
    try {
      const res = await api.post(`/jobs/${job.id}/chat`, { content: text, mode, cvText, answerMeta })
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
    questionTimestamp.current = null

    if (!cvText) api.get(`/jobs/${job.id}/chat-context`).then(r => setCvText(r.cvText)).catch(() => {})
    if (mode === 'interview') {
      api.get(`/jobs/${job.id}/interview-runs`).then(loaded => {
        setRuns(loaded)
        hasSavedRunsRef.current = loaded.length > 0
      }).catch(() => {})
    }
    api.get(`/jobs/${job.id}/chat?mode=${mode}`).then(async msgs => {
      if (cancelled) return
      setMessages(msgs)
      prevCountRef.current = msgs.length
      if (mode === 'chat') onCountChange?.(msgs.length)

      // Auto-begin only on first ever use (no saved runs)
      if (mode === 'interview' && msgs.length === 0 && !hasSavedRunsRef.current && !cancelled) {
        await beginInterview(cvText, cancelled)
      }
    }).catch(() => {})

    return () => { cancelled = true }
  }, [job.id, mode]) // eslint-disable-line

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // TTS + start answer timer when a new question arrives
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') {
        speak(last.content)
        if (interviewMode) questionTimestamp.current = Date.now()
      }
    }
    prevCountRef.current = messages.length
  }, [messages]) // eslint-disable-line

  const send = () => {
    if (!draft.trim() || loading) return
    const text = draft.trim()
    setDraft('')
    sendText(text)
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

  const beginInterview = async (cv = cvText, cancelled = false) => {
    const beginMsg = { role: 'user', content: 'Start mock interview', id: 'begin' }
    setMessages([beginMsg])
    setLoading(true)
    try {
      const res = await api.post(`/jobs/${job.id}/chat`, { content: 'Start mock interview', mode: 'interview', cvText: cv })
      if (!cancelled) setMessages([beginMsg, res])
    } catch (e) {
      if (!cancelled) setError(e.message)
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  const toggleInterview = () => {
    stopListening()
    setInterviewMode(v => !v)
    setDraft('')
    questionTimestamp.current = null
  }

  const saveInterview = async () => {
    if (!messages.some(m => m.role === 'user') || saving) return
    setSaving(true)
    try {
      await api.post(`/jobs/${job.id}/interview-runs/save`, {})
      const updatedRuns = await api.get(`/jobs/${job.id}/interview-runs`)
      hasSavedRunsRef.current = updatedRuns.length > 0
      setRuns(updatedRuns)
      setMessages([])
      prevCountRef.current = 0
    } catch {}
    finally { setSaving(false) }
  }

  const deleteRun = async (runId) => {
    if (!confirm('Delete this saved interview?')) return
    await api.delete(`/jobs/${job.id}/interview-runs/${runId}`).catch(() => {})
    setRuns(prev => prev.filter(r => r.id !== runId))
    if (expandedRun === runId) setExpandedRun(null)
  }

  const loadRunTranscript = async (runId) => {
    if (expandedRun === runId) { setExpandedRun(null); return }
    try {
      const run = await api.get(`/jobs/${job.id}/interview-runs/${runId}`)
      setRuns(prev => prev.map(r => r.id === runId ? { ...r, transcript: run.transcript } : r))
      setExpandedRun(runId)
    } catch {}
  }

  const accentStyle = { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', gap: 5, fontSize: 11 }

  return (
    <div className="chat">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexShrink: 0 }}>
        <div className="eyebrow">
          {interviewMode
            ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="person" size={12} /> Mock Interview · {job.company}</span>
            : `Claude · scoped to ${job.company}`}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {interviewMode && messages.some(m => m.role === 'user') && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={saveInterview}
              disabled={saving}
              title="Save this interview transcript and clear for a new session"
            >
              {saving ? 'Saving…' : 'Save Interview'}
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={toggleInterview}
            title="Toggle mock interview mode"
            style={accentStyle}
          >
            <Icon name="person" size={11} />
            {interviewMode ? 'Exit Interview' : 'Mock Interview'}
          </button>
        </div>
      </div>

      {interviewMode && (
        <div style={{
          background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          borderRadius: 8, padding: '8px 12px', fontSize: 12,
          color: 'var(--ink-2)', marginBottom: 14, flexShrink: 0,
        }}>
          <strong style={{ color: 'var(--accent)' }}>Interview mode</strong> — 15 questions, no mid-interview feedback. Assessment at the end.
          {supported ? ' Enable voice mode for a hands-free experience.' : ' Type your answers below.'}
        </div>
      )}

      {/* Past interviews panel */}
      {interviewMode && runs.length > 0 && (
        <div style={{ marginBottom: 14, flexShrink: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Past interviews ({runs.length})</div>
          {runs.map(run => (
            <div key={run.id} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', background: 'var(--bg-2)' }}
                onClick={() => loadRunTranscript(run.id)}
              >
                <span style={{ fontSize: 12, fontWeight: 500 }}>
                  {new Date(run.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{expandedRun === run.id ? 'Hide' : 'View'}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={e => { e.stopPropagation(); deleteRun(run.id) }}
                    style={{ padding: '2px 4px', color: 'var(--ink-3)' }}
                    title="Delete this saved interview"
                  >
                    <Icon name="trash" size={11} />
                  </button>
                </div>
              </div>
              {expandedRun === run.id && run.transcript && (
                <pre style={{ margin: 0, padding: '12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-body)', maxHeight: 400, overflowY: 'auto', background: 'var(--surface)' }}>
                  {run.transcript}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="chat-stream">
        {messages.length === 0 && !loading && interviewMode && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0', color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' }}>
            <Icon name="person" size={32} />
            <div>{runs.length > 0 ? 'Ready for another interview?' : 'Start your first mock interview for this role.'}</div>
            <button className="btn btn-sm" style={accentStyle} onClick={() => beginInterview()}>
              <Icon name="person" size={11} /> Start {runs.length > 0 ? 'New ' : ''}Interview
            </button>
          </div>
        )}
        {messages.length === 0 && !loading && !interviewMode && (
          <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
            Ask Claude anything about this role — prep questions, cover letter tips, company research…
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id || i} className="chat-msg">
            <div className={`chat-av ${m.role === 'user' ? 'me' : 'ai'}`}>
              {m.role === 'user' ? (settings.display_name?.[0]?.toUpperCase() || 'J') : 'C'}
            </div>
            <div className="chat-body">
              <b>{m.role === 'user' ? (settings.display_name || 'You') : (interviewMode ? 'Interviewer' : 'Claude')}</b>
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
            listening   ? 'Listening…'
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
            {interviewMode ? '⌘↵ to send · interview mode' : '⌘↵ to send · context: JD + your CV'}
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
