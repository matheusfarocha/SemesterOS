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
  // Uploaded (Gemini) items may have no exact date or no points; only point-based items can be scored or simulated
  const scorable = items.filter((a) => a.points > 0 && a.type !== 'important_date')
  const awaiting = scorable.filter((a) => a.score == null && !a.undated && a.date && daysBetween(TODAY, parseISO(a.date)) < 0)
  const upcoming = scorable.filter((a) => a.score == null && !awaiting.includes(a)).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
  const unscorable = items.filter((a) => !(a.points > 0) && a.type !== 'important_date')
  // Uploaded courses use the syllabus's own letter scale, so don't show our default letters
  const showLetters = !course.uploadId
  const showLetter = (p) => (showLetters ? letter(p) : '')
  const policies = course.policies ?? {}
  const graded = items.filter((a) => a.score != null)
  const guess = Math.round(g.current ?? 85)

  const setHypo = (id, val) => onWhatIf({ hypo: { ...hypo, [id]: val }, absences })
  const targets = course.target == null || LETTER_TARGETS.some(([, t]) => t === course.target) ? LETTER_TARGETS : [...LETTER_TARGETS, [`${course.target}%`, course.target]]
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
          <span>{showLetter(g.current)}</span>
        </div>
        <span className={`chip-status s-${v.tone}`}>{v.label}</span>
        <p className="gcard-text">{v.text}</p>
        <ChevronDown size={18} className="gcard-chev" />
      </button>

      {open && (
        <div className="gcard-body">
          <label className="goal">
            Goal
            <select value={course.target ?? ''} onChange={(e) => dispatch({ type: 'updateCourse', id: course.id, patch: { target: e.target.value === '' ? null : Number(e.target.value) } })}>
              {course.target == null && <option value="">Choose a goal…</option>}
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
                  <span className="muted small">{a.date ? fmtMonthDay(parseISO(a.date)) : a.dateText ?? 'no date'}</span>
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
                      {a.undated || !a.date ? a.dateText ?? 'no date yet' : fmtMonthDay(parseISO(a.date))}
                      {gradeImpact(a, course, assessments) > 0 && ` · worth ${gradeImpact(a, course, assessments).toFixed(0)}% of grade`}
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

          {at.maxAbsences == null || at.penalty == null || at.graded === false ? (
            <div className="gsec absences">
              <div>
                <h4>Missed classes</h4>
                <span className="muted small">The syllabus doesn't set an absence penalty, so missed classes don't change this projection.</span>
              </div>
            </div>
          ) : (
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
          )}

          <div className={`result ${changed ? 'changed' : ''}`}>
            {sim ? (
              <span>
                {changed ? 'With these what-ifs you’d finish at' : 'If you keep this pace you’ll finish around'} <b>{sim.projected.toFixed(1)}%</b>{' '}
                <em>{showLetter(sim.projected)}</em>
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

          {unscorable.length > 0 && (
            <p className="muted small">
              {unscorable.length} item{unscorable.length > 1 ? 's have' : ' has'} no point value in the syllabus, so {unscorable.length > 1 ? "they aren't" : "it isn't"} included in what-ifs.
            </p>
          )}

          {course.uploadId && (policies.letter_grades?.length > 0 || policies.extra_credit || policies.dropped_assignments) && (
            <div className="gsec syllabus-policies">
              {policies.letter_grades?.length > 0 && (
                <div>
                  <h4>Letter grades (from the syllabus)</h4>
                  <p className="muted small">{policies.letter_grades.map(({ letter: l, threshold }) => `${l} ${threshold}`).join(' · ')}</p>
                </div>
              )}
              {policies.extra_credit && (
                <div>
                  <h4>Extra credit</h4>
                  <p className="muted small">{policies.extra_credit}</p>
                </div>
              )}
              {policies.dropped_assignments && (
                <div>
                  <h4>Dropped work</h4>
                  <p className="muted small">{policies.dropped_assignments}</p>
                </div>
              )}
            </div>
          )}

          {graded.length > 0 && (
            <details className="graded">
              <summary>Graded so far ({graded.length})</summary>
              {graded.map((a) => (
                <div key={a.id} className="grow-item">
                  <span className="gi-title">{a.title}</span>
                  <span className="muted small">{a.date ? fmtMonthDay(parseISO(a.date)) : a.dateText}</span>
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
