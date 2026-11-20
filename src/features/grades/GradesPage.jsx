import { useState } from 'react'
import { useStore } from '@/store/store'
import { PageHeader, Snow } from '@/shared/ui/ui'
import { courseGrade, semesterGPA } from './grades.service'
import CourseGradeCard from './CourseGradeCard'
import './grades.css'

/**
 * One page, three questions: where do I stand, what do I need, what if?
 * What-ifs are kept per course in page state and roll up into the semester GPA.
 */
export default function GradesPage() {
  const { state } = useStore()
  const [open, setOpen] = useState(state.courses[0]?.id ?? null)
  const [whatIfs, setWhatIfs] = useState({}) // { [courseId]: { hypo, absences } }

  // Only courses with real grades count toward GPA. No made-up numbers.
  const graded = state.courses.filter((c) => courseGrade(c, state.assessments).current != null)
  const now = semesterGPA(graded, Object.fromEntries(graded.map((c) => [c.id, courseGrade(c, state.assessments).projected])))
  const withWhatIfs = semesterGPA(
    graded,
    Object.fromEntries(graded.map((c) => [c.id, courseGrade(c, state.assessments, { hypo: whatIfs[c.id]?.hypo, absences: whatIfs[c.id]?.absences }).projected])),
  )
  const anyWhatIf = Object.keys(whatIfs).length > 0
  const delta = (withWhatIfs ?? 0) - (now ?? 0)
  const ungraded = state.courses.length - graded.length

  return (
    <>
      <PageHeader title="Grades" sub="Where you stand, what you need, and what-ifs." />

      <div className="gpa-bar card">
        <div>
          <span className="muted">Semester GPA (on your current pace)</span>
          <strong>{now?.toFixed(2) ?? '—'}</strong>
        </div>
        {anyWhatIf && (
          <div className="gpa-whatif">
            <span className="muted">With your what-ifs</span>
            <strong>
              {withWhatIfs?.toFixed(2) ?? '—'}
              {Math.abs(delta) >= 0.005 && <small className={delta > 0 ? 'ok' : 'warn'}> {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}</small>}
            </strong>
          </div>
        )}
        <span className="grow" />
        {ungraded > 0 && <span className="muted small">{ungraded} course{ungraded > 1 ? 's' : ''} without grades not counted</span>}
        {anyWhatIf && (
          <button className="btn ghost small" onClick={() => setWhatIfs({})}>
            Reset all what-ifs
          </button>
        )}
      </div>

      <div className="gcards">
        {state.courses.map((c) => (
          <CourseGradeCard
            key={c.id}
            course={c}
            assessments={state.assessments}
            open={open === c.id}
            onToggle={() => setOpen(open === c.id ? null : c.id)}
            whatIf={whatIfs[c.id]}
            onWhatIf={(w) =>
              setWhatIfs((all) => {
                const next = { ...all }
                if (w) next[c.id] = w
                else delete next[c.id]
                return next
              })
            }
          />
        ))}
        {!state.courses.length && <p className="muted">Add a course to get started.</p>}
      </div>
      <Snow>SQL · V_COURSE_GRADES</Snow>
    </>
  )
}
