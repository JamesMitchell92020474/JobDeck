import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2,
  List, ListOrdered, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Undo2, Redo2,
  Settings2,
} from 'lucide-react'
import { useFonts } from './useFonts'

// ─── Extended TextStyle — handles fontSize, color, fontFamily in one mark ────
const RichTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default:   null,
        parseHTML: el => el.style.fontSize   || null,
        renderHTML: attrs => attrs.fontSize   ? { style: `font-size: ${attrs.fontSize}` }   : {},
      },
      color: {
        default:   null,
        parseHTML: el => el.style.color      || null,
        renderHTML: attrs => attrs.color      ? { style: `color: ${attrs.color}` }           : {},
      },
      fontFamily: {
        default:   null,
        parseHTML: el => el.style.fontFamily || null,
        renderHTML: attrs => attrs.fontFamily ? { style: `font-family: ${attrs.fontFamily}` } : {},
      },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize:      size   => ({ chain }) => chain().setMark('textStyle', { fontSize:   size   }).run(),
      setColor:         color  => ({ chain }) => chain().setMark('textStyle', { color:      color  }).run(),
      unsetColor:       ()     => ({ chain }) => chain().setMark('textStyle', { color:      null   }).run(),
      setFontFamily:    family => ({ chain }) => chain().setMark('textStyle', { fontFamily: family }).run(),
      unsetFontFamily:  ()     => ({ chain }) => chain().setMark('textStyle', { fontFamily: null   }).run(),
    }
  },
})

const FONT_SIZES  = ['9pt','10pt','11pt','12pt','13pt','14pt','16pt','18pt','20pt','24pt']
const LINE_HEIGHTS = [
  { label: '1.0', value: 1.0 },
  { label: '1.15', value: 1.15 },
  { label: '1.5', value: 1.5 },
  { label: '1.7', value: 1.7 },
  { label: '2.0', value: 2.0 },
]
const ICON = 14
const DEFAULT_COLOR = '#1a1a1a'

