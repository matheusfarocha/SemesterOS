import { useStore } from '@/store/store'
import { TODAY, parseISO, fmtShort, daysBetween } from '@/shared/lib/dates'
import { LETTER_TARGETS } from './grades.service'
import './grades.css'

/** Goal + editable scores for one course, under the Courses > Grades table. */
export default function GradeTools({ course, assessments }) {
  const { dispatch } = useStore()
  // Anything already graded, or past due with points to score
  const items = assessments
    .filter((a) => a.courseId === course.id && a.points > 0 && (a.score != null || (a.date && !a.undated && daysBetween(TODAY, parseISO(a.date)) < 0)))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const targets = course.target == null || LETTER_TARGETS.some(([, t]) => t === course.target) ? LETTER_TARGETS : [...LETTER_TARGETS, [`${course.target}%`, course.target]]

  const save = (a, raw) => {
    const score = raw === '' ? null : Math.max(0, Number(raw))
    if (score !== a.score) dispatch({ type: 'setScore', id: a.id, score })
  }

  return (
    <div className="gtools">
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

      <h4 className="sub-h">Your scores</h4>
      {items.length ? (
        <table className="tbl">
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="muted nowrap">{a.date ? fmtShort(parseISO(a.date)) : a.dateText ?? ''}</td>
                <td>{a.title}</td>
                <td className="right nowrap">
                  <input
                    key={a.score ?? 'empty'}
                    className="score-in"
                    type="number"
                    min="0"
                    defaultValue={a.score ?? ''}
                    placeholder="—"
                    aria-label={`Score for ${a.title}`}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    onBlur={(e) => save(a, e.target.value)}
                  />
                  <span className="muted"> / {a.points}</span>
                </td>
                <td className="right num muted pct">{a.score == null ? 'not entered' : `${((a.score / a.points) * 100).toFixed(0)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">Nothing graded yet.</p>
      )}
    </div>
  )
}
