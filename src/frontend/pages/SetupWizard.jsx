import { useState, useRef } from 'react'

const ACCENT = '#423A8E'
const ACCENT_SOFT = 'rgba(66,58,142,0.1)'
const TOTAL_STEPS = 4

const inputStyle = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', fontSize: 13.5,
  border: '1px solid #ddd', borderRadius: 8,
  background: '#fafafa', color: '#14132A', outline: 'none',
}
const focusOn  = e => { e.target.style.borderColor = ACCENT; e.target.style.boxShadow = `0 0 0 3px ${ACCENT_SOFT}` }
const focusOff = e => { e.target.style.borderColor = '#ddd'; e.target.style.boxShadow = 'none' }

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#14132A', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 12, color: '#888', marginTop: 5 }}>{hint}</div>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', mono = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, fontFamily: mono ? 'Consolas, monospace' : undefined, fontSize: mono ? 13 : 13.5 }}
      onFocus={focusOn}
      onBlur={focusOff}
    />
  )
}

function KeywordsArea({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }}
      onFocus={focusOn}
      onBlur={focusOff}
    />
  )
}

function NavButtons({ onBack, onNext, nextLabel = 'Next →', nextDisabled = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: onBack ? 'space-between' : 'flex-end', alignItems: 'center', marginTop: 8 }}>
      {onBack && (
        <button onClick={onBack} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, background: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
          ← Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        style={{ padding: '10px 24px', fontSize: 13.5, fontWeight: 600, background: nextDisabled ? '#ccc' : ACCENT, color: '#fff', border: 'none', borderRadius: 8, cursor: nextDisabled ? 'default' : 'pointer' }}
      >
        {nextLabel}
      </button>
    </div>
  )
}

function StepEyebrow({ n }) {
  return <div style={{ fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', color: ACCENT, marginBottom: 8 }}>Step {n} of {TOTAL_STEPS}</div>
}

// ── Step 1: Storage paths ──────────────────────────────────────────────────────
function StepPaths({ form, set, onNext }) {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <StepEyebrow n={1} />
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Storage paths</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          Choose where JobDeck stores its data. These folders will be created automatically and can be changed later in Settings.
        </p>
      </div>
      <Field label="Data folder" hint="Database, CVs, cover letters, and attachments">
        <Input value={form.dataPath} onChange={v => set('dataPath', v)} mono />
      </Field>
      <Field label="Backup folder" hint="Zip backups from Settings → Export backup">
        <Input value={form.backupPath} onChange={v => set('backupPath', v)} mono />
      </Field>
      <Field label="Log folder" hint="Monthly rotating log files">
        <Input value={form.logPath} onChange={v => set('logPath', v)} mono />
      </Field>
      <NavButtons onNext={onNext} nextDisabled={!form.dataPath.trim()} />
    </>
  )
}

// ── Step 2: Profile & API key ─────────────────────────────────────────────────
function StepProfile({ form, set, onBack, onNext }) {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <StepEyebrow n={2} />
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Profile &amp; API key</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          Your name appears in the dashboard greeting. The API key enables all AI features.
        </p>
      </div>
      <Field label="Your name">
        <Input value={form.displayName} onChange={v => set('displayName', v)} placeholder="e.g. James" />
      </Field>
      <Field label="Location" hint="City or region — used for job searches and weather">
        <Input value={form.location} onChange={v => set('location', v)} placeholder="e.g. Christchurch" />
      </Field>
      <Field label="Anthropic API key" hint={<>Required for AI features. Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: ACCENT }}>console.anthropic.com</a></>}>
        <Input value={form.apiKey} onChange={v => set('apiKey', v)} type="password" placeholder="sk-ant-api…" mono />
      </Field>
      <div style={{ borderTop: '1px solid #eee', paddingTop: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#14132A', marginBottom: 4 }}>CV profile names</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>JobDeck supports two CV profiles for different job categories. Name them to match your search types.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Profile 1">
            <Input value={form.label1} onChange={v => set('label1', v)} placeholder="e.g. Tech / IT" />
          </Field>
          <Field label="Profile 2 (optional)">
            <Input value={form.label2} onChange={v => set('label2', v)} placeholder="e.g. Retail / Hospitality" />
          </Field>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.createShortcut} onChange={e => set('createShortcut', e.target.checked)} style={{ width: 16, height: 16, accentColor: ACCENT, cursor: 'pointer' }} />
        <span style={{ fontSize: 13.5, color: '#333' }}>Add a JobDeck shortcut to my desktop</span>
      </label>
      <NavButtons onBack={onBack} onNext={onNext} />
    </>
  )
}

// ── Step 3: Keywords ──────────────────────────────────────────────────────────
function StepKeywords({ form, set, onBack, onNext }) {
  const label1 = form.label1 || 'CV Profile 1'
  const label2 = form.label2 || 'CV Profile 2'
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <StepEyebrow n={3} />
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Search keywords</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          These keywords are used to search Seek and Trade Me Jobs. Separate with commas. You can refine them anytime in Settings.
        </p>
      </div>
      <Field label={`${label1} keywords`} hint="Jobs matching these terms will be scraped for this profile">
        <KeywordsArea
          value={form.keywords1}
          onChange={v => set('keywords1', v)}
          placeholder="e.g. front end developer, web developer, React, IT support"
        />
      </Field>
      {form.label2.trim() && (
        <Field label={`${label2} keywords`} hint="Jobs matching these terms will be scraped for this profile">
          <KeywordsArea
            value={form.keywords2}
            onChange={v => set('keywords2', v)}
            placeholder="e.g. customer service, barista, retail assistant, hospitality"
          />
        </Field>
      )}
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Finish setup" nextDisabled={!form.keywords1.trim()} />
    </>
  )
}

