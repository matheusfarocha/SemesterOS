import { useMemo, useState } from 'react'
import { useStore } from '@/store/store'
import { generateReminders, weekLoad } from './reminders.service'
import ReminderItem from './ReminderItem'
import { TODAY, addDays, startOfWeek, fmtMonthDay } from '@/shared/lib/dates'
import { PageHeader, Snow } from '@/shared/ui/ui'
import './reminders.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'deadline', label: 'Deadlines' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'risk', label: 'Academic risk' },
]

export default function RemindersPage() {
  const { state } = useStore()
  const [filter, setFilter] = useState('all')
  const reminders = useMemo(() => generateReminders(state), [state])
  const shown = filter === 'all' ? reminders : reminders.filter((r) => r.kind === filter)
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const ws = addDays(startOfWeek(TODAY), i * 7)
    return { ws, ...weekLoad(state.assessments, ws) }
  })
  const maxScore = Math.max(...weeks.map((w) => w.score), 1)

  return (
    <>
      <PageHeader title="Smart Reminders" sub="Deadlines, crunch points and risks, before they sneak up on you.">
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
              <span className="seg-count">{f.id === 'all' ? reminders.length : reminders.filter((r) => r.kind === f.id).length}</span>
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="reminders-layout">
        <section className="card side-card">
          <ul className="reminders">
            {shown.map((r) => (
              <ReminderItem key={r.id} r={r} />
            ))}
            {!shown.length && <li className="muted">Nothing here. Nice.</li>}
          </ul>
          <Snow>Task NIGHTLY_REMINDERS → REMINDERS table</Snow>
        </section>

        <section className="card side-card">
          <header className="side-head">
            <h2>Workload ahead</h2>
          </header>
          <div className="load-chart">
            {weeks.map((w) => (
              <div key={w.ws.toISOString()} className="load-col">
                <span className="load-score">{w.score}</span>
                <div className="load-track">
                  <span className={`load-fill l-${w.level}`} style={{ height: `${(w.score / maxScore) * 100}%` }} />
                </div>
                <span className="muted small">{fmtMonthDay(w.ws)}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Load score per week: exam/project 3, assignment 1.5, quiz 1. Heavy ≥ 5.5.</p>
        </section>
      </div>
    </>
  )
}
