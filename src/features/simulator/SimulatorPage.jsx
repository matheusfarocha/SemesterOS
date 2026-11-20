import { useMemo, useState } from 'react'
import { RotateCcw, Wand2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { simulateSemester, optimizeHours, recommendedHours } from './simulator.service'
import { PageHeader, Snow } from '@/shared/ui/ui'
import './simulator.css'

// Bars span 50–100% so small what-if changes are visible
const barPct = (p) => `${Math.max(0, Math.min(100, (p - 50) * 2))}%`

export default function SimulatorPage() {
  const { state } = useStore()
  const defaults = () => ({
    hours: Object.fromEntries(state.courses.map((c) => [c.id, recommendedHours(c)])),
    absences: Object.fromEntries(state.courses.map((c) => [c.id, c.attendance.absences])),
    skipped: [],
  })
  const [sc, setSc] = useState(defaults)
  const [budget, setBudget] = useState(state.user.weeklyStudyHours)

  const baseline = useMemo(() => simulateSemester(state, defaults()), [state])
  const result = useMemo(() => simulateSemester(state, sc), [state, sc])
  const used = Object.values(sc.hours).reduce((s, h) => s + h, 0)

  const setH = (id, v) => setSc({ ...sc, hours: { ...sc.hours, [id]: v } })
  const setA = (id, v) => setSc({ ...sc, absences: { ...sc.absences, [id]: Math.max(0, v) } })
  const toggleSkip = (id) => setSc({ ...sc, skipped: sc.skipped.includes(id) ? sc.skipped.filter((x) => x !== id) : [...sc.skipped, id] })

  const delta = result.gpa - baseline.gpa

  return (
    <>
      <PageHeader title="Semester Simulator" sub="What if you studied more, skipped an assignment, or missed class?" />
      <div className="sim-top">
        <div className="card stat">
          <span>Baseline GPA</span>
          <strong>{baseline.gpa?.toFixed(2)}</strong>
        </div>
        <div className="card stat accent-box">
          <span>Simulated GPA</span>
          <strong>
            {result.gpa?.toFixed(2)}
            {Math.abs(delta) >= 0.005 && <small className={delta > 0 ? 'ok' : 'warn'}> {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)}</small>}
          </strong>
        </div>
        <div className={`card stat ${used > budget ? 'over' : ''}`}>
          <span>Study hours / week</span>
          <strong>
            {used}
            <small> / </small>
            <input className="budget" type="number" min="1" value={budget} onChange={(e) => setBudget(Number(e.target.value) || 1)} />
          </strong>
        </div>
        <div className="sim-actions">
          <button className="btn primary" onClick={() => setSc({ ...sc, hours: optimizeHours(state, sc, budget) })}>
            <Wand2 size={16} /> Optimize my hours
          </button>
          <button className="btn ghost" onClick={() => setSc(defaults())}>
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>

      <div className="sim-rows">
        {state.courses.map((c) => {
          const r = result.perCourse[c.id]
          const b = baseline.perCourse[c.id]
          const upcoming = state.assessments
            .filter((a) => a.courseId === c.id && a.score == null && a.categoryId && a.points > 0)
            .sort((x, y) => (x.date ?? '9999').localeCompare(y.date ?? '9999'))
          const hours = sc.hours[c.id] ?? recommendedHours(c)
          const absences = sc.absences[c.id] ?? c.attendance.absences
          return (
            <section key={c.id} className="card sim-row" style={{ '--c': c.color }}>
              <div className="sim-name">
                <i className="cdot" style={{ background: c.color }} />
                <div>
                  <strong>{c.short}</strong>
                  {c.credits != null && <span className="muted">{c.credits} cr</span>}
                </div>
              </div>

              <label className="sim-ctrl">
                <span>
                  Study <b>{hours}h</b>/wk <span className="muted">(rec. {recommendedHours(c)})</span>
                </span>
                <input type="range" min="0" max="20" value={hours} onChange={(e) => setH(c.id, Number(e.target.value))} />
              </label>

              <div className="sim-ctrl">
                <span>
                  Absences {c.attendance.maxAbsences != null && <span className="muted">(max {c.attendance.maxAbsences})</span>}
                </span>
                <div className="stepper">
                  <button className="icon-btn boxed" onClick={() => setA(c.id, absences - 1)}>−</button>
                  <span className={c.attendance.maxAbsences != null && absences > c.attendance.maxAbsences ? 'warn' : ''}>{absences}</span>
                  <button className="icon-btn boxed" onClick={() => setA(c.id, absences + 1)}>+</button>
                </div>
              </div>

              <div className="sim-skip">
                <span className="muted small">Miss an assignment?</span>
                <div className="skip-chips">
                  {upcoming.map((a) => (
                    <button key={a.id} className={sc.skipped.includes(a.id) ? 'skipped' : ''} onClick={() => toggleSkip(a.id)} title="Toggle: assume you score 0">
                      {a.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sim-result">
                <div className="bar">
                  <span className="bar-base" style={{ width: barPct(b.projected) }} />
                  <span className="bar-sim" style={{ width: barPct(r.projected) }} />
                  {c.target != null && <span className="bar-target" style={{ left: barPct(c.target) }} title={`Goal ${c.target}%`} />}
                </div>
                <div className="sim-grade">
                  <strong>{r.projected == null ? '—' : `${r.projected.toFixed(1)}%`}</strong>
                  {!c.uploadId && <em>{r.letter}</em>}
                  {Math.abs(r.projected - b.projected) >= 0.05 && (
                    <small className={r.projected > b.projected ? 'ok' : 'warn'}>
                      {r.projected > b.projected ? '+' : ''}
                      {(r.projected - b.projected).toFixed(1)}
                    </small>
                  )}
                </div>
              </div>
            </section>
          )
        })}
      </div>
      <p className="muted small">
        Model: expected score on remaining work rises with study hours (diminishing returns), relative to your current average. Missed items score 0; extra absences apply each syllabus's penalty.
      </p>
      <Snow>Snowpark Python · SIMULATE_SEMESTER()</Snow>
    </>
  )
}
