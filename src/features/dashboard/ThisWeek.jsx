import { useState } from 'react'
import { SquareCheck, Plus, X } from 'lucide-react'
import { useStore } from '@/store/store'
import { TODAY, startOfWeek, addDays, iso, parseISO, fmtMonthDay } from '@/shared/lib/dates'

export default function ThisWeek() {
  const { state, dispatch } = useStore()
  const [draft, setDraft] = useState('')
  const ws = startOfWeek(TODAY)
  const we = addDays(TODAY, 7) // rolling: this week so far + next 7 days
  const tasks = state.tasks
    .filter((t) => {
      const d = parseISO(t.due)
      return (d >= ws && d < we) || (!t.done && d < ws)
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
  const done = tasks.filter((t) => t.done).length

  const add = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    dispatch({ type: 'addTask', task: { title: draft.trim(), due: iso(addDays(TODAY, 1)) } })
    setDraft('')
  }

  return (
    <section className="card side-card">
      <header className="side-head">
        <SquareCheck size={22} className="accent" />
        <h2>This Week</h2>
        <span className="count">
          {done} of {tasks.length}
        </span>
      </header>
      <ul className="tasks">
        {tasks.map((t) => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => dispatch({ type: 'toggleTask', id: t.id })} />
              <span className="box" />
              <span className="t-title">{t.title}</span>
            </label>
            {!t.done && <span className="due">{fmtMonthDay(parseISO(t.due))}</span>}
            <button className="icon-btn tiny" onClick={() => dispatch({ type: 'removeTask', id: t.id })} aria-label="Remove task">
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form className="add-task" onSubmit={add}>
        <Plus size={16} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a task for this week" />
      </form>
    </section>
  )
}
