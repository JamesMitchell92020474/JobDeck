import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import api from '../hooks/useApi'

const AppContext = createContext(null)

const DEFAULT_SETTINGS = {
  theme: 'light',
  accent_color: '#423A8E',
  display_font: 'Cambria',
  body_font: 'Inter',
  card_style: 'edge',
  density: 'balanced',
  display_name: 'James Mitchell',
  email: 'james@mitchell.nz',
  source_colors: JSON.stringify({
    Seek: '#3D5A80', LinkedIn: '#2867B2',
    'Trade Me Jobs': '#2E7D5B', Jora: '#A8743A', Indeed: '#5C4A8A',
  }),
  disabled_sources: '{}',
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const loadSettings = useCallback(async () => {
    try {
      const s = await api.get('/settings')
      setSettings(prev => ({ ...DEFAULT_SETTINGS, ...prev, ...s }))
    } catch {}
  }, [])

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

  const saveSetting = useCallback(async (key, value) => {
    const update = typeof key === 'object' ? key : { [key]: value }
    setSettings(prev => ({ ...prev, ...update }))
    try { await api.put('/settings', update) } catch {}
  }, [])

  // Apply theme tokens to DOM
  useEffect(() => {
    const html = document.documentElement
    const autoTheme = settings.auto_theme === '1'
    let mode = settings.theme || 'light'
    if (autoTheme) {
      const h = new Date().getHours()
      mode = (h >= 7 && h < 19) ? 'light' : 'dark'
    }
    html.dataset.mode = mode
    html.dataset.density = settings.density || 'balanced'

    const accent = settings.accent_color || '#423A8E'
    html.style.setProperty('--accent', accent)

    const df = settings.display_font || 'Fraunces'
    const bf = settings.body_font || 'Inter'
    html.style.setProperty('--font-display', `'${df}', serif`)
    html.style.setProperty('--font-body',    `'${bf}', sans-serif`)
  }, [settings])

  useEffect(() => {
    loadSettings()
    loadJobs()
  }, [])

  const getSourceColors = () => {
    try { return JSON.parse(settings.source_colors || '{}') }
    catch { return {} }
  }

  const getDisabledSources = () => {
    try { return JSON.parse(settings.disabled_sources || '{}') }
    catch { return {} }
  }

  const columnCounts = ['Shortlisted', 'Applied', 'Interview', 'Offer', 'Rejected'].reduce((acc, col) => {
    acc[col] = jobs.filter(j => j.status === col && !j.is_soft_deleted).length
    return acc
  }, {})

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

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be inside AppProvider')
  return ctx
}
