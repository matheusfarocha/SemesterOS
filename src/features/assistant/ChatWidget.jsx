import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MessageSquare, X, Sparkles, Maximize2 } from 'lucide-react'
import { Snow } from '@/shared/ui/ui'
import { useAssistant } from './useAssistant'
import ChatThread from './ChatThread'
import './assistant.css'

/** Floating chat bubble available on every page except /assistant. */
export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const chat = useAssistant()
  if (useLocation().pathname === '/assistant') return null

  return (
    <>
      {open && (
        <div className="chat card">
          <header className="chat-head">
            <Sparkles size={18} className="accent" />
            <div>
              <strong>Semester Assistant</strong>
              <Snow>Cortex Search + COMPLETE</Snow>
            </div>
            <Link className="icon-btn" to="/assistant" onClick={() => setOpen(false)} aria-label="Open full page">
              <Maximize2 size={16} />
            </Link>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={18} />
            </button>
          </header>
          <ChatThread {...chat} />
        </div>
      )}
      <button className="fab" onClick={() => setOpen(!open)} aria-label="Open assistant">
        {open ? <X size={26} /> : <MessageSquare size={26} />}
      </button>
    </>
  )
}
