import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import { useStore } from '@/store/store'
import { TODAY, MONTHS, DOW, iso, parseISO, monthGrid, sameDay, startOfWeek, addDays, fmtShort, daysBetween, relDays } from '@/shared/lib/dates'
import { weekLoad } from '@/features/reminders/reminders.service'
import { TypeIcon, Modal } from '@/shared/ui/ui'

const VIEWS = ['Month', 'Week', 'Agenda']

export default function Calendar() {
  const { state } = useStore()
  const [view, setView] = useState('Month')
  const [cursor, setCursor] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [weekCursor, setWeekCursor] = useState(startOfWeek(TODAY))
  const [open, setOpen] = useState(null)

  const byDate = useMemo(() => {
    const m = {}
    for (const a of state.assessments) {
      if (a.date) (m[a.date] ??= []).push(a)
    }
    return m
  }, [state.assessments])

  const courseOf = (id) => state.courses.find((c) => c.id === id)

  const step = (dir) => {
    if (view === 'Week') setWeekCursor(addDays(weekCursor, 7 * dir))
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
  }

  const title = view === 'Week' ? `Week of ${fmtShort(weekCursor).slice(5)}` : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
  const monthOptions = [...new Set([
    iso(cursor),
    ...Array.from({ length: 6 }, (_, i) => iso(new Date(2026, 7 + i, 1))),
    ...Object.keys(byDate).map((date) => `${date.slice(0, 7)}-01`),
  ])].sort()

  return (
    <section className="card calendar">
      <header className="cal-head">
        <div className="cal-nav">
          <button className="icon-btn boxed" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn boxed" onClick={() => step(1)} aria-label="Next">
            <ChevronRight size={18} />
          </button>
          <label className="cal-title">
            {title}
            {view !== 'Week' && (
              <>
                <ChevronDown size={18} />
                <select
                  value={iso(cursor)}
                  onChange={(e) => setCursor(parseISO(e.target.value))}
                  aria-label="Jump to month"
                >
                  {monthOptions.map((date) => (
                    <option key={date} value={date}>
                      {MONTHS[parseISO(date).getMonth()]} {date.slice(0, 4)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </label>
        </div>
        <div className="segmented">
          {VIEWS.map((v) => (
            <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>
      </header>

      {view === 'Month' && <MonthView cursor={cursor} byDate={byDate} assessments={state.assessments} onOpen={setOpen} />}
      {view === 'Week' && <WeekView start={weekCursor} byDate={byDate} tasks={state.tasks} onOpen={setOpen} />}
      {view === 'Agenda' && <AgendaView assessments={state.assessments} courseOf={courseOf} onOpen={setOpen} />}

      <footer className="legend">
        <span><i className="dot t-assignment" />Assignment</span>
        <span><i className="dot t-exam" />Exam</span>
        <span><i className="dot t-project" />Project</span>
        <span className="sep" />
        <span><i className="dot l-light" />Light week</span>
        <span><i className="dot l-moderate" />Moderate week</span>
        <span><i className="dot l-heavy" />Heavy week</span>
      </footer>

      {open && <EventModal item={open} course={courseOf(open.courseId)} onClose={() => setOpen(null)} />}
    </section>
  )
}

function Chip({ a, onOpen }) {
  return (
    <button className={`chip t-${a.type} ${a.score != null ? 'graded' : ''}`} onClick={() => onOpen(a)} title={a.title}>
      <TypeIcon type={a.type} size={13} />
      <span>{a.title}</span>
    </button>
  )
}

function MonthView({ cursor, byDate, assessments, onOpen }) {
  const weeks = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const thisWeek = iso(startOfWeek(TODAY))
  return (
    <div className="month">
      <div className="dow-row">
        <span />
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="weeks">
        {weeks.map((week) => {
          const load = weekLoad(assessments, week[0])
          const current = iso(week[0]) === thisWeek
          return (
            <div key={iso(week[0])} className={`week-row ${current ? `current l-${load.level}` : ''}`}>
              <span className={`load-bar l-${load.level}`} title={`${load.level} week (load ${load.score})`} />
              {week.map((d) => {
                const items = byDate[iso(d)] ?? []
                const out = d.getMonth() !== cursor.getMonth()
                return (
                  <div key={iso(d)} className={`day ${out ? 'out' : ''} ${sameDay(d, TODAY) ? 'today' : ''}`}>
                    <span className="num">{d.getDate()}</span>
                    {items.slice(0, 2).map((a) => (
                      <Chip key={a.id} a={a} onOpen={onOpen} />
                    ))}
                    {items.length > 2 && <span className="more">+{items.length - 2} more</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ start, byDate, tasks, onOpen }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="weekview">
      {days.map((d) => {
        const items = byDate[iso(d)] ?? []
        const dayTasks = tasks.filter((t) => t.due === iso(d))
        return (
          <div key={iso(d)} className={`wcol ${sameDay(d, TODAY) ? 'today' : ''}`}>
            <div className="wcol-head">
              <span>{DOW[d.getDay()]}</span>
              <span className="num">{d.getDate()}</span>
            </div>
            {items.map((a) => (
              <Chip key={a.id} a={a} onOpen={onOpen} />
            ))}
            {dayTasks.map((t) => (
              <div key={t.id} className={`wtask ${t.done ? 'done' : ''}`}>
                ☐ {t.title}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function AgendaView({ assessments, courseOf, onOpen }) {
  const items = assessments
    .filter((a) => a.date && a.score == null && daysBetween(TODAY, parseISO(a.date)) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const undated = assessments.filter((a) => !a.date)
  return (
    <div className="agenda">
      {items.map((a) => {
        const d = parseISO(a.date)
        const c = courseOf(a.courseId)
        return (
          <button key={a.id} className="agenda-row" onClick={() => onOpen(a)}>
            <div className="agenda-date">
              <span>{DOW[d.getDay()]}</span>
              <strong>{d.getDate()}</strong>
              <span>{MONTHS[d.getMonth()].slice(0, 3)}</span>
            </div>
            <span className={`type-pill t-${a.type}`}>
              <TypeIcon type={a.type} />
            </span>
            <div className="agenda-main">
              <strong>{a.title}</strong>
              <span>
                <i className="cdot" style={{ background: c?.color }} />
                {c?.code} · {c?.name}
              </span>
            </div>
            <span className="muted">{relDays(daysBetween(TODAY, d))}</span>
          </button>
        )
      })}
      {!items.length && <p className="muted pad">Nothing upcoming.</p>}
      {undated.length > 0 && <h4 className="pad">Events without an exact date</h4>}
      {undated.map((a) => (
        <button key={a.id} className="agenda-row" onClick={() => onOpen(a)}>
          <TypeIcon type={a.type} />
          <span className="agenda-main"><strong>{a.title}</strong><span>{courseOf(a.courseId)?.code}</span></span>
          <span className="muted">{a.dateText ?? 'Date unknown'}</span>
        </button>
      ))}
    </div>
  )
}

function EventModal({ item, course, onClose }) {
  const { dispatch } = useStore()
  const [score, setScore] = useState(item.score ?? '')
  const cat = course?.categories.find((c) => c.id === item.categoryId)
  const save = () => {
    dispatch({ type: 'setScore', id: item.id, score: score === '' ? null : Math.max(0, Number(score)) })
    onClose()
  }
  return (
    <Modal title={item.title} onClose={onClose}>
      <dl className="facts">
        <dt>Course</dt>
        <dd>
          <i className="cdot" style={{ background: course?.color }} />
          {course?.code} · {course?.name}
        </dd>
        <dt>Date</dt>
        <dd>{item.date ? fmtShort(parseISO(item.date)) : item.dateText ?? 'Unknown'}</dd>
        {(item.time || item.timeText) && <><dt>Time</dt><dd>{item.time ? item.time.slice(0, 5) : item.timeText}</dd></>}
        <dt>Type</dt>
        <dd className="cap">{item.type?.replace('_', ' ') ?? 'Unknown'}</dd>
        <dt>Category</dt>
        <dd>
          {cat?.name ?? item.categoryName ?? 'Uncategorized'} {cat?.weight != null && `(${cat.weight}% of grade)`}
        </dd>
      </dl>
      {item.points != null && <label className="field">
        <span>Score (out of {item.points})</span>
        <input type="number" min="0" value={score} placeholder="Not graded yet" onChange={(e) => setScore(e.target.value)} />
      </label>}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          {item.points == null ? 'Close' : 'Cancel'}
        </button>
        {item.points != null && <button className="btn primary" onClick={save}>
          Save score
        </button>}
      </div>
    </Modal>
  )
}
