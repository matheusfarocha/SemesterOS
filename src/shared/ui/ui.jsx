import { useEffect } from 'react'
import { FileText, GraduationCap, Boxes, X } from 'lucide-react'

export const TYPE_ICON = { assignment: FileText, quiz: FileText, exam: GraduationCap, project: Boxes }

export function TypeIcon({ type, size = 14 }) {
  const I = TYPE_ICON[type] ?? FileText
  return <I size={size} strokeWidth={2} />
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal card ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Minimal **bold** + newline renderer for assistant answers
export function RichText({ text }) {
  return text.split('\n').map((line, i) => (
    <p key={i}>
      {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
        part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
      )}
    </p>
  ))
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {children}
    </div>
  )
}