// ── Step 4: CV Upload (runs post-restart) ─────────────────────────────────────
function StepCVs({ form, onDone }) {
  const [state, setState] = useState({ tech: null, hospitality: null })
  const [uploading, setUploading] = useState({})
  const refs = { tech: useRef(null), hospitality: useRef(null) }

  const upload = async (file, profile) => {
    setUploading(u => ({ ...u, [profile]: true }))
    const fd = new FormData()
    fd.append('cv', file)
    await fetch(`/api/cv/upload?profile=${profile}`, { method: 'POST', body: fd }).catch(() => {})
    setState(s => ({ ...s, [profile]: file.name }))
    setUploading(u => ({ ...u, [profile]: false }))
  }

  const profiles = [
    { key: 'tech', label: form.label1 || 'CV Profile 1' },
    ...(form.label2.trim() ? [{ key: 'hospitality', label: form.label2 }] : []),
  ]

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <StepEyebrow n={4} />
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#14132A' }}>Upload your CVs</h2>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
          Upload a PDF for each profile so JobDeck can score jobs against your experience. You can do this later in Settings if you prefer.
        </p>
      </div>
      {profiles.map(({ key, label }) => (
        <Field key={key} label={label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {state[key] ? (
              <span style={{ fontSize: 13, color: '#555' }}>✓ {state[key]}</span>
            ) : (
              <button
                onClick={() => refs[key].current?.click()}
                disabled={uploading[key]}
                style={{ padding: '8px 16px', fontSize: 13, background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                {uploading[key] ? 'Uploading…' : 'Upload PDF'}
              </button>
            )}
            <input ref={refs[key]} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => e.target.files[0] && upload(e.target.files[0], key)} />
          </div>
        </Field>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button onClick={onDone} style={{ padding: '10px 20px', fontSize: 13, background: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}>
          Skip for now
        </button>
        <button
          onClick={onDone}
          disabled={profiles.some(p => !state[p.key])}
          style={{ padding: '10px 24px', fontSize: 13.5, fontWeight: 600, background: profiles.every(p => state[p.key]) ? ACCENT : '#aaa', color: '#fff', border: 'none', borderRadius: 8, cursor: profiles.every(p => state[p.key]) ? 'pointer' : 'default' }}
        >
          Start using JobDeck →
        </button>
      </div>
    </>
  )
}

// ── Restarting screen ─────────────────────────────────────────────────────────
function StepRestarting() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ width: 48, height: 48, margin: '0 auto 20px', border: `3px solid ${ACCENT_SOFT}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: '#14132A' }}>Setting up your JobDeck…</h2>
      <p style={{ margin: 0, fontSize: 13.5, color: '#888' }}>This will only take a moment.</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function SetupWizard({ defaults, onDismiss }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    dataPath:    defaults.dataPath,
    backupPath:  defaults.backupPath,
    logPath:     defaults.logPath,
    apiKey:         '',
    displayName:    '',
    location:       '',
    label1:         '',
    label2:         '',
    keywords1:      'front end developer, web developer, IT support, systems administrator, Microsoft 365, React, JavaScript',
    keywords2:      'customer service, barista, cafe, retail assistant, front of house, hospitality',
    createShortcut: true,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const finish = async () => {
    setStep('restarting')
    try {
      await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    } catch {}

    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/health')
        if (r.ok) {
          clearInterval(poll)
          // Save keywords and profile labels to the now-initialised DB
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(form.label1.trim()    && { cv_label_1: form.label1.trim() }),
              ...(form.label2.trim()    && { cv_label_2: form.label2.trim() }),
              ...(form.keywords1.trim() && { scraper_keywords_tech: form.keywords1.trim() }),
              ...(form.keywords2.trim() && { scraper_keywords_hospitality: form.keywords2.trim() }),
            }),
          }).catch(() => {})
          setStep(4)
        }
      } catch {}
    }, 1000)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F4F8', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, boxShadow: '0 4px 40px rgba(20,19,42,0.10)', overflow: 'hidden' }}>
        {/* Brand header */}
        <div style={{ background: '#2d4a63', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', fontStyle: 'italic', fontFamily: 'Georgia, serif', flexShrink: 0 }}>JD</div>
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
          {step === 1          && <StepPaths    form={form} set={set} onNext={() => setStep(2)} />}
          {step === 2          && <StepProfile  form={form} set={set} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
          {step === 3          && <StepKeywords form={form} set={set} onBack={() => setStep(2)} onNext={finish} />}
          {step === 'restarting' && <StepRestarting />}
          {step === 4          && <StepCVs form={form} onDone={() => window.location.reload()} />}
        </div>
      </div>
    </div>
  )
}
