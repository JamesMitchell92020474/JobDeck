import { useState, useCallback, useEffect, useRef } from 'react'
import RichTextEditor from '../../editor/RichTextEditor'
import LetterheadBlock from '../../editor/LetterheadBlock'
import Icon from '../../ui/Icon'
import api from '../../../hooks/useApi'

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SETTINGS = {
  pageSize:         'A4',
  margins:          { top: 25, bottom: 25, left: 25, right: 25 },
  fontFamily:       'Georgia, serif',
  fontSize:         '12pt',
  lineHeight:       1.7,
  spaceBefore:      0,
  spaceAfter:       14,
  letterheadEnabled: false,
  activeProfile:    null, // null = auto from job category
}

const DEFAULT_PROFILE = {
  logoBase64:        null,
  logoAlign:         'left',
  logoHeight:        60,
  nameText:          '',
  nameFontFamily:    'Georgia, serif',
  nameFontSize:      '22pt',
  nameFontWeight:    'bold',
  nameItalic:        false,
  nameColor:         '#1a1a1a',
  contactText:       '',
  contactFontFamily: 'Georgia, serif',
  contactFontSize:   '10pt',
  contactColor:      '#555555',
  showSeparator:     true,
  separatorColor:    '#cccccc',
}

const PROFILE_KEYS = ['tech', 'hospitality']

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parsePageSettings(raw) {
  try {
    const p = JSON.parse(raw || '{}')
    // Migrate old format: letterhead was nested per-job
    return {
      ...DEFAULT_PAGE_SETTINGS,
      ...p,
      margins:          { ...DEFAULT_PAGE_SETTINGS.margins, ...(p.margins || {}) },
      letterheadEnabled: p.letterheadEnabled ?? p.letterhead?.enabled ?? false,
      activeProfile:    p.activeProfile ?? null,
    }
  } catch {
    return { ...DEFAULT_PAGE_SETTINGS }
  }
}

