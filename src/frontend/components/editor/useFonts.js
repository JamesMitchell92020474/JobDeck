import { useState, useEffect } from 'react'

// Curated list of professional fonts reliably available on Windows
const CURATED_FONTS = [
  'Arial', 'Arial Black', 'Book Antiqua', 'Calibri', 'Cambria',
  'Cambria Math', 'Candara', 'Century Gothic', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium',
  'Garamond', 'Georgia', 'Gill Sans MT', 'Impact',
  'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
  'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]

let cachedFonts = null // module-level cache so API is only called once per session

export function useFonts() {
  const [fonts,      setFonts]      = useState(cachedFonts || CURATED_FONTS)
  const [fromSystem, setFromSystem] = useState(!!cachedFonts && cachedFonts !== CURATED_FONTS)
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    // Already loaded this session — nothing to do
    if (cachedFonts) return

    // Local Font Access API is only available in Chrome/Chromium 103+
    if (!('queryLocalFonts' in window)) return

    setLoading(true)
    window.queryLocalFonts()
      .then(list => {
        // Deduplicate and sort family names
        const families = [...new Set(list.map(f => f.family))].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        )
        cachedFonts = families
        setFonts(families)
        setFromSystem(true)
      })
      .catch(() => {
        // Permission denied or unsupported — stay on curated list
        cachedFonts = CURATED_FONTS
      })
      .finally(() => setLoading(false))
  }, [])

  return { fonts, fromSystem, loading }
}
