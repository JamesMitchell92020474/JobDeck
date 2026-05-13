// The Settings page. Lets the user configure everything from their name and CV
// to scraper keywords and visual appearance.
//
// Settings are saved to the backend immediately when the user changes a value
// (on blur for text inputs, on click for toggles), so there's no separate
// "Save" button — changes take effect right away.
import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import Icon from '../components/ui/Icon'
import api from '../hooks/useApi'

// TagInput is a chip-style keyword editor.
// Instead of typing a comma-separated string, each keyword becomes a pill
// that can be individually removed. The underlying value is still stored as
// a comma-separated string so nothing else needs to change.
//
// Props:
//   value   — the current comma-separated keywords string from settings
//   onSave  — called with the updated string whenever a keyword is added or removed
function TagInput({ value, onSave, placeholder = 'Add keyword…' }) {
  const [draft, setDraft] = useState('')          // text the user is currently typing
  const inputRef = useRef(null)                   // ref to the hidden input so we can focus it
  // Convert the comma-separated string into an array of trimmed, non-empty tags.
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : []

  const addTag = () => {
    const tag = draft.trim().replace(/,/g, '')
    if (!tag || tags.includes(tag)) { setDraft(''); return }
    onSave([...tags, tag].join(', '))
    setDraft('')
  }

  const removeTag = (i) => onSave(tags.filter((_, idx) => idx !== i).join(', '))

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
        border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px',
        background: 'var(--bg)', cursor: 'text', minHeight: 38, maxWidth: 520,
      }}
    >
      {tags.map((tag, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
          color: 'var(--accent)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          borderRadius: 100, padding: '2px 6px 2px 9px', fontSize: 12, fontWeight: 500,
        }}>
          {tag}
          <button
            onClick={e => { e.stopPropagation(); removeTag(i) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 15, lineHeight: 1, opacity: 0.6, marginTop: -1 }}
          >×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
          else if (e.key === 'Backspace' && !draft && tags.length) removeTag(tags.length - 1)
        }}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{
          border: 'none', outline: 'none', background: 'transparent',
          fontSize: 13, minWidth: 140, flex: 1, color: 'var(--ink-1)',
        }}
      />
    </div>
  )
}

const SOURCES = ['Seek', 'Trade Me Jobs']

const DEFAULT_SRC_COLORS = {
  'Seek':           '#FFC107',
  'Trade Me Jobs':  '#DC3545',
}

const STALE_SRC_COLORS = {
  'Seek':           '#3D5A80',
  'Trade Me Jobs':  '#2E7D5B',
}

const FONT_CATALOGUE = {
  serif: ['Fraunces','Source Serif 4','Playfair Display','Georgia','Cambria','Palatino','Garamond','Baskerville'],
  sans:  ['Inter','-apple-system','Helvetica Neue','Segoe UI','Roboto','Avenir Next','Verdana'],
  mono:  ['JetBrains Mono','SF Mono','Menlo','Consolas','Courier New'],
}

