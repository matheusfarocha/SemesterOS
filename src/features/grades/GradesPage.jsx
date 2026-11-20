import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useStore } from '@/store/store'
import { courseGrade, requiredScore, letter, semesterGPA, LETTER_TARGETS } from './grades.service'
import { parseISO, fmtMonthDay } from '@/shared/lib/dates'
import { PageHeader, Snow, TypeIcon } from '@/shared/ui/ui'
import './grades.css'

export default function GradesPage() {
  return (
    <>
      <PageHeader title="Grade Simulator" sub="Know where you stand, and what it takes." />
      <Overview />
      <GradeSimulator />
    </>
  )
}

function Overview() {
  const { state } = useStore()
  const grades = Object.fromEntries(state.courses.map((c) => [c.id, courseGrade(c, state.assessments).current]))
  const gpa = semesterGPA(state.courses, grades)
  return (
    <div className="overview">
      <div className="card stat">
        <span>Current GPA</span>
        <strong>{gpa?.toFixed(2) ?? '—'}</strong>
      </div>
      {state.courses.map((c) => (
        <div key={c.id} className="card stat" style={{ '--c': c.color }}>
          <span>
            <i className="cdot" style={{ background: c.color }} />
            {c.short}
          </span>
          <strong>
            {grades[c.id]?.toFixed(1) ?? '—'}
            <small>% {letter(grades[c.id])}</small>
          </strong>
        </div>
      ))}
    </div>
  )
}

function GradeSimulator() {
  const { state } = useStore()
  const [courseId, setCourseId] = useState(state.courses[0]?.id)
  const [hypo, setHypo] = useState({})
  const [target, setTarget] = useState(LETTER_TARGETS[0])
  const course = state.courses.find((c) => c.id === courseId) ?? state.courses[0]
  if (!course) return <p className="muted">Add a course first.</p>

  const real = courseGrade(course, state.assessments)
  const sim = courseGrade(course, state.assessments, { hypo })
  const need = requiredScore(course, state.assessments, target[1])

  return (
    <>
      <div className="course-tabs">
        {state.courses.map((c) => (
          <button
            key={c.id}
            className={c.id === course.id ? 'active' : ''}
            style={{ '--c': c.color }}
            onClick={() => {
              setCourseId(c.id)
              setHypo({})
            }}
          >
            {c.code}
          </button>
        ))}
      </div>

      <div className="grade-layout">
        <section className="card pad-lg">
          {sim.categories.map((cat) => (
            <div key={cat.id} className="cat">
              <div className="cat-head">
                <strong>{cat.name}</strong>
                <span className="muted">{cat.weight}% of grade</span>
                <span className="grow" />
                <span>{cat.projected != null ? `${cat.projected.toFixed(1)}%` : '—'}</span>
              </div>
              {cat.items.map((a) => (
                <div key={a.id} className={`item ${a.score == null ? 'open' : ''}`}>
                  <span className={`type-pill t-${a.type}`}>
                    <TypeIcon type={a.type} />
                  </span>
                  <span className="item-title">{a.title}</span>
                  <span className="muted">{fmtMonthDay(parseISO(a.date))}</span>
                  {a.score != null ? (
                    <span className="item-score">
                      {a.score}/{a.points} <b>{((a.score / a.points) * 100).toFixed(0)}%</b>
                    </span>
                  ) : (
                    <span className="item-score">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={hypo[a.id] ?? Math.round(cat.avg ?? real.current ?? 85)}
                        onChange={(e) => setHypo({ ...hypo, [a.id]: Number(e.target.value) })}
                      />
                      <b className={hypo[a.id] != null ? 'accent' : 'muted'}>{hypo[a.id] ?? Math.round(cat.avg ?? real.current ?? 85)}%</b>
                    </span>
                  )}
                </div>
              ))}
              {!cat.items.length && <p className="muted small">No items yet.</p>}
            </div>
          ))}
        </section>

        <aside className="card pad-lg sim-summary">
          <div className="big-grade">
            <span>Current</span>
            <strong>{real.current?.toFixed(1) ?? '—'}%</strong>
            <em>{letter(real.current)}</em>
          </div>
          <div className="big-grade accent-box">
            <span>Projected with your what-ifs</span>
            <strong>{sim.projected?.toFixed(1) ?? '—'}%</strong>
            <em>{letter(sim.projected)}</em>
          </div>
          {sim.penalty > 0 && <p className="warn small">Includes −{sim.penalty}% attendance penalty.</p>}
          <button className="btn ghost small" onClick={() => setHypo({})} disabled={!Object.keys(hypo).length}>
            <RotateCcw size={14} /> Reset what-ifs
          </button>

          <h4>What do I need?</h4>
          <div className="letters">
            {LETTER_TARGETS.map((t) => (
              <button key={t[0]} className={t[0] === target[0] ? 'active' : ''} onClick={() => setTarget(t)}>
                {t[0]}
              </button>
            ))}
          </div>
          <p className="need">
            {need == null
              ? 'Nothing left to grade.'
              : need > 100
                ? <>A {target[0]} is out of reach. You'd need <b>{need.toFixed(0)}%</b> on everything left.</>
                : need <= 0
                  ? <>{target[0]} is locked in. 🎉</>
                  : <>Average <b className="accent">{need.toFixed(1)}%</b> on the {real.remaining.length} remaining item(s) to finish with {target[0]} ({target[1]}%+).</>}
          </p>
          <Snow>SQL · V_COURSE_GRADES</Snow>
        </aside>
      </div>
    </>
  )
}
