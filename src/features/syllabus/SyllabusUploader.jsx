import { useState } from 'react'
import { Upload, Check, Loader2, Trash2, FileText, AlertTriangle, ShieldAlert, CalendarDays, XOctagon, Scale } from 'lucide-react'
import { useStore } from '@/store/store'
import { extractSyllabus, extractSyllabusPdf, toCourseRows, SAMPLES } from './syllabus.service'
import { parseISO, fmtShort } from '@/shared/lib/dates'
import { TypeIcon, Snow } from '@/shared/ui/ui'

const TEXT_STEPS = ['Parsing document', 'Extracting deadlines & policies', 'Resolving week numbers to dates']
const PDF_STEPS = ['Uploading PDF', 'Claude is reading the syllabus (structured extraction)', 'Resolving week numbers to dates']

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })

// Syllabus text kept for the assistant's search when the source was a PDF
const factsText = (ex) => [ex.attendance.policy, ex.latePolicy, ex.aiPolicy, ...(ex.rules ?? [])].filter(Boolean).join(' ')

/** Upload → extract → review → save. Rendered inline on the Syllabus page. */
export default function SyllabusUploader({ onDone }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState(null)
  const [step, setStep] = useState(-1)
  const [ex, setEx] = useState(null)
  const [drag, setDrag] = useState(false)
  const [pdf, setPdf] = useState(null) // base64 of an uploaded PDF → AI path
  const [error, setError] = useState(null)
  const STEPS = pdf ? PDF_STEPS : TEXT_STEPS

  const readFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    setError(null)
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      setPdf(await toBase64(file))
      setText('')
    } else {
      setPdf(null)
      setText(await file.text())
    }
  }

  const run = async () => {
    setError(null)
    try {
      const res = pdf ? await extractSyllabusPdf(pdf, setStep) : await extractSyllabus(text, setStep)
      setEx(res)
      setStep(3)
    } catch (e) {
      setError(e.message)
      setStep(-1)
    }
  }

  const save = () => {
    const { course, assessments, events } = toCourseRows(ex, state.courses.length)
    dispatch({ type: 'addCourse', course, assessments, events, syllabus: text || factsText(ex) })
    onDone?.(course)
    setStep(-1)
    setText('')
    setPdf(null)
    setFileName(null)
    setEx(null)
  }

  const total = ex?.categories.reduce((s, c) => s + Number(c.weight || 0), 0)

  return (
    <section className="card uploader">
      {step === -1 && (
        <>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              readFile(e.dataTransfer.files[0])
            }}
          >
            <Upload size={28} />
            <p>
              Drop a syllabus here or{' '}
              <label className="link-btn">
                browse
                <input type="file" hidden accept=".txt,.md,.pdf,.docx" onChange={(e) => readFile(e.target.files[0])} />
              </label>
            </p>
            <span className="muted">{pdf ? `${fileName} · ready for AI extraction` : fileName ?? 'PDF (read by Claude) or text'}</span>
          </div>
          {!pdf && <textarea className="syllabus-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste syllabus text" />}
          {error && <p className="upload-error">{error}</p>}
          <div className="modal-actions">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                className="btn ghost"
                onClick={() => {
                  setPdf(null)
                  setError(null)
                  setText(s.text)
                  setFileName(s.file)
                }}
              >
                <FileText size={16} /> {s.label}
              </button>
            ))}
            <span className="grow" />
            {pdf && (
              <button className="btn ghost" onClick={() => { setPdf(null); setFileName(null) }}>
                Remove PDF
              </button>
            )}
            <Snow>{pdf ? 'Claude API · PDF' : 'Text parser'}</Snow>
            <button className="btn primary" disabled={!pdf && !text.trim()} onClick={run}>
              Extract with AI
            </button>
          </div>
        </>
      )}

      {step >= 0 && step < 3 && (
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? 'done' : i === step ? 'active' : ''}>
              {i < step ? <Check size={16} /> : i === step ? <Loader2 size={16} className="spin" /> : <span className="pending" />}
              {s}
            </li>
          ))}
        </ol>
      )}

      {step === 3 && ex && (
        <div className="review">
          <p className="muted">
            Review what was extracted · confidence <strong className="accent">{Math.round(ex.confidence * 100)}%</strong>
          </p>
          {ex.problems.length > 0 && (
            <div className="problems">
              <strong>
                <XOctagon size={16} /> We couldn't read parts of this syllabus
              </strong>
              <ul>
                {ex.problems.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <span className="small">With Snowflake Cortex, layout-aware parsing handles these. For now, fix them below or add them later.</span>
            </div>
          )}
          {ex.ambiguities.length > 0 && (
            <div className="ambiguities">
              <strong>
                <AlertTriangle size={16} /> {ex.ambiguities.length} thing{ex.ambiguities.length > 1 ? 's' : ''} to double-check
              </strong>
              <ul>
                {ex.ambiguities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="review-grid">
            <label className="field">
              <span>Course code</span>
              <input value={ex.code} onChange={(e) => setEx({ ...ex, code: e.target.value })} />
            </label>
            <label className="field">
              <span>Course name</span>
              <input value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Instructor</span>
              <input value={ex.instructor} onChange={(e) => setEx({ ...ex, instructor: e.target.value })} />
            </label>
            <label className="field">
              <span>Office hours</span>
              <input value={ex.officeHours} onChange={(e) => setEx({ ...ex, officeHours: e.target.value })} />
            </label>
          </div>

          <h4>
            Grading policy <span className={total === 100 ? 'ok' : 'warn'}>{total}%</span>
          </h4>
          <div className="weights">
            {ex.categories.map((c, i) => (
              <div key={i} className="weight-row">
                <input
                  value={c.name}
                  onChange={(e) => setEx({ ...ex, categories: ex.categories.map((k, j) => (j === i ? { ...k, name: e.target.value } : k)) })}
                />
                <input
                  type="number"
                  value={c.weight}
                  onChange={(e) => setEx({ ...ex, categories: ex.categories.map((k, j) => (j === i ? { ...k, weight: Number(e.target.value) } : k)) })}
                />
                <span>%</span>
              </div>
            ))}
          </div>

          <h4>Attendance</h4>
          <p className="policy">
            {ex.attendance.policy} <span className="muted">(max {ex.attendance.maxAbsences} absences, −{ex.attendance.penalty}% each after)</span>
          </p>
          <h4>Late work</h4>
          <p className="policy">{ex.latePolicy}</p>
          {ex.aiPolicy && (
            <>
              <h4>
                <ShieldAlert size={16} /> AI policy
              </h4>
              <p className="policy ai-policy">{ex.aiPolicy}</p>
            </>
          )}
          {ex.rules.length > 0 && (
            <>
              <h4>
                <Scale size={16} /> Rules that can cost you points ({ex.rules.length})
              </h4>
              <ul className="rules-list">
                {ex.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {ex.events.length > 0 && (
            <>
              <h4>
                <CalendarDays size={16} /> Important dates ({ex.events.length})
              </h4>
              <div className="event-chips">
                {ex.events.map((e) => (
                  <span key={e.date + e.title} className={`cal-event k-${e.kind}`}>
                    {fmtShort(parseISO(e.date)).slice(5)} · {e.title}
                  </span>
                ))}
              </div>
            </>
          )}

          <h4>Deadlines found ({ex.assessments.length})</h4>
          <ul className="found">
            {ex.assessments.map((a, i) => (
              <li key={i}>
                <span className={`type-pill t-${a.type}`}>
                  <TypeIcon type={a.type} />
                </span>
                <span className="grow">
                  {a.title}
                  {a.source && <span className="muted small found-src">{a.source}</span>}
                </span>
                <span className="muted">{a.categoryName ?? 'Uncategorized'}</span>
                {a.undated ? (
                  <span className="est-tag">no date yet</span>
                ) : (
                  <span>
                    {fmtShort(parseISO(a.date))}
                    {a.estimated && <span className="est-tag">estimated</span>}
                  </span>
                )}
                <button className="icon-btn tiny" onClick={() => setEx({ ...ex, assessments: ex.assessments.filter((_, j) => j !== i) })} aria-label="Remove">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setStep(-1)}>
              Back
            </button>
            <span className="grow" />
            <button className="btn primary" onClick={save}>
              {ex.problems.length ? 'Add anyway' : 'Add course to semester'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
