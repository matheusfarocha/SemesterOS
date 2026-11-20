import { ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react'
import { useStore } from '@/store/store'
import { TODAY, parseISO, fmtMonthDay, daysBetween } from '@/shared/lib/dates'
import { gradeImpact } from '@/features/workload/workload.service'
import { TypeIcon } from '@/shared/ui/ui'
import { courseGrade, requiredScore, letter, LETTER_TARGETS, gradeVerdict } from './grades.service'

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length

export default function CourseGradeCard({ course, assessments, whatIf, onWhatIf, open, onToggle }) {
  const { dispatch } = useStore()
  const g = courseGrade(course, assessments)
  const absences = whatIf?.absences ?? course.attendance.absences
  const hypo = whatIf?.hypo ?? {}
  const need = g.current == null ? null : requiredScore(course, assessments, course.target, { absences })
  const v = gradeVerdict(g, need, course.target)

  // With no real grades, assume untouched items match the student's own what-ifs (never a made-up default)
  const hypoVals = Object.values(hypo)
  const fill = g.current == null ? (hypoVals.length ? mean(hypoVals) : null) : null
  const showSim = g.current != null || hypoVals.length > 0
  const sim = showSim ? courseGrade(course, assessments, { hypo, absences, fill }) : null
  const changed = hypoVals.length > 0 || absences !== course.attendance.absences

  const items = assessments.filter((a) => a.courseId === course.id)
  const awaiting = items.filter((a) => a.score == null && !a.undated && daysBetween(TODAY, parseISO(a.date)) < 0)
  const upcoming = items.filter((a) => a.score == null && !awaiting.includes(a)).sort((a, b) => a.date.localeCompare(b.date))
  const graded = items.filter((a) => a.score != null)
  const guess = Math.round(g.current ?? 85)

  const setHypo = (id, val) => onWhatIf({ hypo: { ...hypo, [id]: val }, absences })
  const targets = LETTER_TARGETS.some(([, t]) => t === course.target) ? LETTER_TARGETS : [...LETTER_TARGETS, [`${course.target}%`, course.target]]
  const at = course.attendance

  return (
    <section className={`card gcard ${open ? 'open' : ''}`} style={{ '--c': course.color }}>
      <button className="gcard-head" onClick={onToggle} aria-expanded={open}>
        <i className="cdot" style={{ background: course.color }} />
        <div className="gcard-name">
          <strong>{course.short}</strong>
          <span className="muted small">{course.name}</span>
        </div>
        <div className="gcard-now">
          <strong>{g.current == null ? '—' : `${g.current.toFixed(1)}%`}</strong>
          <span>{letter(g.current)}</span>
        </div>
        <span className={`chip-status s-${v.tone}`}>{v.label}</span>
        <p className="gcard-text">{v.text}</p>
        <ChevronDown size={18} className="gcard-chev" />
      </button>

      {open && (
        <div className="gcard-body">
          <label className="goal">
            Goal
            <select value={course.target} onChange={(e) => dispatch({ type: 'updateCourse', id: course.id, patch: { target: Number(e.target.value) } })}>
              {targets.map(([l, t]) => (
                <option key={l} value={t}>
                  {l} ({t}%+)
                </option>
              ))}
            </select>
          </label>

          {awaiting.length > 0 && (
            <div className="gsec">
              <h4>Already happened. Enter your real score</h4>
              {awaiting.map((a) => (
                <div key={a.id} className="grow-item">
                  <span className={`type-pill t-${a.type}`}>
                    <TypeIcon type={a.type} />
                  </span>
                  <span className="gi-title">{a.title}</span>
                  <span className="muted small">{fmtMonthDay(parseISO(a.date))}</span>
                  <input
                    className="score-in"
                    type="number"
                    min="0"
                    placeholder={`/ ${a.points}`}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    onBlur={(e) => e.target.value !== '' && dispatch({ type: 'setScore', id: a.id, score: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="gsec">
            <h4>Coming up. Try a score</h4>
            {!upcoming.length && <p className="muted small">Nothing left to grade.</p>}
            {upcoming.map((a) => {
              const val = hypo[a.id]
              return (
                <div key={a.id} className="grow-item">
                  <span className={`type-pill t-${a.type}`}>
                    <TypeIcon type={a.type} />
                  </span>
                  <span className="gi-title">
                    {a.title}
                    <span className="muted small">
                      {a.undated ? 'no date yet' : fmtMonthDay(parseISO(a.date))} · worth {gradeImpact(a, course, assessments).toFixed(0)}% of grade
                      {a.estimated && !a.undated && <span className="est-tag">est.</span>}
                    </span>
                  </span>
                  <input type="range" min="0" max="100" value={val ?? guess} onChange={(e) => setHypo(a.id, Number(e.target.value))} />
                  <b className={val == null ? 'muted' : ''} title={val == null ? 'Your current average, until you move the slider' : undefined}>
                    {val == null ? `~${guess}%` : `${val}%`}
                  </b>
                  <button className={`skip ${val === 0 ? 'on' : ''}`} onClick={() => setHypo(a.id, 0)} title="What if I skip it?">
                    Skip
                  </button>
                </div>
              )
            })}
          </div>

          <div className="gsec absences">
            <div>
              <h4>Missed classes</h4>
              <span className="muted small">
                {at.maxAbsences} free, then −{at.penalty}% each
              </span>
            </div>
            <div className="stepper">
              <button className="icon-btn boxed" onClick={() => onWhatIf({ hypo, absences: Math.max(0, absences - 1) })} aria-label="Fewer absences">
                <Minus size={14} />
              </button>
              <span className={absences > at.maxAbsences ? 'warn' : ''}>{absences}</span>
              <button className="icon-btn boxed" onClick={() => onWhatIf({ hypo, absences: absences + 1 })} aria-label="More absences">
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div className={`result ${changed ? 'changed' : ''}`}>
            {sim ? (
              <span>
                {changed ? 'With these what-ifs you’d finish at' : 'If you keep this pace you’ll finish around'} <b>{sim.projected.toFixed(1)}%</b>{' '}
                <em>{letter(sim.projected)}</em>
                {sim.penalty > 0 && <span className="warn small"> (includes −{sim.penalty}% for absences)</span>}
              </span>
            ) : (
              <span className="muted">Move a slider or enter a score to see a projection.</span>
            )}
            {changed && (
              <button className="link-btn" onClick={() => onWhatIf(null)}>
                <RotateCcw size={13} /> Reset
              </button>
            )}
          </div>

          {graded.length > 0 && (
            <details className="graded">
              <summary>Graded so far ({graded.length})</summary>
              {graded.map((a) => (
                <div key={a.id} className="grow-item">
                  <span className="gi-title">{a.title}</span>
                  <span className="muted small">{fmtMonthDay(parseISO(a.date))}</span>
                  <b>{((a.score / a.points) * 100).toFixed(0)}%</b>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  )
}