function parseProfile(raw) {
  try { return { ...DEFAULT_PROFILE, ...JSON.parse(raw || '{}') } }
  catch { return { ...DEFAULT_PROFILE } }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CoverLetterTab({ job, saveJob, onFileExported }) {
  const [content,      setContent]      = useState(job.cover_letter || '')
  const [pageSettings, setPageSettings] = useState(() => parsePageSettings(job.cover_letter_settings))
  const [profiles,     setProfiles]     = useState({ tech: DEFAULT_PROFILE, hospitality: DEFAULT_PROFILE })
  const [labels,       setLabels]       = useState({ tech: 'Tech / IT', hospitality: 'Hospitality' })
  const [profileSaved, setProfileSaved] = useState(null) // key of recently saved profile
  const [generating,   setGenerating]   = useState(false)
  const [exporting,    setExporting]    = useState(null)
  const [error,        setError]        = useState('')
  const [exported,     setExported]     = useState(null)
  const savedTimerRef = useRef(null)

  // Which profile is active: explicit override → job category → 'tech' fallback
  const activeKey     = pageSettings.activeProfile || job.job_category || 'tech'
  const activeProfile = profiles[activeKey] || DEFAULT_PROFILE

  // ── Load global profiles + label names from settings ──────────────────────
  useEffect(() => {
    api.get('/settings').then(data => {
      setProfiles({
        tech:        parseProfile(data.cl_profile_tech),
        hospitality: parseProfile(data.cl_profile_hospitality),
      })
      setLabels({
        tech:        data.cv_label_1 || 'Tech / IT',
        hospitality: data.cv_label_2 || 'Hospitality',
      })
    }).catch(() => {})
  }, [])

  // ── Persist page settings ─────────────────────────────────────────────────
  const savePageSettings = useCallback(async (next) => {
    setPageSettings(next)
    await saveJob({ cover_letter_settings: JSON.stringify(next) }).catch(() => {})
  }, [saveJob])

  // Called by RichTextEditor when margins/font/spacing/etc. change
  const handlePageSettingsChange = useCallback((patch) => {
    savePageSettings({ ...pageSettings, ...patch })
  }, [pageSettings, savePageSettings])

  // ── Letterhead toggle ─────────────────────────────────────────────────────
  const toggleLetterhead = () =>
    savePageSettings({ ...pageSettings, letterheadEnabled: !pageSettings.letterheadEnabled })

  // ── Profile switch ────────────────────────────────────────────────────────
  const switchProfile = (key) =>
    savePageSettings({ ...pageSettings, activeProfile: key })

  // ── Letterhead editing → saves to the GLOBAL profile ─────────────────────
  const handleLetterheadChange = useCallback(async (patch) => {
    const updated = { ...activeProfile, ...patch }
    setProfiles(prev => ({ ...prev, [activeKey]: updated }))

    // Debounce the "saved" indicator
    clearTimeout(savedTimerRef.current)
    try {
      await api.put('/settings', { [`cl_profile_${activeKey}`]: JSON.stringify(updated) })
      setProfileSaved(activeKey)
      savedTimerRef.current = setTimeout(() => setProfileSaved(null), 2000)
    } catch {}
  }, [activeProfile, activeKey])

  // ── Content ───────────────────────────────────────────────────────────────
  const handleContentChange = async (html) => {
    setContent(html)
    await saveJob({ cover_letter: html }).catch(() => {})
  }

  // ── Generate with AI ──────────────────────────────────────────────────────
  const generate = async () => {
    setGenerating(true); setError('')
    try {
      const res = await api.post(`/jobs/${job.id}/cover-letter`, {})
      setContent(res.content)
      await saveJob({ cover_letter: res.content })
    } catch (e) { setError(e.message) }
    finally { setGenerating(false) }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const exportAs = async (type) => {
    setExporting(type); setError(''); setExported(null)
    try {
      // Merge: page layout + active profile's letterhead
      const settingsForExport = {
        ...pageSettings,
        letterhead: pageSettings.letterheadEnabled
          ? { ...activeProfile, enabled: true }
          : { enabled: false },
      }
      const res = await api.post(`/jobs/${job.id}/export-${type}`, {
        html:     content,
        settings: settingsForExport,
      })
      setExported(`Saved to Files tab: ${res.filename}`)
      if (res.file) onFileExported?.(res.file)
    } catch (e) {
      setError(`Export failed: ${e.message}`)
    } finally { setExporting(null) }
  }

  // ── Letterhead slot passed into RichTextEditor ────────────────────────────
  const letterheadSlot = pageSettings.letterheadEnabled ? (
    <LetterheadBlock
      settings={activeProfile}
      onChange={handleLetterheadChange}
      profileLabel={labels[activeKey]}
      profileSaved={profileSaved === activeKey}
    />
  ) : null

  // Page-only settings (no letterhead) passed to editor for canvas/toolbar
  const editorPageSettings = {
    pageSize:    pageSettings.pageSize,
    margins:     pageSettings.margins,
    fontFamily:  pageSettings.fontFamily,
    fontSize:    pageSettings.fontSize,
    lineHeight:  pageSettings.lineHeight,
    spaceBefore: pageSettings.spaceBefore,
    spaceAfter:  pageSettings.spaceAfter,
  }

  return (
    <div className="cl-tab-root">

      {/* ── Action bar ───────────────────────────────────────── */}
      <div className="cl-tab-actions">

        <button className="btn btn-accent" onClick={generate} disabled={generating}>
          {generating ? <span className="spinner" /> : <Icon name="wand" size={12} />}
          {generating ? 'Generating…' : 'Generate with AI'}
        </button>

        <div className="cl-tab-bar-divider" />

        {/* Letterhead toggle */}
        <button
          className={`btn ${pageSettings.letterheadEnabled ? 'btn-active' : ''}`}
          onClick={toggleLetterhead}
          title={pageSettings.letterheadEnabled ? 'Remove letterhead' : 'Add letterhead'}
        >
          <Icon name="doc" size={12} />
          {pageSettings.letterheadEnabled ? 'Letterhead on' : 'Add letterhead'}
        </button>

        {/* Profile switcher — shown when letterhead is enabled */}
        {pageSettings.letterheadEnabled && (
          <div className="cl-profile-switcher" title="Switch which contact profile is used">
            {PROFILE_KEYS.map(key => (
              <button
                key={key}
                className={`cl-profile-btn ${activeKey === key ? 'active' : ''}`}
                onClick={() => switchProfile(key)}
              >
                {labels[key]}
              </button>
            ))}
          </div>
        )}

        <div className="cl-tab-spacer" />

        <button className="btn" onClick={() => exportAs('pdf')} disabled={!!exporting}>
          {exporting === 'pdf' ? <span className="spinner" /> : <Icon name="doc" size={12} />}
          Export PDF
        </button>
        <button className="btn" onClick={() => exportAs('word')} disabled={!!exporting}>
          {exporting === 'word' ? <span className="spinner" /> : <Icon name="doc" size={12} />}
          Export Word
        </button>
      </div>

      {error    && <div className="error-banner" style={{ marginTop: 8 }}>{error}</div>}
      {exported && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--col-offer)', fontFamily: 'var(--font-mono)' }}>
          {exported}
        </div>
      )}

      {/* ── Editor ───────────────────────────────────────────── */}
      <RichTextEditor
        content={content}
        onChange={handleContentChange}
        pageSettings={editorPageSettings}
        onPageSettingsChange={handlePageSettingsChange}
        headerContent={letterheadSlot}
      />
    </div>
  )
}