export default function RichTextEditor({
  content,
  onChange,
  readOnly,
  pageSettings,
  onPageSettingsChange,
  headerContent,
}) {
  const [fontSize,      setFontSize]      = useState('12pt')
  const [activeColor,   setActiveColor]   = useState(DEFAULT_COLOR)
  const [showSettings,  setShowSettings]  = useState(false)
  const colorInputRef   = useRef(null)
  const settingsRef     = useRef(null)
  const { fonts, fromSystem } = useFonts()

  const ps = pageSettings || {}
  const m  = ps.margins   || { top: 25, bottom: 25, left: 25, right: 25 }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      RichTextStyle,
    ],
    content:  content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  // Sync content prop → editor when it changes externally
  useEffect(() => {
    if (editor && content !== undefined) {
      if (editor.getHTML() !== content) editor.commands.setContent(content || '')
    }
  }, [content])

  // Close settings panel when clicking outside
  useEffect(() => {
    if (!showSettings) return
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  if (!editor) return null

  // ── Helpers ──────────────────────────────────────────────────────────────
  const applyFontSize = (size) => {
    setFontSize(size)
    editor.chain().focus().selectAll().setFontSize(size).run()
  }

  const applyFontFamily = (family) => {
    if (!editor.state.selection.empty) {
      editor.chain().focus().setFontFamily(family).run()
    }
    // Also update the page-level default via onPageSettingsChange
    onPageSettingsChange?.({ ...ps, fontFamily: family })
  }

  const applyColor = (color) => {
    setActiveColor(color)
    editor.chain().focus().setColor(color).run()
  }

  const setProp = (patch) => onPageSettingsChange?.({ ...ps, ...patch })
  const setMargin = (side, val) => setProp({ margins: { ...m, [side]: Number(val) } })

  // ── Toolbar button helper ─────────────────────────────────────────────────
  const btn = (Icon, action, active, title) => (
    <button
      key={title}
      type="button"
      className={`cl-tool ${active ? 'active' : ''}`}
      onClick={action}
      title={title}
    >
      <Icon size={ICON} />
    </button>
  )

  // ── Page settings panel ───────────────────────────────────────────────────
  const settingsPanel = showSettings && (
    <div className="cl-settings-panel" ref={settingsRef}>

      <div className="cl-sp-section">
        <div className="cl-sp-label">Page size</div>
        <div className="cl-sp-row">
          {['A4', 'Letter'].map(sz => (
            <button
              key={sz}
              className={`cl-sp-size-btn ${(ps.pageSize || 'A4') === sz ? 'active' : ''}`}
              onClick={() => setProp({ pageSize: sz })}
            >
              {sz}
            </button>
          ))}
        </div>
      </div>

      <div className="cl-sp-section">
        <div className="cl-sp-label">Margins (mm)</div>
        <div className="cl-sp-margin-grid">
          {[['top','Top'],['bottom','Bot'],['left','Left'],['right','Right']].map(([side, label]) => (
            <div key={side} className="cl-sp-margin-item">
              <label>{label}</label>
              <input
                type="number" min={5} max={60}
                value={m[side] ?? 25}
                onChange={e => setMargin(side, e.target.value)}
                className="cl-sp-input"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="cl-sp-section">
        <div className="cl-sp-label">Paragraph spacing (px)</div>
        <div className="cl-sp-row">
          <label className="cl-sp-field-label">Before</label>
          <input
            type="number" min={0} max={60}
            value={ps.spaceBefore ?? 0}
            onChange={e => setProp({ spaceBefore: Number(e.target.value) })}
            className="cl-sp-input"
          />
          <label className="cl-sp-field-label" style={{ marginLeft: 8 }}>After</label>
          <input
            type="number" min={0} max={60}
            value={ps.spaceAfter ?? 14}
            onChange={e => setProp({ spaceAfter: Number(e.target.value) })}
            className="cl-sp-input"
          />
        </div>
      </div>

      {fromSystem && (
        <div className="cl-sp-hint">✓ Using your system fonts</div>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cl-editor-root">

      {/* ── Toolbar ────────────────────────────────────────────────── */}
      {!readOnly && (
        <div className="cl-toolbar">

          {/* Undo / Redo */}
          <div className="group">
            {btn(Undo2, () => editor.chain().focus().undo().run(), false, 'Undo')}
            {btn(Redo2, () => editor.chain().focus().redo().run(), false, 'Redo')}
          </div>

          {/* Font family */}
          <div className="group">
            <select
              className="cl-tool cl-select cl-font-family-select"
              title={`Font family${fromSystem ? ' (system fonts)' : ''}`}
              value={ps.fontFamily?.split(',')[0]?.trim() || 'Georgia'}
              onChange={e => applyFontFamily(e.target.value)}
            >
              {fonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          {/* Font size */}
          <div className="group">
            <select
              className="cl-tool cl-select"
              value={fontSize}
              onChange={e => applyFontSize(e.target.value)}
              title="Font size"
            >
              {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Bold / Italic / Underline */}
          <div className="group">
            {btn(Bold,          () => editor.chain().focus().toggleBold().run(),      editor.isActive('bold'),      'Bold')}
            {btn(Italic,        () => editor.chain().focus().toggleItalic().run(),    editor.isActive('italic'),    'Italic')}
            {btn(UnderlineIcon, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Underline')}
          </div>

          {/* Headings */}
          <div className="group">
            {btn(Heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Heading 1')}
            {btn(Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Heading 2')}
          </div>

          {/* Lists */}
          <div className="group">
            {btn(List,        () => editor.chain().focus().toggleBulletList().run(),        editor.isActive('bulletList'),  'Bullet list')}
            {btn(ListOrdered, () => editor.chain().focus().toggleOrderedList().run(),       editor.isActive('orderedList'), 'Numbered list')}
            {btn(Indent,      () => editor.chain().focus().sinkListItem('listItem').run(),  false, 'Indent')}
            {btn(Outdent,     () => editor.chain().focus().liftListItem('listItem').run(),  false, 'Outdent')}
          </div>

          {/* Alignment */}
          <div className="group">
            {btn(AlignLeft,    () => editor.chain().focus().setTextAlign('left').run(),    editor.isActive({ textAlign: 'left' }),    'Align left')}
            {btn(AlignCenter,  () => editor.chain().focus().setTextAlign('center').run(),  editor.isActive({ textAlign: 'center' }),  'Align centre')}
            {btn(AlignRight,   () => editor.chain().focus().setTextAlign('right').run(),   editor.isActive({ textAlign: 'right' }),   'Align right')}
            {btn(AlignJustify, () => editor.chain().focus().setTextAlign('justify').run(), editor.isActive({ textAlign: 'justify' }), 'Justify')}
          </div>

          {/* Text colour */}
          <div className="group">
            <button
              type="button"
              className="cl-tool cl-color-btn"
              title="Text colour"
              onClick={() => colorInputRef.current?.click()}
            >
              <span className="cl-color-icon-a" style={{ color: activeColor }}>A</span>
              <span className="cl-color-bar" style={{ background: activeColor }} />
              <input
                ref={colorInputRef}
                type="color"
                value={activeColor}
                onChange={e => applyColor(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              />
            </button>
          </div>

          {/* Line height */}
          <div className="group">
            <select
              className="cl-tool cl-select"
              value={ps.lineHeight ?? 1.7}
              onChange={e => setProp({ lineHeight: Number(e.target.value) })}
              title="Line height"
            >
              {LINE_HEIGHTS.map(lh => (
                <option key={lh.value} value={lh.value}>{lh.label}</option>
              ))}
            </select>
          </div>

          {/* Clear formatting */}
          <div className="group">
            {btn(Eraser, () => editor.chain().focus().clearNodes().unsetAllMarks().run(), false, 'Clear formatting')}
          </div>

          <span className="spacer" />

          {/* Page settings button */}
          <div className="group" style={{ position: 'relative' }}>
            <button
              type="button"
              className={`cl-tool ${showSettings ? 'active' : ''}`}
              onClick={() => setShowSettings(s => !s)}
              title="Page settings"
            >
              <Settings2 size={ICON} />
            </button>
            {settingsPanel}
          </div>

          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', paddingLeft: 6, whiteSpace: 'nowrap' }}>
            {editor.getText().length.toLocaleString()} chars
          </span>
        </div>
      )}

      {/* ── Page canvas ─────────────────────────────────────────── */}
      <div className="cl-page-outer">
        <div
          className="cl-page"
          data-size={ps.pageSize || 'A4'}
          style={{
            paddingTop:    `${m.top    ?? 25}mm`,
            paddingBottom: `${m.bottom ?? 25}mm`,
            paddingLeft:   `${m.left   ?? 25}mm`,
            paddingRight:  `${m.right  ?? 25}mm`,
            '--cl-doc-font-family': ps.fontFamily  || 'Georgia, serif',
            '--cl-doc-font-size':   ps.fontSize    || '12pt',
            '--cl-doc-line-height': ps.lineHeight  ?? 1.7,
            '--cl-space-before':    `${ps.spaceBefore ?? 0}px`,
            '--cl-space-after':     `${ps.spaceAfter  ?? 14}px`,
          }}
        >
          {/* Letterhead slot */}
          {headerContent}

          {/* Body content */}
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
