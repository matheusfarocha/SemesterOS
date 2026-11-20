import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, PlusCircle } from 'lucide-react'
import { useStore } from '@/store/store'
import { TODAY, MONTHS, DOW, iso, parseISO, monthGrid, sameDay, startOfWeek, addDays, fmtShort, fmtMonthDay, daysBetween, relDays } from '@/shared/lib/dates'
import { useWorkload } from '@/features/workload/useWorkload'
import { weekLoad, weekSummary, gradeImpact, prepDays } from '@/features/workload/workload.service'
import WorkloadBreakdown from '@/features/workload/WorkloadBreakdown'
import { TypeIcon, Modal } from '@/shared/ui/ui'
import AddItemModal from './AddItemModal'

const VIEWS = ['Month', 'Week', 'Agenda']
const MAX_CARDS = 2 // per day cell; the rest go behind "+ N more"

export default function Calendar() {
  const { state } = useStore()
  const [view, setView] = useState('Month')
  const [cursor, setCursor] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [weekCursor, setWeekCursor] = useState(startOfWeek(TODAY))
  const [selected, setSelected] = useState(iso(TODAY))
  const [open, setOpen] = useState(null) // assessment in the detail modal
  const [dayOpen, setDayOpen] = useState(null) // iso date in the "all items" modal
  const [why, setWhy] = useState(null) // week start whose load breakdown is open
  const [adding, setAdding] = useState(false)
  const wl = useWorkload()

  const byDate = useMemo(() => {
    const m = {}
    for (const a of state.assessments) if (a.date && !a.undated) (m[a.date] ??= []).push(a)
    return m
  }, [state.assessments])

  const eventsByDate = useMemo(() => {
    const m = {}
    for (const e of state.events ?? []) (m[e.date] ??= []).push(e)
    return m
  }, [state.events])

  const courseOf = (id) => state.courses.find((c) => c.id === id)

  const step = (dir) => {
    if (view === 'Week') setWeekCursor(addDays(weekCursor, 7 * dir))
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1))
  }
  const goToday = () => {
    setCursor(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
    setWeekCursor(startOfWeek(TODAY))
    setSelected(iso(TODAY))
  }

  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
  const title = view === 'Week' ? `Week of ${fmtMonthDay(weekCursor)}` : `${MONTHS[cursor.getMonth()]}, ${cursor.getFullYear()}`
  const range =
    view === 'Week'
      ? `${fmtMonthDay(weekCursor)} – ${fmtMonthDay(addDays(weekCursor, 6))}, ${addDays(weekCursor, 6).getFullYear()}`
      : `${fmtMonthDay(cursor)}, ${cursor.getFullYear()} – ${fmtMonthDay(monthEnd)}, ${monthEnd.getFullYear()}`
  // Fall 2026 plus every month that has an item (uploaded syllabi can be from other terms)
  const monthOptions = [...new Set([
    iso(cursor),
    ...Array.from({ length: 6 }, (_, i) => iso(new Date(2026, 7 + i, 1))),
    ...Object.keys(byDate).map((date) => `${date.slice(0, 7)}-01`),
  ])].sort()

  return (
    <section className="card calendar">
      <header className="cal-head">
        <div className="cal-id">
          <div className="date-badge" title="Today">
            <span>{MONTHS[TODAY.getMonth()].slice(0, 3)}</span>
            <strong>{TODAY.getDate()}</strong>
          </div>
          <div>
            <label className="cal-title">
              {title}
              {view !== 'Week' && (
                <>
                  <ChevronDown size={16} />
                  <select value={iso(cursor)} onChange={(e) => setCursor(parseISO(e.target.value))} aria-label="Jump to month">
                    {monthOptions.map((date) => (
                      <option key={date} value={date}>
                        {MONTHS[parseISO(date).getMonth()]} {date.slice(0, 4)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </label>
            <p className="cal-range">{range}</p>
          </div>
        </div>

        <div className="cal-actions">
          <div className="segmented small">
            {VIEWS.map((v) => (
              <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
                {v}
              </button>
            ))}
          </div>
          <span className="vsep" />
          <div className="btn-group">
            <button onClick={() => step(-1)} aria-label="Previous">
              <ChevronLeft size={16} />
            </button>
            <button onClick={goToday}>Today</button>
            <button onClick={() => step(1)} aria-label="Next">
              <ChevronRight size={16} />
            </button>
          </div>
          <span className="vsep" />
          <button className="btn primary small" onClick={() => setAdding(true)}>
            <PlusCircle size={16} /> New item
          </button>
        </div>
      </header>

      <div className="cal-body">
        {view === 'Month' && (
          <MonthView
            cursor={cursor}
            byDate={byDate}
            eventsByDate={eventsByDate}
            wl={wl}
            courseOf={courseOf}
            selected={selected}
            onSelect={setSelected}
            onOpen={setOpen}
            onMore={setDayOpen}
            onWhy={setWhy}
          />
        )}
        {view === 'Week' && <WeekView start={weekCursor} byDate={byDate} eventsByDate={eventsByDate} tasks={state.tasks} wl={wl} onOpen={setOpen} onWhy={setWhy} />}
        {view === 'Agenda' && <AgendaView assessments={state.assessments} courseOf={courseOf} onOpen={setOpen} />}
      </div>

      {view === 'Month' && (
        // Phone layout shows dots in the grid, so the selected day's items are listed here
        <DayList className="selected-day" date={selected} items={byDate[selected] ?? []} events={eventsByDate[selected] ?? []} courseOf={courseOf} onOpen={setOpen} />
      )}

      <footer className="legend">
        <span><i className="dot t-assignment" />Assignment</span>
        <span><i className="dot t-exam" />Exam</span>
        <span><i className="dot t-project" />Project</span>
        <span><i className="dot est" />Estimated date</span>
        <span className="sep" />
        <span className="lg-label">Week load:</span>
        <span><i className="lvl-dot l-light" />Light</span>
        <span><i className="lvl-dot l-moderate" />Moderate</span>
        <span><i className="lvl-dot l-heavy" />Heavy</span>
        <span className="muted small">· click a week's label for details</span>
      </footer>

      {open && <EventModal item={open} course={courseOf(open.courseId)} assessments={state.assessments} onClose={() => setOpen(null)} />}
      {dayOpen && (
        <Modal title={fmtShort(parseISO(dayOpen))} onClose={() => setDayOpen(null)}>
          <DayList date={dayOpen} items={byDate[dayOpen] ?? []} events={eventsByDate[dayOpen] ?? []} courseOf={courseOf} onOpen={(a) => { setDayOpen(null); setOpen(a) }} />
        </Modal>
      )}
      {why && (
        <Modal title={`Week of ${fmtShort(why).slice(5)}`} onClose={() => setWhy(null)} wide>
          <WorkloadBreakdown info={weekLoad(wl, why)} thresholds={wl.thresholds} />
        </Modal>
      )}
      {adding && <AddItemModal defaultDate={selected} onClose={() => setAdding(false)} />}
    </section>
  )
}

/** Compact chip, used by the Week view. */
function Chip({ a, onOpen }) {
  return (
    <button
      className={`chip t-${a.type} ${a.score != null ? 'graded' : ''} ${a.estimated ? 'estimated' : ''}`}
      onClick={() => onOpen(a)}
      title={a.estimated ? `${a.title} (estimated date)` : a.title}
    >
      <TypeIcon type={a.type} size={13} />
      <span>
        {a.estimated && '~ '}
        {a.title}
      </span>
    </button>
  )
}

/** Event card inside a month cell: title + course/type line. */
function EventCard({ a, course, onOpen }) {
  return (
    <button
      className={`ev t-${a.type} ${a.score != null ? 'graded' : ''} ${a.estimated ? 'estimated' : ''}`}
      style={{ '--c': course?.color }}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(a)
      }}
      title={a.estimated ? `${a.title} (estimated date)` : a.title}
    >
      <span className="ev-title">
        {a.estimated && '~ '}
        {a.title}
      </span>
      <span className="ev-meta">
        <TypeIcon type={a.type} size={11} />
        {course?.code.split(' ')[0]} · {a.score != null ? `${Math.round((a.score / a.points) * 100)}%` : a.type}
      </span>
    </button>
  )
}

function EventLabels({ events }) {
  return events.map((e) => (
    <span key={e.id} className={`cal-event k-${e.kind}`} title={e.title}>
      {e.title}
    </span>
  ))
}

function DayList({ date, items, events, courseOf, onOpen, className = '' }) {
  return (
    <div className={`day-list ${className}`}>
      {className && <h4>{fmtShort(parseISO(date))}</h4>}
      <EventLabels events={events} />
      {items.map((a) => (
        <EventCard key={a.id} a={a} course={courseOf(a.courseId)} onOpen={onOpen} />
      ))}
      {!items.length && !events.length && <p className="muted small">Nothing on this day.</p>}
    </div>
  )
}

function MonthView({ cursor, byDate, eventsByDate, wl, courseOf, selected, onSelect, onOpen, onMore, onWhy }) {
  const weeks = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const thisWeek = iso(startOfWeek(TODAY))
  return (
    <div className="month">
      <div className="dow-row">
        <span className="gutter">Load</span>
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="weeks">
        {weeks.map((week) => {
          const sum = weekSummary(wl, week[0])
          const current = iso(week[0]) === thisWeek
          const past = iso(week[6]) < iso(TODAY)
          const tip = `${sum.label} week · ${sum.score.toFixed(0)} grade-points${sum.top ? ` · mostly ${sum.prepFor ? `prep for ${sum.top.title}` : sum.top.title}` : ''}`
          return (
            <div key={iso(week[0])} className={`week-row ${current ? `current l-${sum.level}` : ''} ${past ? 'past' : ''}`}>
              <button className={`wk-label l-${sum.level}`} title={tip} aria-label={`Week of ${fmtMonthDay(week[0])}: ${tip}. Show details`} onClick={() => onWhy(week[0])}>
                <i className="lvl-dot" />
                <span className="wk-word">{sum.label}</span>
                {sum.prepFor && <span className="wk-prep">prep</span>}
              </button>
              {week.map((d) => {
                const key = iso(d)
                const items = byDate[key] ?? []
                const out = d.getMonth() !== cursor.getMonth()
                return (
                  <div
                    key={key}
                    className={`day ${out ? 'out' : ''} ${sameDay(d, TODAY) ? 'today' : ''} ${selected === key ? 'selected' : ''}`}
                    onClick={() => onSelect(key)}
                  >
                    <div className="day-head">
                      <time className="num" dateTime={key}>
                        {d.getDate()}
                      </time>
                      <EventLabels events={eventsByDate[key] ?? []} />
                    </div>
                    <div className="day-items">
                      {items.slice(0, MAX_CARDS).map((a) => (
                        <EventCard key={a.id} a={a} course={courseOf(a.courseId)} onOpen={onOpen} />
                      ))}
                      {items.length > MAX_CARDS && (
                        <button
                          className="more"
                          onClick={(e) => {
                            e.stopPropagation()
                            onMore(key)
                          }}
                        >
                          + {items.length - MAX_CARDS} more
                        </button>
                      )}
                    </div>
                    {items.length > 0 && (
                      <div className="day-dots">
                        {items.map((a) => (
                          <i key={a.id} className={`t-${a.type} ${a.estimated ? 'est' : ''}`} />
                        ))}
                      </div>
                    )}
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

function WeekView({ start, byDate, eventsByDate, tasks, wl, onOpen, onWhy }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const sum = weekSummary(wl, start)
  return (
    <>
    <div className={`week-summary l-${sum.level}`}>
      <span className="lvl-chip">
        <i className="lvl-dot" />
        {sum.label}
      </span>
      <span className="num">{sum.score.toFixed(0)} grade-points</span>
      {sum.top && (
        <span className="muted">
          · mostly {sum.prepFor ? `prep for ${sum.prepFor.title} (due ${fmtMonthDay(parseISO(sum.prepFor.date))})` : sum.top.title}
        </span>
      )}
      <span className="grow" />
      <button className="btn ghost tiny" onClick={() => onWhy(start)}>
        Why?
      </button>
    </div>
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
            <EventLabels events={eventsByDate[iso(d)] ?? []} />
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
    </>
  )
}

function AgendaView({ assessments, courseOf, onOpen }) {
  const items = assessments
    .filter((a) => a.date && a.score == null && !a.undated && daysBetween(TODAY, parseISO(a.date)) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const undated = assessments.filter((a) => a.score == null && (!a.date || a.undated))
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
              <strong>
                {a.title} {a.estimated && <span className="est-tag">estimated</span>}
              </strong>
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
          <span className="muted">{a.dateText ?? a.source ?? 'Date unknown'}</span>
        </button>
      ))}
    </div>
  )
}

function EventModal({ item, course, assessments, onClose }) {
  const { dispatch } = useStore()
  const [score, setScore] = useState(item.score ?? '')
  const [date, setDate] = useState(item.date)
  const cat = course?.categories.find((c) => c.id === item.categoryId)
  const impact = course ? gradeImpact(item, course, assessments) : 0
  const prep = prepDays(item)
  const save = () => {
    dispatch({ type: 'setScore', id: item.id, score: score === '' ? null : Math.max(0, Number(score)) })
    onClose()
  }
  const confirm = () => {
    dispatch({ type: 'confirmDate', id: item.id, date })
    onClose()
  }
  return (
    <Modal title={item.title} onClose={onClose}>
      {item.estimated && (
        <div className="estimate-box">
          <strong>Estimated date</strong>
          <span>
            {item.source ?? 'Inferred from the syllabus'}
            {item.windowEnd && ` · could be any day ${fmtShort(parseISO(item.date)).slice(5)}–${fmtShort(parseISO(item.windowEnd)).slice(5)}`}. Check your course site,
            then confirm.
          </span>
          <div className="estimate-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn primary small" onClick={confirm}>
              Confirm date
            </button>
          </div>
        </div>
      )}
      <dl className="facts">
        <dt>Course</dt>
        <dd>
          <i className="cdot" style={{ background: course?.color }} />
          {course?.code} · {course?.name}
        </dd>
        <dt>Date</dt>
        <dd>
          {item.date ? fmtShort(parseISO(item.date)) : item.dateText ?? 'Unknown'}
          {item.estimated && <span className="est-tag">estimated</span>}
        </dd>
        {(item.time || item.timeText) && (
          <>
            <dt>Time</dt>
            <dd>{item.time ? item.time.slice(0, 5) : item.timeText}</dd>
          </>
        )}
        <dt>Type</dt>
        <dd className="cap">{item.type?.replace('_', ' ') ?? 'Unknown'}</dd>
        <dt>Category</dt>
        <dd>
          {cat?.name ?? item.categoryName ?? 'Uncategorized'} {cat?.weight != null && `(${cat.weight}% of grade)`}
        </dd>
        {impact > 0 && (
          <>
            <dt>Worth</dt>
            <dd>{impact.toFixed(1)}% of your final grade</dd>
          </>
        )}
        {item.date && (
          <>
            <dt>Start prep</dt>
            <dd>
              {fmtShort(addDays(parseISO(item.date), -(prep - 1)))} ({prep}-day window)
            </dd>
          </>
        )}
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
