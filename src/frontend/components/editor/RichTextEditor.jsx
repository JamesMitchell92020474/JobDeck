import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { useEffect } from 'react'

export default function RichTextEditor({ content, onChange, readOnly }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
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

  const tool = (label, action, active) => (
    <div
      className={`cl-tool ${active ? 'active' : ''}`}
      onClick={action}
      title={label}
    >
      {label}
    </div>
  )

  return (
    <div>
      {!readOnly && (
        <div className="cl-toolbar">
          <div className="group">
            {tool('B', () => editor.chain().focus().toggleBold().run(),      editor.isActive('bold'))}
            {tool('I', () => editor.chain().focus().toggleItalic().run(),    editor.isActive('italic'))}
            {tool('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
          </div>
          <div className="group">
            {tool('H1', () => editor.chain().focus().toggleHeading({ level: 1 }).run(), editor.isActive('heading', { level: 1 }))}
            {tool('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
            {tool('¶',  () => editor.chain().focus().setParagraph().run(),               editor.isActive('paragraph'))}
          </div>
          <div className="group">
            {tool('•',  () => editor.chain().focus().toggleBulletList().run(),  editor.isActive('bulletList'))}
            {tool('1.', () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
          </div>
          <div className="group">
            {tool('L', () => editor.chain().focus().setTextAlign('left').run(),    editor.isActive({ textAlign: 'left' }))}
            {tool('C', () => editor.chain().focus().setTextAlign('center').run(),  editor.isActive({ textAlign: 'center' }))}
            {tool('R', () => editor.chain().focus().setTextAlign('right').run(),   editor.isActive({ textAlign: 'right' }))}
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
