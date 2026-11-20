import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '@/store/store'
import { TODAY, parseISO, daysBetween, fmtShort } from '@/shared/lib/dates'
import GradeTools from '@/features/grades/GradeTools'

// Plain-text topic for each rule, shown as a quiet secondary label
const RULE_TOPICS = [
  [/\bAI\b|LLM|ChatGPT|generative/i, 'AI use'],
  [/late|extension|deadline|close at/i, 'Late work'],
  [/absen|attend|miss|critique/i, 'Attendance'],
  [/extra credit|bonus/i, 'Extra credit'],
  [/exam|calculator|make-?up|quiz/i, 'Exams'],
  [/regrade|interview|proposal|source|format/i, 'Submissions'],
]
const ruleTopic = (r) => RULE_TOPICS.find(([re]) => re.test(r))?.[1] ?? 'General'

const UNKNOWN_ACTION = { date: 'Confirm on calendar', policy: 'Ask instructor', count: 'Watch for announcement' }

/** Everything about ONE course, split into tabs so only one topic is on screen at a time. */
export default function CourseDetails({ course: c, summary: s, assessments }) {
  const { dispatch } = useStore()
  const [tab, setTab] = useState('overview')
  const at = c.attendance
  const left = at.maxAbsences == null ? null : at.maxAbsences - at.absences
  // Uploaded (Gemini) courses carry late-work and other rules in their policies; show them with the rules
  const p = c.policies ?? {}
  const letters = p.letter_grades?.length ? `Letter grades: ${p.letter_grades.map(({ letter, threshold }) => `${letter} ${threshold}`).join(' · ')}` : null
  const rules = [...(c.rules ?? []), ...(c.uploadId ? [c.latePolicy, p.other, p.extra_credit, p.dropped_assignments, letters].filter(Boolean) : [])]
  const setAbsences = (n) => dispatch({ type: 'updateCourse', id: c.id, patch: { attendance: { ...at, absences: Math.max(0, n) } } })

  const upcoming = assessments
    .filter((a) => a.courseId === c.id && a.date && a.score == null && !a.undated && daysBetween(TODAY, parseISO(a.date)) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const tabs = [
    ['overview', 'Overview'],
    ['grading', 'Grades'],
    ['attendance', 'Attendance'],
    ['rules', 'Rules', rules.length || null],
    ['confirm', 'To confirm', s.unknowns.length || null],
  ]

  return (
    <section className="card details" style={{ '--c': c.color }}>
      <header className="details-head">
        <div>
          <h2>{c.name}</h2>
          <span className="muted">{[c.code, c.semester, c.credits != null && `${c.credits} credits`].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="details-actions">
          <button
            className="btn ghost small danger"
            onClick={() => confirm(c.uploadId ? `Hide ${c.code} in this browser?` : `Remove ${c.code}?`) && dispatch({ type: 'removeCourse', id: c.id })}
          >
            {c.uploadId ? 'Hide' : 'Remove'}
          </button>
        </div>
      </header>

      <nav className="tabs-line" role="tablist">
        {tabs.map(([id, label, count]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {count != null && <span className="count-pill">{count}</span>}
          </button>
        ))}
      </nav>

      <div className="tab-panel" role="tabpanel">
        {tab === 'overview' && (
          <div className="two-col">
            <dl className="props">
              <div>
                <dt>Instructor</dt>
                <dd>{c.instructor ?? '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}</dd>
              </div>
              {c.contact && (
                <div>
                  <dt>Contact</dt>
                  <dd>{c.contact}</dd>
                </div>
              )}
              <div>
                <dt>Class times</dt>
                <dd>{c.schedule ?? '—'}</dd>
              </div>
              <div>
                <dt>Office hours</dt>
                <dd>{c.officeHours ?? '—'}</dd>
              </div>
              <div>
                <dt>Goal</dt>
                <dd>{c.target == null ? <button className="link-btn" onClick={() => setTab('grading')}>Set a goal</button> : `${c.target}%`}</dd>
              </div>
            </dl>
            {c.description && <p className="muted course-desc">{c.description}</p>}
            <div>
              <h4 className="sub-h">Coming up</h4>
              {upcoming.length ? (
                <table className="tbl">
                  <tbody>
                    {upcoming.map((a) => (
                      <tr key={a.id}>
                        <td className="muted nowrap">{fmtShort(parseISO(a.date))}</td>
                        <td>
                          {a.title}
                          {a.estimated && <span className="muted"> (estimated)</span>}
                        </td>
                        <td className="muted cap right">{a.type?.replace('_', ' ') ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">Nothing upcoming.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'grading' && (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="right">Weight</th>
                  <th className="right">Graded</th>
                  <th className="right">Your average</th>
                </tr>
              </thead>
              <tbody>
                {s.g.categories.map((k) => (
                  <tr key={k.id}>
                    <td>{k.name}</td>
                    <td className="right num">{k.weight == null ? '—' : `${k.weight}%`}</td>
                    <td className="right num muted">
                      {k.items.filter((a) => a.score != null).length} of {k.items.length}
                    </td>
                    <td className={`right num ${k.avg != null && c.target != null && k.avg < c.target ? 'tone-warn' : ''}`}>{k.avg == null ? '—' : `${k.avg.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Overall</td>
                  <td className="right num">100%</td>
                  <td />
                  <td className="right num">{s.g.current == null ? '—' : `${s.g.current.toFixed(1)}%`}</td>
                </tr>
              </tfoot>
            </table>
            <p className="note">{s.text}</p>
            <GradeTools key={c.id} course={c} assessments={assessments} />
          </>
        )}

        {tab === 'attendance' && (at.graded === false || at.maxAbsences == null) && (
          <div className="two-col">
            <dl className="props">
              <div>
                <dt>Counts toward grade</dt>
                <dd>{at.graded === false ? 'No' : 'Not stated in the syllabus'}</dd>
              </div>
            </dl>
            <div>
              <h4 className="sub-h">From the syllabus</h4>
              <blockquote className="quote">{at.policy ?? 'No attendance policy recorded.'}</blockquote>
            </div>
          </div>
        )}

        {tab === 'attendance' && at.graded !== false && at.maxAbsences != null && (
          <div className="two-col">
            <dl className="props">
              <div>
                <dt>Absences</dt>
                <dd>
                  <span className={left <= 0 ? 'tone-bad' : ''}>{at.absences}</span> of {at.maxAbsences} free
                  <span className="inline-actions">
                    <button className="btn ghost tiny" onClick={() => setAbsences(at.absences - 1)} aria-label="Remove absence">
                      −
                    </button>
                    <button className="btn ghost tiny" onClick={() => setAbsences(at.absences + 1)} aria-label="Log absence">
                      + Log
                    </button>
                  </span>
                </dd>
              </div>
              <div>
                <dt>After the limit</dt>
                <dd>{at.penalty != null ? `−${at.penalty}% of final grade per class` : 'Not stated'}</dd>
              </div>
              <div>
                <dt>Next absence</dt>
                <dd className={left > 0 ? '' : 'tone-bad'}>{left > 0 ? `Free (${left} left)` : at.penalty != null ? `Costs ${at.penalty}%` : 'Over the limit'}</dd>
              </div>
            </dl>
            <div>
              <h4 className="sub-h">From the syllabus</h4>
              <blockquote className="quote">{at.policy}</blockquote>
            </div>
          </div>
        )}

        {tab === 'rules' &&
          (rules.length ? (
            <ul className="rows">
              {rules.map((r) => (
                <li key={r}>
                  <span>{r}</span>
                  <span className="muted nowrap">{ruleTopic(r)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No point-costing rules found in the syllabus.</p>
          ))}

        {tab === 'confirm' && (
          <>
            <p className="muted progress-line">
              {s.knownPct}% of course details confirmed
              <span className="thin-bar">
                <span style={{ width: `${s.knownPct}%` }} />
              </span>
            </p>
            {s.unknowns.length ? (
              <ul className="rows">
                {s.unknowns.map((u) => (
                  <li key={u.text}>
                    <span className="check" aria-hidden />
                    <span className="grow">{u.text}</span>
                    {u.noteId ? (
                      <button className="btn ghost tiny" onClick={() => dispatch({ type: 'resolveNote', courseId: c.id, noteId: u.noteId })}>
                        Mark resolved
                      </button>
                    ) : (
                      <span className="muted nowrap small">{UNKNOWN_ACTION[u.kind] ?? ''}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Everything is confirmed.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
