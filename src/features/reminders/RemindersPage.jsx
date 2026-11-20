import { useMemo, useState } from 'react'
import { useStore } from '@/store/store'
import { generateReminders } from './reminders.service'
import ReminderItem from './ReminderItem'
import { useWorkload } from '@/features/workload/useWorkload'
import { weekLoad } from '@/features/workload/workload.service'
import WorkloadBreakdown from '@/features/workload/WorkloadBreakdown'
import { TODAY, addDays, startOfWeek, fmtMonthDay, iso } from '@/shared/lib/dates'
import { PageHeader, Snow } from '@/shared/ui/ui'
import { useSlidingPill } from '@/shared/ui/useSlidingPill'
import './reminders.css'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'deadline', label: 'Deadlines' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'risk', label: 'Academic risk' },
]

export default function RemindersPage() {
  const { state } = useStore()
  const wl = useWorkload()
  const [filter, setFilter] = useState('all')
  const [filtersRef, filterPill] = useSlidingPill('button.active', filter)
  const [sel, setSel] = useState(0)
  const reminders = useMemo(() => generateReminders(state), [state])
  const shown = filter === 'all' ? reminders : reminders.filter((r) => r.kind === filter)
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const ws = addDays(startOfWeek(TODAY), i * 7)
    return { ws, ...weekLoad(wl, ws) }
  })
  const maxScore = Math.max(...weeks.map((w) => w.score), wl.thresholds.heavy, 1)

  return (
    <>
      <PageHeader title="Smart Reminders" sub="Deadlines, crunch points and risks, before they sneak up on you.">
        <div className="segmented" ref={filtersRef}>
          <span className="seg-pill" aria-hidden style={filterPill} />
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
            {weeks.map((w, i) => (
              <button key={iso(w.ws)} className={`load-col ${sel === i ? 'sel' : ''}`} onClick={() => setSel(i)}>
                <span className="load-score">{w.score.toFixed(0)}</span>
                <div className="load-track">
                  <span className={`load-fill l-${w.level}`} style={{ height: `${(w.score / maxScore) * 100}%` }} />
                </div>
                <span className="muted small">{fmtMonthDay(w.ws)}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Grade-points at stake per week, with prep spread before each deadline. Click a week to see why.</p>
          <div className="wl-card">
            <WorkloadBreakdown info={weeks[sel]} thresholds={wl.thresholds} />
          </div>
          <Snow>SQL · V_DAILY_LOAD</Snow>
        </section>
      </div>
    </>
  )
}
