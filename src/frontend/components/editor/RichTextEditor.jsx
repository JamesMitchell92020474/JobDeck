import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { useEffect, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon,
  Heading1, Heading2,
  List, ListOrdered, Indent, Outdent,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Eraser, Undo2, Redo2,
} from 'lucide-react'

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: el => el.style.fontSize || null,
        renderHTML: attrs => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    }
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: size => ({ chain }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
    }
  },
})

const FONT_SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt']
const DEFAULT_SIZE = '12pt'
const ICON_SIZE = 14

export default function RichTextEditor({ content, onChange, readOnly }) {
  const [fontSize, setFontSize] = useState(DEFAULT_SIZE)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSize,
    ],
    content: content || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
  })

  useEffect(() => {
    if (editor && content !== undefined) {
      const current = editor.getHTML()
      if (current !== content) editor.commands.setContent(content || '')
    }
  }, [content])

  if (!editor) return null

  const applyFontSize = (size) => {
    setFontSize(size)
    editor.chain().focus().selectAll().setFontSize(size).run()
  }

  const btn = (Icon, action, active, title) => (
    <button
      key={title}
      type="button"
      className={`cl-tool ${active ? 'active' : ''}`}
      onClick={action}
      title={title}
    >
      <Icon size={ICON_SIZE} />
    </button>
  )

  return (
    <div>
      {!readOnly && (
        <div className="cl-toolbar">
          <div className="group">
            {btn(Undo2, () => editor.chain().focus().undo().run(), false, 'Undo')}
            {btn(Redo2, () => editor.chain().focus().redo().run(), false, 'Redo')}
          </div>

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

          <div className="group">
            {btn(Bold,          () => editor.chain().focus().toggleBold().run(),      editor.isActive('bold'),      'Bold')}
            {btn(Italic,        () => editor.chain().focus().toggleItalic().run(),    editor.isActive('italic'),    'Italic')}
            {btn(UnderlineIcon, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'), 'Underline')}
          </div>

          <div className="group">
            {btn(Heading1, () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }), 'Heading 1')}
            {btn(Heading2, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }), 'Heading 2')}
          </div>

          <div className="group">
            {btn(List,         () => editor.chain().focus().toggleBulletList().run(),         editor.isActive('bulletList'),  'Bullet list')}
            {btn(ListOrdered,  () => editor.chain().focus().toggleOrderedList().run(),        editor.isActive('orderedList'), 'Numbered list')}
            {btn(Indent,       () => editor.chain().focus().sinkListItem('listItem').run(),   false, 'Indent')}
            {btn(Outdent,      () => editor.chain().focus().liftListItem('listItem').run(),   false, 'Outdent')}
          </div>

          <div className="group">
            {btn(AlignLeft,    () => editor.chain().focus().setTextAlign('left').run(),    editor.isActive({ textAlign: 'left' }),    'Align left')}
            {btn(AlignCenter,  () => editor.chain().focus().setTextAlign('center').run(),  editor.isActive({ textAlign: 'center' }),  'Align centre')}
            {btn(AlignRight,   () => editor.chain().focus().setTextAlign('right').run(),   editor.isActive({ textAlign: 'right' }),   'Align right')}
            {btn(AlignJustify, () => editor.chain().focus().setTextAlign('justify').run(), editor.isActive({ textAlign: 'justify' }), 'Justify')}
          </div>

          <div className="group">
            {btn(Eraser, () => editor.chain().focus().clearNodes().unsetAllMarks().run(), false, 'Clear formatting')}
          </div>

          <span className="spacer" />
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
            {editor.getText().length.toLocaleString()} chars
          </span>
        </div>
      )}
      <div className="cl-editor-wrap">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
