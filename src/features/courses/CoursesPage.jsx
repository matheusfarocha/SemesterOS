import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Upload, Megaphone } from 'lucide-react'
import { useStore } from '@/store/store'
import { courseStatus, courseGrade, semesterGPA } from '@/features/grades/grades.service'
import { TODAY, parseISO, daysBetween } from '@/shared/lib/dates'
import { PageHeader, Snow } from '@/shared/ui/ui'
import PasteUpdateModal from '@/features/updates/PasteUpdateModal'
import { courseUnknowns } from './unknowns.service'
import CourseStrip from './CourseStrip'
import CourseDetails from './CourseDetails'
import './courses.css'

export default function CoursesPage() {
  const { state } = useStore()
  const [pasting, setPasting] = useState(false)
  const [activeId, setActiveId] = useState(state.courses[0]?.id)
  const active = state.courses.find((c) => c.id === activeId) ?? state.courses[0]

  // One summary per course, shared by the strip and the details panel
  const summaries = useMemo(() => {
    const out = {}
    for (const c of state.courses) {
      const { unknowns, pct } = courseUnknowns(c, state.assessments)
      const next = state.assessments
        .filter((a) => a.courseId === c.id && a.date && a.score == null && !a.undated && daysBetween(TODAY, parseISO(a.date)) >= 0)
        .sort((a, b) => a.date.localeCompare(b.date))[0]
      out[c.id] = { ...courseStatus(c, state.assessments), unknowns, knownPct: pct, next }
    }
    return out
  }, [state.courses, state.assessments])

  // Only courses with real grades count toward GPA. No made-up numbers.
  const graded = state.courses.filter((c) => courseGrade(c, state.assessments).current != null)
  const gpa = semesterGPA(graded, Object.fromEntries(graded.map((c) => [c.id, courseGrade(c, state.assessments).projected])))

  return (
    <>
      <PageHeader title="Courses" sub={gpa == null ? 'Select a course to see its details.' : `Semester GPA ${gpa.toFixed(2)} on your current pace.`}>
        <div className="head-actions">
          <button className="btn ghost" onClick={() => setPasting(true)}>
            <Megaphone size={16} /> Paste an update
          </button>
          <Link className="btn primary" to="/syllabus">
            <Upload size={16} /> Upload syllabus
          </Link>
        </div>
      </PageHeader>

      {state.courses.length ? (
        <>
          <CourseStrip courses={state.courses} summaries={summaries} active={active.id} onSelect={setActiveId} />
          <CourseDetails course={active} summary={summaries[active.id]} assessments={state.assessments} />
        </>
      ) : (
        <div className="card empty">
          <p>No courses yet.</p>
          <Link className="btn primary" to="/syllabus">
            <Upload size={16} /> Upload your first syllabus
          </Link>
        </div>
      )}

      <Snow>SQL + Tables · COURSES, GRADE_CATEGORIES, ASSESSMENTS</Snow>
      {pasting && <PasteUpdateModal onClose={() => setPasting(false)} />}
    </>
  )
}