function HexPicker({ value, onChange }) {
  return (
    <label className="hex-picker">
      <span className="hex-sw" style={{ background: value }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      </span>
    </label>
  )
}

function FontSelect({ label, value, onChange }) {
  return (
    <label className="font-select">
      <span className="font-select-lbl">{label}</span>
      <select className="input" value={value} onChange={e => onChange(e.target.value)} style={{ fontFamily: `'${value}', sans-serif` }}>
        {['serif','sans','mono'].map(cat => (
          <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
            {FONT_CATALOGUE[cat].map(f => (
              <option key={f} value={f} style={{ fontFamily: `'${f}', sans-serif` }}>{f}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

function CoverLetterTemplate() {
  const [content, setContent] = useState('')
  const [loaded,  setLoaded]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    api.get('/export/cover-letter-template').then(d => { setContent(d.content || ''); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  const save = async () => {
    setSaving(true)
    await api.put('/export/cover-letter-template', { content }).catch(() => {})
    setSaving(false)
  }

  if (!loaded) return <span className="spinner" />

  return (
    <div>
      <textarea
        className="notes-area"
        style={{ minHeight: 200 }}
        value={content}
        onChange={e => setContent(e.target.value)}
        onBlur={save}
        placeholder={`Preferred structure, tone, sign-off, and boilerplate.\n\nExample:\n- Open by referencing something specific about the role/company\n- 2-3 body paragraphs: relevant experience → why this role → why this company\n- Close with a clear CTA\n- Sign off: Ngā mihi, James`}
      />
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 8 }}>
        {saving ? 'Saving…' : 'Saved automatically on blur'}
      </div>
    </div>
  )
}

export default function Settings() {
  const { settings, saveSetting, loadSettings, loadJobs } = useApp()
  const [syncing,   setSyncing]  = useState({})
  const [hkRunning, setHkRunning]= useState(false)
  const [hkResult,  setHkResult] = useState(null)
  const [cleanupPreview, setCleanupPreview] = useState(null)
  const [cleanupRunning, setCleanupRunning] = useState(false)
  const [logs,      setLogs]     = useState([])
  const [logsLoaded,setLogsLoaded]=useState(false)
  const cvRefs = { tech: useRef(null), hospitality: useRef(null) }

  const srcColors     = (() => { try { return JSON.parse(settings.source_colors || '{}') } catch { return {} } })()
  const disabled      = (() => { try { return JSON.parse(settings.disabled_sources || '{}') } catch { return {} } })()

  useEffect(() => {
    if (!settings.source_colors) return
    const updated = { ...srcColors }
    let changed = false
    for (const src of SOURCES) {
      if (updated[src]?.toLowerCase() === STALE_SRC_COLORS[src]?.toLowerCase()) {
        updated[src] = DEFAULT_SRC_COLORS[src]
        changed = true
      }
    }
    if (changed) saveSetting('source_colors', JSON.stringify(updated))
  }, [settings.source_colors])

  const setSrcColor = (src, color) => {
    saveSetting('source_colors', JSON.stringify({ ...srcColors, [src]: color }))
  }
  const toggleSrc = (src) => {
    saveSetting('disabled_sources', JSON.stringify({ ...disabled, [src]: !disabled[src] }))
  }
  const syncSource = async (src) => {
    setSyncing(s => ({ ...s, [src]: true }))
    await api.post('/scrape', { sources: [src] }).catch(() => {})
    await Promise.all([loadSettings(), loadJobs()])
    setSyncing(s => ({ ...s, [src]: false }))
  }
  const syncAll = async () => {
    setSyncing({ all: true })
    await api.post('/scrape', {}).catch(() => {})
    await Promise.all([loadSettings(), loadJobs()])
    setSyncing({})
  }
  const runHousekeeping = async () => {
    setHkRunning(true); setHkResult(null)
    try {
      const res = await api.post('/housekeeping/run')
      setHkResult(res.results)
    } catch {}
    setHkRunning(false)
  }
  const loadLogs = async () => {
    setLogsLoaded(true)
    const data = await api.get('/logs').catch(() => [])
    setLogs(data)
  }
  const uploadCV = async (file, profile) => {
    const fd = new FormData(); fd.append('cv', file)
    await fetch(`/api/cv/upload?profile=${profile}`, { method: 'POST', body: fd })
    await loadSettings()
  }
  const exportBackup = async () => {
    const res = await api.post('/export/backup').catch(e => alert(e.message))
    if (res?.path) alert(`Backup saved to:\n${res.path}`)
  }

  return (
    <div className="settings">
      <div>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Personalise · changes apply instantly</div>
        <h1>Settings</h1>
      </div>

      {/* Appearance */}
      <div className="set-group">
        <h3>Appearance</h3>

        <div className="set-row">
          <div className="lbl">Theme<small>Match time of day or pick one</small></div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="seg">
              {['light','dark'].map(m => (
                <div key={m} className={`seg-opt ${settings.theme === m ? 'active' : ''}`} onClick={() => saveSetting('theme', m)}>
                  <Icon name={m === 'light' ? 'sun' : 'moon'} size={11} />
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="set-row">
          <div className="lbl">Accent colour<small>Used on buttons, bars, indicators</small></div>
          <HexPicker value={settings.accent_color || '#423A8E'} onChange={v => saveSetting('accent_color', v)} />
        </div>

        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <div className="lbl">Type pairing<small>Display + body fonts</small></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <div className="font-picker">
              <FontSelect label="Display" value={settings.display_font || 'Cambria'} onChange={v => saveSetting('display_font', v)} />
              <FontSelect label="Body"    value={settings.body_font    || 'Inter'}   onChange={v => saveSetting('body_font',    v)} />
            </div>
            <div className="type-preview">
              <span className="type-preview-display">Senior Product Designer</span>
              <span className="type-preview-body">Xero · Wellington · Hybrid</span>
            </div>
          </div>
        </div>

        <div className="set-row" style={{ alignItems: 'flex-start' }}>
          <div className="lbl">Card style<small>Kanban cards appearance</small></div>
          <div className="card-style-picker">
            {[{ id: 'minimal', label: 'Minimal' }, { id: 'bordered', label: 'Bordered' }, { id: 'edge', label: 'Edge tint' }].map(s => (
              <div key={s.id} className={`csp-option ${settings.card_style === s.id ? 'active' : ''}`} onClick={() => saveSetting('card_style', s.id)}>
                <div className="csp-preview" data-kc-style={s.id}>
                  <div className="csp-card">
                    <div className="csp-card-top">
                      <div><div className="csp-title" /><div className="csp-sub" /></div>
                      <div className="csp-fit"><span className="csp-bar"><i /></span><span className="csp-num">91</span></div>
                    </div>
                    <div className="csp-meta"><span className="csp-pill" /><span className="csp-pill" /></div>
                  </div>
                  <div className="csp-card csp-card-2">
                    <div className="csp-card-top">
                      <div><div className="csp-title csp-title-2" /><div className="csp-sub" /></div>
                      <div className="csp-fit"><span className="csp-bar"><i style={{ width: '78%' }} /></span><span className="csp-num">78</span></div>
                    </div>
                  </div>
                </div>
                <div className="csp-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Scraper preferences */}
      <div className="set-group">
        <h3>Scraper preferences</h3>
        <div className="help">Keywords and location used when scraping job sites. Separate multiple keywords with commas.</div>
        <div className="set-row">
          <div className="lbl">Location<small>City or region to search in</small></div>
          <input
            className="input"
            style={{ maxWidth: 240 }}
            defaultValue={settings.scraper_location || 'Christchurch'}
            onBlur={e => saveSetting('scraper_location', e.target.value)}
          />
        </div>
        <div className="set-row">
          <div className="lbl">Max job age<small>Only pull jobs posted within this many days</small></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 80 }}
              type="number"
              min="1"
              max="90"
              defaultValue={settings.scraper_max_age_days || '30'}
              onBlur={e => saveSetting('scraper_max_age_days', e.target.value)}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>days</span>
          </div>
        </div>
        <div className="set-row">
          <div className="lbl">{settings.cv_label_1 || 'CV Profile 1'} keywords<small>Type a keyword and press Enter or comma to add · Backspace removes the last</small></div>
          <TagInput
            value={settings.scraper_keywords_tech || 'front end developer, web developer, IT support, systems administrator, Microsoft 365, React, JavaScript, CRM'}
            onSave={val => saveSetting('scraper_keywords_tech', val)}
          />
        </div>
        <div className="set-row">
          <div className="lbl">{settings.cv_label_2 || 'CV Profile 2'} keywords<small>Type a keyword and press Enter or comma to add · Backspace removes the last</small></div>
          <TagInput
            value={settings.scraper_keywords_hospitality || 'customer service, barista, cafe, retail assistant, front of house, hospitality'}
            onSave={val => saveSetting('scraper_keywords_hospitality', val)}
          />
        </div>
        <div className="set-row">
          <div className="lbl">Clean up board<small>Remove scraped jobs that don't match your keywords or location</small></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {!cleanupPreview ? (
              <button
                className="btn btn-sm"
                onClick={async () => {
                  setCleanupRunning(true)
                  const res = await api.post('/housekeeping/cleanup-unmatched', { dryRun: true }).catch(() => null)
                  setCleanupPreview(res)
                  setCleanupRunning(false)
                }}
                disabled={cleanupRunning}
              >
                {cleanupRunning ? <span className="spinner" /> : null}
                Preview clean up
              </button>
            ) : cleanupPreview.count === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                All jobs already match your filters.{' '}
                <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setCleanupPreview(null)}>Reset</span>
              </span>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  {cleanupPreview.count} job{cleanupPreview.count !== 1 ? 's' : ''} will be removed
                </span>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--col-rejected)', color: '#fff', borderColor: 'var(--col-rejected)' }}
                  onClick={async () => {
                    setCleanupRunning(true)
                    await api.post('/housekeeping/cleanup-unmatched', { dryRun: false }).catch(() => null)
                    setCleanupPreview(null)
                    setCleanupRunning(false)
                    await loadSettings()
                  }}
                  disabled={cleanupRunning}
                >
                  {cleanupRunning ? <span className="spinner" /> : null}
                  Remove {cleanupPreview.count} jobs
                </button>
                <span
                  style={{ fontSize: 13, color: 'var(--ink-3)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => setCleanupPreview(null)}
                >
                  Cancel
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job sources */}
      <div className="set-group">
        <h3>Job sources</h3>
        <div className="help">JobDeck scrapes these sites every morning at 7:00 NZST. Each source has its own colour for charts and badges.</div>
        <div className="sources-table">
          <div className="sources-head">
            <span>Source</span>
            <span>Colour</span>
            <span>Last sync</span>
            <span></span>
            <span>Active</span>
          </div>
          {SOURCES.map(src => {
            const enabled = !disabled[src]
            const color   = srcColors[src] || DEFAULT_SRC_COLORS[src] || '#888'
            return (
              <div key={src} className="sources-row" style={{ opacity: enabled ? 1 : 0.5 }}>
                <div className="src-name">{src}</div>
                <label className="src-color">
                  <span className="src-sw" style={{ background: color }} />
                  <input type="color" value={color} onChange={e => setSrcColor(src, e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  <span className="mono" style={{ fontSize: 11 }}>{color.toUpperCase()}</span>
                </label>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {settings[`last_sync_${src}`]
                    ? new Date(settings[`last_sync_${src}`]).toLocaleString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
                <button
                  className="btn btn-accent btn-sm"
                  onClick={() => syncSource(src)}
                  disabled={!enabled || syncing[src] || syncing.all}
                >
                  {syncing[src] ? <span className="spinner" /> : <Icon name="refresh" size={11} />}
                  Sync now
                </button>
                <div className="src-toggle" onClick={() => toggleSrc(src)}>
                  <span className={`toggle-lbl ${enabled ? '' : 'off'}`}>{enabled ? 'Connected' : 'Disconnected'}</span>
                  <span className={`toggle ${enabled ? 'on' : ''}`} />
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-accent btn-sm" onClick={syncAll} disabled={syncing.all}>
            {syncing.all ? <span className="spinner" /> : <Icon name="refresh" size={11} />}
            Sync all sources
          </button>
        </div>
      </div>

      {/* Profile & CV */}
      <div className="set-group">
        <h3>Profile &amp; CV</h3>
        <div className="set-row">
          <div className="lbl">Display name</div>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            defaultValue={settings.display_name || ''}
            onBlur={e => saveSetting('display_name', e.target.value)}
          />
        </div>
        {[
          { key: 'tech',        labelKey: 'cv_label_1', fallback: 'CV Profile 1' },
          { key: 'hospitality', labelKey: 'cv_label_2', fallback: 'CV Profile 2' },
        ].map(({ key, labelKey, fallback }) => {
          const profileLabel = settings[labelKey] || fallback
          const filename   = settings[`cv_filename_${key}`]
          const size       = settings[`cv_size_${key}`]
          const uploadedAt = settings[`cv_uploaded_at_${key}`]
          return (
            <div key={key} className="set-row">
              <div className="lbl">
                <input
                  key={profileLabel}
                  className="input"
                  style={{ maxWidth: 200, fontSize: 13, marginBottom: 4 }}
                  defaultValue={profileLabel}
                  placeholder={fallback}
                  onBlur={e => saveSetting(labelKey, e.target.value.trim() || fallback)}
                />
                <small>Label shown on job cards</small>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {filename ? (
                  <>
                    <div className="file-ic" style={{ width: 32, height: 36 }}>PDF</div>
                    <div>
                      <div style={{ fontSize: 13 }}>{filename}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {size ? Math.round(Number(size) / 1024) + ' KB' : ''}
                        {uploadedAt ? ' · uploaded ' + new Date(uploadedAt).toLocaleDateString('en-NZ') : ''}
                      </div>
                    </div>
                    <div className="flex-1" />
                    <button className="btn btn-sm" onClick={() => cvRefs[key].current?.click()}>Replace</button>
                  </>
                ) : (
                  <button className="btn btn-accent btn-sm" onClick={() => cvRefs[key].current?.click()}>
                    <Icon name="upload" size={11} /> Upload PDF
                  </button>
                )}
                <input
                  ref={cvRefs[key]}
                  type="file"
                  accept=".pdf"
                  style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && uploadCV(e.target.files[0], key)}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Housekeeping */}
      <div className="set-group">
        <h3>Housekeeping</h3>
        <div className="set-row">
          <div className="lbl">Archive after<small>Days without expiry before auto-archiving</small></div>
          <input className="input" style={{ maxWidth: 100 }} type="number" min={1} max={365}
            defaultValue={settings.hk_age_days || '30'}
            onBlur={e => saveSetting('hk_age_days', e.target.value)} />
        </div>
        <div className="set-row">
          <div className="lbl">Soft-delete after<small>Days in Archived or Rejected before soft-deleting</small></div>
          <input className="input" style={{ maxWidth: 100 }} type="number" min={1}
            defaultValue={settings.hk_soft_days || '90'}
            onBlur={e => saveSetting('hk_soft_days', e.target.value)} />
        </div>
        <div className="set-row">
          <div className="lbl">Hard-delete after<small>Days after soft-delete before permanent removal</small></div>
          <input className="input" style={{ maxWidth: 100 }} type="number" min={1}
            defaultValue={settings.hk_hard_days || '14'}
            onBlur={e => saveSetting('hk_hard_days', e.target.value)} />
        </div>
        <div>
          <button className="btn btn-sm" onClick={runHousekeeping} disabled={hkRunning}>
            {hkRunning ? <span className="spinner" /> : <Icon name="refresh" size={11} />}
            Run housekeeping now
          </button>
          {hkResult && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 12 }}>
              Archived {hkResult.archived} · soft-deleted {hkResult.softDeleted} · hard-deleted {hkResult.hardDeleted}
            </span>
          )}
        </div>
      </div>

      {/* Data & Storage */}
      <div className="set-group">
        <h3>Data &amp; storage</h3>
        <div className="set-row">
          <div className="lbl">Data path</div>
          <input className="input" style={{ maxWidth: 360 }} defaultValue={settings.data_path || 'D:\\JobDeck\\data'} disabled />
        </div>
        <div className="set-row">
          <div className="lbl">Backup path<small>Where zip backups are saved</small></div>
          <input
            className="input"
            style={{ maxWidth: 360 }}
            defaultValue={settings.backup_path || 'D:\\JobDeck\\backups'}
            onBlur={e => saveSetting('backup_path', e.target.value)}
          />
        </div>
        <div className="set-row">
          <div className="lbl">Log path<small>Where rotating monthly log files are written</small></div>
          <input
            className="input"
            style={{ maxWidth: 360 }}
            defaultValue={settings.log_path || 'D:\\JobDeck\\logs'}
            onBlur={e => saveSetting('log_path', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-sm" onClick={exportBackup}>
            <Icon name="download" size={11} /> Export backup
          </button>
        </div>
        <div className="set-row">
          <div className="lbl">Low disk warning</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input className="input" style={{ maxWidth: 80 }} type="number" min={1}
              defaultValue={settings.low_disk_gb || '2'}
              onBlur={e => saveSetting('low_disk_gb', e.target.value)} />
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>GB</span>
          </div>
        </div>
      </div>

      {/* AI */}
      <div className="set-group">
        <h3>AI</h3>
        <div className="set-row">
          <div className="lbl">API key<small>Anthropic API key for Claude features</small></div>
          <input
            className="input"
            style={{ maxWidth: 380, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            type="password"
            placeholder="sk-ant-api…"
            defaultValue={settings.api_key || ''}
            onBlur={e => saveSetting('api_key', e.target.value)}
          />
        </div>
        <div className="set-row">
          <div className="lbl">Deep Analysis<small>Allows using Claude Opus for one-off deep analysis in Chat</small></div>
          <span
            className={`toggle ${settings.deep_analysis === '1' ? 'on' : ''}`}
            onClick={() => saveSetting('deep_analysis', settings.deep_analysis === '1' ? '0' : '1')}
          />
        </div>
        <div className="set-row">
          <div className="lbl">AI filter threshold<small>Archive New jobs with a fit score below this value</small></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 80 }}
              type="number"
              min="1"
              max="99"
              defaultValue={settings.ai_filter_threshold || '40'}
              onBlur={e => saveSetting('ai_filter_threshold', e.target.value)}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* Cover letter template */}
      <div className="set-group">
        <h3>Cover letter template</h3>
        <div className="help">Used as the basis for all AI-generated cover letters. Define your preferred structure, tone, and sign-off.</div>
        <CoverLetterTemplate />
      </div>

      {/* Log viewer */}
      <div className="set-group">
        <h3>Log viewer</h3>
        <div className="set-row" style={{ marginBottom: 16 }}>
          <div className="lbl">Log storage cap<small>Oldest log files are deleted when this limit is exceeded</small></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="input"
              style={{ maxWidth: 80 }}
              type="number"
              min="1"
              defaultValue={settings.log_retention_mb || '50'}
              onBlur={e => saveSetting('log_retention_mb', e.target.value)}
            />
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>MB</span>
          </div>
        </div>
        {!logsLoaded ? (
          <button className="btn btn-sm" onClick={loadLogs}><Icon name="database" size={11} /> Load logs</button>
        ) : (
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', background: 'var(--bg-sunk)' }}>
            {logs.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--ink-3)', fontSize: 13 }}>No log entries.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-2)' }}>
                  <tr>
                    {['Time','Type','Trigger','Action','Job','Company','Reason'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-4)', borderBottom: '1px solid var(--rule)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                      <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>
                        {new Date(l.created_at).toLocaleString('en-NZ')}
                      </td>
                      <td style={{ padding: '7px 12px', color: 'var(--ink-3)' }}>{l.log_type}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 6px', borderRadius: 4, background: l.trigger_type === 'AUTO' ? 'var(--accent-soft)' : 'var(--bg-2)', color: l.trigger_type === 'AUTO' ? 'var(--accent)' : 'var(--ink-2)' }}>
                          {l.trigger_type}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', fontWeight: 500, color: 'var(--ink)' }}>{l.action}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--ink-2)' }}>{l.job_title}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--ink-3)' }}>{l.company}</td>
                      <td style={{ padding: '7px 12px', color: 'var(--ink-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 24 }} />
    </div>
  )
}
