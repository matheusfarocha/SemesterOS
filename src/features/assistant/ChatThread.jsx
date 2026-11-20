import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { SUGGESTIONS } from './assistant.service'
import { RichText } from '@/shared/ui/ui'

export default function ChatThread({ msgs, busy, ask }) {
  const [input, setInput] = useState('')
  const body = useRef(null)
  // Scroll the thread itself, not the window
  useEffect(() => {
    const el = body.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  return (
    <>
      <div className="chat-body" ref={body}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <RichText text={m.text} />
            {m.sources?.length > 0 && (
              <div className="sources">
                {m.sources.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg bot typing">
            <i />
            <i />
            <i />
          </div>
        )}
        {msgs.length === 1 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          ask(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your semester…" autoFocus />
        <button className="icon-btn" disabled={busy || !input.trim()} aria-label="Send">
          <Send size={18} />
        </button>
      </form>
    </>
  )
}
