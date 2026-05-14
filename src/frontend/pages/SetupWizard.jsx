import { useState } from 'react'

const ACCENT = '#423A8E'
const ACCENT_SOFT = 'rgba(66,58,142,0.1)'

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#14132A', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: '#888', marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

function PathInput({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        display: 'block', width: '100%', boxSizing: 'border-box',
        padding: '9px 12px', fontSize: 13, fontFamily: 'Consolas, monospace',
        border: '1px solid #ddd', borderRadius: 8,
        background: '#fafafa', color: '#14132A', outline: 'none',
      }}
      onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_SOFT}` }}
      onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
    />
  )
}

function StepPaths({ form, set, onNext }) {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT, marginBottom: 8 }}>
          Step 1 of 2
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Storage paths</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          Choose where JobDeck stores its data. These folders will be created automatically.
          You can use any drive or folder on your PC.
        </p>
      </div>

      <Field label="Data folder" hint="Database and uploaded files (CVs, cover letters, attachments)">
        <PathInput value={form.dataPath} onChange={v => set('dataPath', v)} />
      </Field>
      <Field label="Backup folder" hint="Zip backups created via Settings → Export backup">
        <PathInput value={form.backupPath} onChange={v => set('backupPath', v)} />
      </Field>
      <Field label="Log folder" hint="Monthly rotating log files">
        <PathInput value={form.logPath} onChange={v => set('logPath', v)} />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={onNext}
          disabled={!form.dataPath.trim()}
          style={{
            padding: '10px 24px', fontSize: 13.5, fontWeight: 600,
            background: form.dataPath.trim() ? ACCENT : '#ccc',
            color: '#fff', border: 'none', borderRadius: 8, cursor: form.dataPath.trim() ? 'pointer' : 'default',
            transition: 'opacity 0.15s',
          }}
        >
          Next →
        </button>
      </div>
    </>
  )
}

function StepProfile({ form, set, onBack, onFinish }) {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT, marginBottom: 8 }}>
          Step 2 of 2
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Profile &amp; API key</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          Your name appears in the dashboard greeting. The API key enables AI features — scoring,
          chat, cover letters, and interview practice.
        </p>
      </div>

      <Field label="Your name" hint="How you'd like to be greeted">
        <input
          value={form.displayName}
          onChange={e => set('displayName', e.target.value)}
          placeholder="e.g. James"
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: 13.5,
            border: '1px solid #ddd', borderRadius: 8,
            background: '#fafafa', color: '#14132A', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_SOFT}` }}
          onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
        />
      </Field>

      <Field label="Location" hint="City or region used for job searches and weather">
        <input
          value={form.location}
          onChange={e => set('location', e.target.value)}
          placeholder="e.g. Christchurch"
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: 13.5,
            border: '1px solid #ddd', borderRadius: 8,
            background: '#fafafa', color: '#14132A', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_SOFT}` }}
          onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
        />
      </Field>

      <Field
        label="Anthropic API key"
        hint={<>Required for AI features. Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: ACCENT }}>console.anthropic.com</a></>}
      >
        <input
          value={form.apiKey}
          onChange={e => set('apiKey', e.target.value)}
          type="password"
          placeholder="sk-ant-api…"
          style={{
            display: 'block', width: '100%', boxSizing: 'border-box',
            padding: '9px 12px', fontSize: 13, fontFamily: 'Consolas, monospace',
            border: '1px solid #ddd', borderRadius: 8,
            background: '#fafafa', color: '#14132A', outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_SOFT}` }}
          onBlur={e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }}
        />
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.createShortcut}
          onChange={e => set('createShortcut', e.target.checked)}
          style={{ width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13.5, color: '#333' }}>Add a JobDeck shortcut to my desktop</span>
      </label>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 500,
            background: 'transparent', color: '#666',
            border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          onClick={onFinish}
          style={{
            padding: '10px 24px', fontSize: 13.5, fontWeight: 600,
            background: ACCENT, color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer',
          }}
        >
          Finish setup
        </button>
      </div>
    </>
  )
}

function StepRestarting() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{
        width: 48, height: 48, margin: '0 auto 20px',
        border: `3px solid ${ACCENT_SOFT}`,
        borderTopColor: ACCENT,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: '#14132A' }}>
        Setting up your JobDeck…
      </h2>
      <p style={{ margin: 0, fontSize: 13.5, color: '#888' }}>
        This will only take a moment.
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default function SetupWizard({ defaults, onDismiss }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    dataPath:    defaults.dataPath,
    backupPath:  defaults.backupPath,
    logPath:     defaults.logPath,
    apiKey:         '',
    displayName:    '',
    location:       '',
    createShortcut: true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const finish = async () => {
    setStep(3)
    try {
      await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } catch {}
    // Server is restarting — poll health until it's back up
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/health')
        if (r.ok) { clearInterval(poll); window.location.reload() }
      } catch {}
    }, 1000)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F5F4F8', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#fff', borderRadius: 16,
        boxShadow: '0 4px 40px rgba(20,19,42,0.10)',
        overflow: 'hidden',
      }}>
        {/* Brand header */}
        <div style={{
          background: '#2d4a63', padding: '20px 32px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 800, color: '#fff', fontStyle: 'italic',
            fontFamily: 'Georgia, serif', flexShrink: 0,
          }}>
            JD
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>JobDeck</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 }}>{onDismiss ? 'Setup wizard preview' : 'First-time setup'}</div>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }} title="Close preview">×</button>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: '32px 32px 28px' }}>
          {step === 1 && <StepPaths form={form} set={set} onNext={() => setStep(2)} />}
          {step === 2 && <StepProfile form={form} set={set} onBack={() => setStep(1)} onFinish={finish} />}
          {step === 3 && <StepRestarting />}
        </div>
      </div>
    </div>
  )
}
