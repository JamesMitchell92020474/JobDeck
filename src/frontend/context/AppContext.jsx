// AppContext is a "global store" that makes settings and job data available
// to every component in the app without having to pass them as props.
//
// In React, a Context is like a shared cupboard — you put things in it
// (via AppProvider) and any component that needs them can reach in (via useApp).
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import api from '../hooks/useApi'

// createContext creates the cupboard. It starts empty (null) and gets filled
// when AppProvider renders.
const AppContext = createContext(null)

// Default values used before the real settings load from the server.
// This prevents the app from crashing on first render when settings are undefined.
const DEFAULT_SETTINGS = {
  theme:         'light',
  accent_color:  '#423A8E',
  display_font:  'Cambria',
  body_font:     'Inter',
  card_style:    'edge',
  density:       'balanced',
  display_name:  '',
  cv_label_1:    'CV Profile 1',
  cv_label_2:    'CV Profile 2',
  source_colors: JSON.stringify({ Seek: '#3D5A80', 'Trade Me Jobs': '#2E7D5B' }),
  disabled_sources: '{}',
}

// AppProvider wraps the entire app and provides the shared data.
// "children" means everything nested inside it in App.jsx.
export function AppProvider({ children }) {
  // useState creates a reactive variable. When it changes, React re-renders
  // any component that uses it.
  const [settings,    setSettings]    = useState(DEFAULT_SETTINGS)
  const [jobs,        setJobs]        = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)

  // useRef stores the latest settings in a way that's safe to read inside
  // event callbacks without stale data issues.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // Fetches the latest settings from the backend and merges them with the defaults.
  // "useCallback" means this function is only re-created when its dependencies change
  // (none here, so it's created once).
  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get('/settings')
      // Spread operator (...) merges objects. Later values overwrite earlier ones,
      // so real DB settings win over defaults.
      setSettings(prev => ({ ...DEFAULT_SETTINGS, ...prev, ...s }))
    } catch {}  // silently ignore network errors on load
  }, [])

  // Fetches all jobs from the backend.
  const loadJobs = useCallback(async () => {
    try {
      setLoadingJobs(true)
      const data = await api.get('/jobs')
      setJobs(data)
    } catch {
      setJobs([])
    } finally {
      setLoadingJobs(false)
    }
  }, [])

  // Saves a setting to the backend and immediately updates the local state
  // so the UI reflects the change without waiting for a reload.
  // Can be called with a key+value pair or a whole object of updates.
  const saveSetting = useCallback(async (key, value) => {
    const update = typeof key === 'object' ? key : { [key]: value }
    setSettings(prev => ({ ...prev, ...update }))  // update UI immediately
    try { await api.put('/settings', update) } catch {}  // then sync to server
  }, [])

  // Whenever settings change, apply theme tokens to the HTML element.
  // CSS variables like --accent are read by globals.css to style the whole app.
  useEffect(() => {
    const html = document.documentElement  // the <html> tag at the root of the page
    html.dataset.mode    = settings.theme   || 'light'
    html.dataset.density = settings.density || 'balanced'

    const accent = settings.accent_color || '#423A8E'
    html.style.setProperty('--accent', accent)

    // Apply font choices as CSS variables used throughout the stylesheet.
    const df = settings.display_font || 'Fraunces'
    const bf = settings.body_font    || 'Inter'
    html.style.setProperty('--font-display', `'${df}', serif`)
    html.style.setProperty('--font-body',    `'${bf}', sans-serif`)
  }, [settings])  // re-runs whenever settings changes

  // Load settings and jobs once when the app first starts.
  useEffect(() => {
    loadSettings()
    loadJobs()
  }, [])  // empty [] means "run once on mount, never again"

  // Helper to parse the source colours JSON setting into a plain object.
  const getSourceColors = () => {
    try { return JSON.parse(settings.source_colors || '{}') }
    catch { return {} }
  }

  // Helper to parse the disabled sources JSON setting into a plain object.
  const getDisabledSources = () => {
    try { return JSON.parse(settings.disabled_sources || '{}') }
    catch { return {} }
  }

  // Pre-calculate how many jobs are in each kanban column so the sidebar
  // can display badge counts without re-counting on every render.
  const columnCounts = ['New', 'Interested', 'Applied', 'Interview', 'Offer', 'Rejected', 'Archived'].reduce((acc, col) => {
    acc[col] = jobs.filter(j => j.status === col && !j.is_soft_deleted).length
    return acc
  }, {})

  // Make all the shared data available to child components.
  return (
    <AppContext.Provider value={{
      settings, saveSetting, loadSettings,
      jobs, loadJobs, setJobs, loadingJobs,
      columnCounts,
      getSourceColors, getDisabledSources,
    }}>
      {children}
    </AppContext.Provider>
  )
}

// useApp is the hook that any component calls to access the shared data.
// It throws a helpful error if accidentally used outside AppProvider.
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
