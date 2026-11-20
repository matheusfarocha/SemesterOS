import { useState } from 'react'
import { useStore } from '@/store/store'
import { askAssistant } from './assistant.service'

// Shared by the floating widget and the full Assistant page.
// Module-level so the conversation survives switching between them.
let history = null

export function useAssistant() {
  const { state } = useStore()
  const [msgs, setMsgsState] = useState(
    () =>
      history ?? [
        { role: 'bot', text: `Hi ${state.user.name}! Ask me anything about your courses: deadlines, grading policies, attendance, or what you need to hit your goals.` },
      ],
  )
  const [busy, setBusy] = useState(false)

  const setMsgs = (fn) =>
    setMsgsState((m) => {
      history = fn(m)
      return history
    })

  const ask = async (q) => {
    if (!q.trim() || busy) return
    setMsgs((m) => [...m, { role: 'user', text: q }])
    setBusy(true)
    const res = await askAssistant(q, state, state.syllabi)
    setMsgs((m) => [...m, { role: 'bot', ...res }])
    setBusy(false)
  }

  const clear = () => setMsgs((m) => m.slice(0, 1))

  return { msgs, busy, ask, clear }
}
