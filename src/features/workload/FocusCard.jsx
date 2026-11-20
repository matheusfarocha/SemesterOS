import { useMemo } from 'react'
import { Target, Plus, Check } from 'lucide-react'
import { useStore } from '@/store/store'
import { TODAY, iso, parseISO, fmtShort } from '@/shared/lib/dates'
import { useWorkload } from './useWorkload'
import { focusThisWeek } from './workload.service'
import './workload.css'

/** Dashboard card: which courses deserve your time in the next 7 days, and why. */
export default function FocusCard({ limit = 3 }) {
  const { state, dispatch } = useStore()
  const wl = useWorkload()
  const focus = useMemo(() => focusThisWeek(wl, TODAY), [wl])
  const shown = focus.slice(0, limit)

  const plan = (item) => {
    const due = parseISO(item.prepStart) < TODAY ? TODAY : parseISO(item.prepStart)
    dispatch({ type: 'addTask', task: { title: `Start studying: ${item.title}`, due: iso(due), courseId: item.courseId } })
  }

  return (
    <section className="card side-card">
      <header className="side-head">
        <Target size={22} className="accent" />
        <h2>Focus this week</h2>
        <span className="muted small" title="Share of your next 7 days, weighted by % of grade, credits and how you're doing">next 7 days</span>
      </header>
      {!shown.length && <p className="muted">Nothing big in the next 7 days.</p>}
      {shown.length > 0 && (
        <p className="focus-lead">
          Spend most of your time on <b style={{ color: shown[0].course.color }}>{shown[0].course.short}</b>.
        </p>
      )}
      <ul className="focus">
        {shown.map(({ course, share, top }) => {
          const planned = state.tasks.some((t) => t.title === `Start studying: ${top.title}`)
          return (
            <li key={course.id}>
              <div className="focus-row">
                <i className="cdot" style={{ background: course.color }} />
                <strong>{course.short}</strong>
                <span className="focus-bar">
                  <span style={{ width: `${share * 100}%`, background: course.color }} />
                </span>
                <b>{Math.round(share * 100)}%</b>
              </div>
              <div className="focus-why">
                <span className="muted small">
                  {top.title} · {top.impact.toFixed(0)}% of grade · due {fmtShort(parseISO(top.date)).slice(5)}
                  {top.factors.risk > 1.001 && ' · you’re below goal'}
                  {top.estimated && ' · date estimated'}
                </span>
                <button className="btn ghost small" disabled={planned} onClick={() => plan(top)}>
                  {planned ? <Check size={13} /> : <Plus size={13} />} {planned ? 'Planned' : 'Plan it'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
