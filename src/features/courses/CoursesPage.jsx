import { Link } from 'react-router-dom'
import { Upload, Mail, Clock, MapPin, Minus, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { courseGrade, letter } from '@/features/grades/grades.service'
import { TODAY, parseISO, daysBetween, fmtShort, relDays } from '@/shared/lib/dates'
import { PageHeader, Snow, TypeIcon } from '@/shared/ui/ui'
import './courses.css'

export default function CoursesPage() {
  const { state, dispatch } = useStore()

  return (
    <>
      <PageHeader title="Courses" sub="Everything from your syllabi, in one place.">
        <Link className="btn primary" to="/syllabus">
          <Upload size={16} /> Upload syllabus
        </Link>
      </PageHeader>

      <div className="course-grid">
        {state.courses.map((c) => {
          const g = courseGrade(c, state.assessments)
          const next = state.assessments
            .filter((a) => a.courseId === c.id && a.date && a.score == null && daysBetween(TODAY, parseISO(a.date)) >= 0)
            .sort((a, b) => a.date.localeCompare(b.date))[0]
          const at = c.attendance
          return (
            <article key={c.id} className="card course" style={{ '--c': c.color }}>
              <header>
                <div>
                  <span className="code">{c.code}</span>
                  <h3>{c.name}</h3>
                </div>
                <div className="grade-big">
                  <strong>{g.current == null ? '—' : `${g.current.toFixed(1)}%`}</strong>
                  {!c.uploadId && <span>{letter(g.current)}</span>}
                </div>
              </header>

              <ul className="meta">
                {(c.instructor || c.email || c.contact) && <li><Mail size={14} />{[c.instructor, c.email, c.contact].filter(Boolean).join(' · ')}</li>}
                {(c.semester || c.schedule) && <li><Clock size={14} />{[c.semester, c.schedule].filter(Boolean).join(' · ')}</li>}
                {c.officeHours && <li><MapPin size={14} />Office hours: {c.officeHours}</li>}
              </ul>

              {c.description && <p className="muted">{c.description}</p>}
              {c.categories.some((k) => k.weight > 0) && <div className="weights-bar">
                {c.categories.filter((k) => k.weight > 0).map((k) => (
                  <span key={k.id} style={{ flex: k.weight }} title={`${k.name} ${k.weight}%`}>
                    {k.name} <b>{k.weight}%</b>
                  </span>
                ))}
              </div>}

              <div className="attendance">
                <div>
                  <strong>Attendance</strong>
                  <p className="muted">{at.policy ?? 'No policy recorded.'}</p>
                </div>
                <div className="stepper">
                  <button className="icon-btn boxed" onClick={() => dispatch({ type: 'updateCourse', id: c.id, patch: { attendance: { ...at, absences: Math.max(0, at.absences - 1) } } })} aria-label="Remove absence">
                    <Minus size={14} />
                  </button>
                  <span className={at.maxAbsences != null && at.absences >= at.maxAbsences ? 'warn' : ''}>
                    {at.absences}{at.maxAbsences != null && `/${at.maxAbsences}`}
                  </span>
                  <button className="icon-btn boxed" onClick={() => dispatch({ type: 'updateCourse', id: c.id, patch: { attendance: { ...at, absences: at.absences + 1 } } })} aria-label="Add absence">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              {c.latePolicy && <div><strong>Late work</strong><p className="muted">{c.latePolicy}</p></div>}
              {c.policies?.other && <div><strong>Other academic rules</strong><p className="muted">{c.policies.other}</p></div>}

              <footer>
                {next ? (
                  <span className="next">
                    <TypeIcon type={next.type} /> Next: <b>{next.title}</b> · {fmtShort(parseISO(next.date))} ({relDays(daysBetween(TODAY, parseISO(next.date)))})
                  </span>
                ) : (
                  <span className="muted">No upcoming deadlines</span>
                )}
                <button className="icon-btn tiny" title={c.uploadId ? 'Hide course in this browser' : 'Remove course'}
                  onClick={() => confirm(c.uploadId ? `Hide ${c.code} in this browser?` : `Remove ${c.code}?`) && dispatch({ type: 'removeCourse', id: c.id })}>
                  <Trash2 size={14} />
                </button>
              </footer>
            </article>
          )
        })}
      </div>
      <Snow>Snowflake</Snow>

    </>
  )
}
