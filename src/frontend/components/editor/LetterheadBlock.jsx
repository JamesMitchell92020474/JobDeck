import { useRef } from 'react'
import { useFonts } from './useFonts'
import { Upload, Trash2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'

// Compress and base64-encode an uploaded image file
async function compressLogo(file) {
  return new Promise((resolve) => {
    const img    = new Image()
    const url    = URL.createObjectURL(file)
    img.onload = () => {
      const MAX_H  = 150 // max height in px before encoding
      const scale  = Math.min(1, MAX_H / img.height)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png', 0.92))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

export default function LetterheadBlock({ settings, onChange, profileLabel, profileSaved }) {
  const { fonts } = useFonts()
  const fileRef   = useRef(null)

  const lh  = settings || {}
  const set = (patch) => onChange({ ...lh, ...patch })

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const base64 = await compressLogo(file)
    if (base64) set({ logoBase64: base64 })
    e.target.value = ''
  }

  // Letterhead preview alignment
  const alignStyle = {
    left:   'flex-start',
    center: 'center',
    right:  'flex-end',
  }[lh.logoAlign || 'left'] || 'flex-start'

  const textAlign = lh.logoAlign || 'left'

  return (
    <div className="cl-lh-wrap">

      {/* ── Control strip ─────────────────────────────────────── */}
      <div className="cl-lh-controls">

        {/* Profile label + save indicator */}
        {profileLabel && (
          <div className="cl-lh-ctrl-group">
            <span className="cl-lh-profile-badge">
              {profileLabel}
            </span>
            {profileSaved && (
              <span className="cl-lh-saved-indicator">✓ saved</span>
            )}
          </div>
        )}

        {profileLabel && <div className="cl-lh-ctrl-divider" />}

        {/* Logo controls */}
        <div className="cl-lh-ctrl-group">
          <span className="cl-lh-ctrl-label">Logo</span>
          <button className="cl-lh-ctrl-btn" onClick={() => fileRef.current?.click()} title="Upload logo">
            <Upload size={12} />
          </button>
          {lh.logoBase64 && (
            <>
              <button className="cl-lh-ctrl-btn cl-lh-ctrl-danger" onClick={() => set({ logoBase64: null })} title="Remove logo">
                <Trash2 size={12} />
              </button>
              <input
                type="number" min={20} max={200}
                value={lh.logoHeight || 60}
                onChange={e => set({ logoHeight: Number(e.target.value) })}
                className="cl-lh-number-input"
                title="Logo height (px)"
              />
              <span className="cl-lh-ctrl-unit">px</span>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
        </div>

        {/* Alignment */}
        <div className="cl-lh-ctrl-group">
          <span className="cl-lh-ctrl-label">Align</span>
          {['left','center','right'].map(a => (
            <button
              key={a}
              className={`cl-lh-ctrl-btn ${lh.logoAlign === a ? 'active' : ''}`}
              onClick={() => set({ logoAlign: a })}
              title={`Align ${a}`}
            >
              {a === 'left'   && <AlignLeft   size={12} />}
              {a === 'center' && <AlignCenter size={12} />}
              {a === 'right'  && <AlignRight  size={12} />}
            </button>
          ))}
        </div>

        <div className="cl-lh-ctrl-divider" />

        {/* Name styling */}
        <div className="cl-lh-ctrl-group">
          <span className="cl-lh-ctrl-label">Name</span>
          <select
            className="cl-lh-select cl-lh-select-wide"
            value={lh.nameFontFamily || 'Georgia, serif'}
            onChange={e => set({ nameFontFamily: e.target.value })}
            title="Name font"
          >
            {fonts.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            className="cl-lh-select"
            value={lh.nameFontSize || '22pt'}
            onChange={e => set({ nameFontSize: e.target.value })}
            title="Name size"
          >
            {['14pt','16pt','18pt','20pt','22pt','24pt','28pt','32pt','36pt'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <button
            className={`cl-lh-ctrl-btn ${lh.nameFontWeight === 'bold' ? 'active' : ''}`}
            onClick={() => set({ nameFontWeight: lh.nameFontWeight === 'bold' ? 'normal' : 'bold' })}
            title="Bold"
          >
            <strong style={{ fontSize: 11 }}>B</strong>
          </button>
          <button
            className={`cl-lh-ctrl-btn ${lh.nameItalic ? 'active' : ''}`}
            onClick={() => set({ nameItalic: !lh.nameItalic })}
            title="Italic"
          >
            <em style={{ fontSize: 11 }}>I</em>
          </button>
          <label className="cl-lh-color-wrap" title="Name colour">
            <input type="color" value={lh.nameColor || '#1a1a1a'} onChange={e => set({ nameColor: e.target.value })} />
            <span className="cl-lh-color-swatch" style={{ background: lh.nameColor || '#1a1a1a' }} />
          </label>
        </div>

        <div className="cl-lh-ctrl-divider" />

        {/* Contact styling */}
        <div className="cl-lh-ctrl-group">
          <span className="cl-lh-ctrl-label">Contact</span>
          <select
            className="cl-lh-select cl-lh-select-wide"
            value={lh.contactFontFamily || 'Georgia, serif'}
            onChange={e => set({ contactFontFamily: e.target.value })}
            title="Contact font"
          >
            {fonts.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            className="cl-lh-select"
            value={lh.contactFontSize || '10pt'}
            onChange={e => set({ contactFontSize: e.target.value })}
            title="Contact size"
          >
            {['8pt','9pt','10pt','11pt','12pt'].map(s =>
              <option key={s} value={s}>{s}</option>
            )}
          </select>
          <label className="cl-lh-color-wrap" title="Contact colour">
            <input type="color" value={lh.contactColor || '#555555'} onChange={e => set({ contactColor: e.target.value })} />
            <span className="cl-lh-color-swatch" style={{ background: lh.contactColor || '#555555' }} />
          </label>
        </div>

        <div className="cl-lh-ctrl-divider" />

        {/* Separator */}
        <div className="cl-lh-ctrl-group">
          <label className="cl-lh-checkbox-label">
            <input
              type="checkbox"
              checked={!!lh.showSeparator}
              onChange={e => set({ showSeparator: e.target.checked })}
            />
            <span>Separator</span>
          </label>
          {lh.showSeparator && (
            <label className="cl-lh-color-wrap" title="Separator colour">
              <input type="color" value={lh.separatorColor || '#cccccc'} onChange={e => set({ separatorColor: e.target.value })} />
              <span className="cl-lh-color-swatch" style={{ background: lh.separatorColor || '#cccccc' }} />
            </label>
          )}
        </div>

      </div>

      {/* ── Letterhead preview (inside the white page) ─────────── */}
      <div className="cl-letterhead" style={{ alignItems: alignStyle }}>

        {/* Logo */}
        {lh.logoBase64 ? (
          <img
            src={lh.logoBase64}
            alt="Logo"
            style={{
              height:    `${lh.logoHeight || 60}px`,
              maxWidth:  '100%',
              objectFit: 'contain',
              display:   'block',
              marginBottom: 8,
            }}
          />
        ) : (
          <button
            className="cl-lh-logo-placeholder"
            onClick={() => fileRef.current?.click()}
            style={{ alignSelf: alignStyle }}
          >
            <Upload size={13} />
            Upload logo
          </button>
        )}

        {/* Name */}
        <input
          className="cl-lh-name-input"
          type="text"
          placeholder="Your name"
          value={lh.nameText || ''}
          onChange={e => set({ nameText: e.target.value })}
          style={{
            fontFamily:  lh.nameFontFamily || 'Georgia, serif',
            fontSize:    lh.nameFontSize   || '22pt',
            fontWeight:  lh.nameFontWeight || 'bold',
            fontStyle:   lh.nameItalic     ? 'italic' : 'normal',
            color:       lh.nameColor      || '#1a1a1a',
            textAlign,
          }}
        />

        {/* Contact */}
        <input
          className="cl-lh-contact-input"
          type="text"
          placeholder="Email · Phone · LinkedIn · Location"
          value={lh.contactText || ''}
          onChange={e => set({ contactText: e.target.value })}
          style={{
            fontFamily: lh.contactFontFamily || 'Georgia, serif',
            fontSize:   lh.contactFontSize   || '10pt',
            color:      lh.contactColor      || '#555555',
            textAlign,
          }}
        />

        {/* Separator */}
        {lh.showSeparator && (
          <hr className="cl-lh-separator" style={{ borderTopColor: lh.separatorColor || '#cccccc' }} />
        )}
      </div>
    </div>
  )
}
