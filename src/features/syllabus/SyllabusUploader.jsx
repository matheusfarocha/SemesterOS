import { useState } from 'react'
import { Upload, Check, Loader2, Trash2, FileText } from 'lucide-react'
import { useStore } from '@/store/store'
import { extractSyllabus, toCourseRows, SAMPLE_SYLLABUS } from './syllabus.service'
import { parseISO, fmtShort } from '@/shared/lib/dates'
import { TypeIcon, Snow } from '@/shared/ui/ui'

const STEPS = ['Parsing document (CORTEX.PARSE_DOCUMENT)', 'Extracting deadlines & policies (CORTEX.COMPLETE)', 'Writing to COURSES / ASSESSMENTS']

/** Upload → extract → review → save. Rendered inline on the Syllabus page. */
export default function SyllabusUploader({ onDone }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState(null)
  const [step, setStep] = useState(-1)
  const [ex, setEx] = useState(null)
  const [drag, setDrag] = useState(false)

  const readFile = async (file) => {
    if (!file) return
    setFileName(file.name)
    if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')) setText(await file.text())
    else setText(`[${file.name}]\nPDF/DOCX parsing runs in Snowflake (PARSE_DOCUMENT). For the prototype, paste the syllabus text here or load the sample.`)
  }

  const run = async () => {
    const res = await extractSyllabus(text, setStep)
    setEx(res)
    setStep(3)
  }

  const save = () => {
    const { course, assessments } = toCourseRows(ex, state.courses.length)
    dispatch({ type: 'addCourse', course, assessments, syllabus: text })
    onDone?.(course)
    setStep(-1)
    setText('')
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
            <span className="muted">{fileName ?? 'PDF, DOCX or text'}</span>
          </div>
          <textarea className="syllabus-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste syllabus text" />
          <div className="modal-actions">
            <button
              className="btn ghost"
              onClick={() => {
                setText(SAMPLE_SYLLABUS)
                setFileName('PHYS2101_syllabus.pdf')
              }}
            >
              <FileText size={16} /> Load sample syllabus
            </button>
            <span className="grow" />
            <Snow>Cortex AI</Snow>
            <button className="btn primary" disabled={!text.trim()} onClick={run}>
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

          <h4>Deadlines found ({ex.assessments.length})</h4>
          <ul className="found">
            {ex.assessments.map((a, i) => (
              <li key={i}>
                <span className={`type-pill t-${a.type}`}>
                  <TypeIcon type={a.type} />
                </span>
                <span className="grow">{a.title}</span>
                <span className="muted">{a.categoryName ?? 'Uncategorized'}</span>
                <span>{fmtShort(parseISO(a.date))}</span>
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
              Add course to semester
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
