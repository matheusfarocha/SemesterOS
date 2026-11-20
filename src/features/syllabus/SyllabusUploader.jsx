import { useState } from 'react'
import { Upload, Loader2, Trash2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { extractSyllabus, confirmSyllabus, toStoreRows } from './syllabus.service'
import { TypeIcon, Snow } from '@/shared/ui/ui'

const COURSE_FIELDS = {
  code: 'Course code', name: 'Course name', professor: 'Instructor', email: 'Email', contact: 'Other contact details',
  semester: 'Semester', meetings: 'Class meetings', office_hours: 'Office hours', credits: 'Credits',
  description: 'Course description',
}
const POLICY_FIELDS = {
  attendance: 'Attendance', late_work: 'Late work', absence_limit: 'Absence limit', absence_penalty: 'Penalty per absence (%)',
  extra_credit: 'Extra credit', dropped_assignments: 'Dropped assignments', other: 'Other academic rules',
}
const EVENT_TYPES = {
  assignment: 'Assignment', quiz: 'Quiz', exam: 'Exam', project: 'Project',
  presentation: 'Presentation', important_date: 'Important date',
}
const NUMBER_FIELDS = new Set(['credits', 'absence_limit', 'absence_penalty'])

export default function SyllabusUploader({ onDone }) {
  const { dispatch } = useStore()
  const [file, setFile] = useState(null)
  const [uploadId, setUploadId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)

  function chooseFile(selected) {
    if (!selected) return
    setError('')
    setFile(null)
    if (!/\.pdf$/i.test(selected.name) || !selected.size) {
      setError('Choose a PDF file.')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('PDFs must be 10 MB or smaller.')
      return
    }
    setFile(selected)
  }

  async function extract() {
    setError('')
    setStatus('Extracting syllabus with Gemini and staging the PDF in Snowflake…')
    try {
      const result = await extractSyllabus(file)
      setUploadId(result.upload_id)
      setDraft(result.syllabus)
    } catch (error) {
      setError(error.message)
    } finally {
      setStatus('')
    }
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    setStatus('Saving confirmed syllabus to Snowflake…')
    try {
      const confirmed = await confirmSyllabus(uploadId, draft)
      const rows = toStoreRows(confirmed)
      dispatch({ type: 'syncSyllabi', rows: [rows] })
      onDone?.(rows.course)
      setDraft(null)
      setUploadId(null)
      setFile(null)
    } catch (error) {
      setError(error.message)
    } finally {
      setStatus('')
    }
  }

  const editObject = (key, field, value) => setDraft((current) => ({
    ...current, [key]: { ...current[key], [field]: value },
  }))
  const editRow = (key, index, patch) => setDraft((current) => ({
    ...current, [key]: current[key].map((row, i) => i === index ? { ...row, ...patch } : row),
  }))
  const removeRow = (key, index) => setDraft((current) => ({
    ...current, [key]: current[key].filter((_, i) => i !== index),
  }))
  const total = draft?.grading.reduce((sum, item) => sum + (item.weight ?? 0), 0)
  const knownWeights = draft?.grading.length && draft.grading.every((item) => item.weight != null)

  return (
    <section className="card uploader">
      {error && <p className="warn" role="alert">{error}</p>}
      {status && <p className="syllabus-status" role="status"><Loader2 size={16} className="spin" /> {status}</p>}

      {!status && !draft && (
        <>
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              chooseFile(e.dataTransfer.files[0])
            }}
          >
            <Upload size={28} />
            <p>Drop a syllabus here or <label className="link-btn">
              browse
              <input type="file" className="syllabus-file" accept=".pdf,application/pdf" aria-label="Browse for a syllabus PDF"
                onChange={(e) => { chooseFile(e.target.files[0]); e.target.value = '' }} />
            </label></p>
            <span className="muted">{file?.name ?? 'PDF up to 10 MB'}</span>
          </div>
          <div className="modal-actions">
            <span className="grow" />
            <Snow>Snowflake storage · Gemini extraction</Snow>
            <button className="btn primary" disabled={!file} onClick={extract}>Extract with AI</button>
          </div>
        </>
      )}

      {draft && (
        <form onSubmit={save}>
          <fieldset className="review" disabled={Boolean(status)}>
            <p className="muted">Review the extracted details before adding this course. Fill in exact dates where you can verify them.</p>
            <div className="review-grid">
              {Object.entries(COURSE_FIELDS).map(([key, title]) => (
                <ReviewField key={key} name={key} label={title} value={draft.course[key]}
                  multiline={key === 'description'} onChange={(value) => editObject('course', key, value)} />
              ))}
            </div>

            <h4>Grading categories {knownWeights ? <span className={total === 100 ? 'ok' : 'warn'}>{Number(total.toFixed(2))}%</span> : null}</h4>
            <div className="weights">
              {!draft.grading.length && <p className="muted small">No grading categories found.</p>}
              {draft.grading.map((grade, i) => (
                <div key={i} className="weight-row">
                  <input aria-label={`Category ${i + 1}`} required value={grade.category ?? ''}
                    onChange={(e) => editRow('grading', i, { category: e.target.value })} />
                  <input aria-label={`Weight for category ${i + 1}`} type="number" min="0" max="100" step="any" value={grade.weight ?? ''}
                    onChange={(e) => editRow('grading', i, { weight: e.target.value === '' ? null : e.target.valueAsNumber })} />
                  <span>%</span>
                  <button type="button" className="icon-btn tiny" aria-label={`Remove grading category ${i + 1}`} onClick={() => removeRow('grading', i)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <h4>Course policies</h4>
            <div className="review-grid">
              {Object.entries(POLICY_FIELDS).map(([key, title]) => (
                <ReviewField key={key} name={key} label={title} value={draft.policies[key]}
                  multiline={!NUMBER_FIELDS.has(key)} onChange={(value) => editObject('policies', key, value)} />
              ))}
            </div>
            {draft.policies.letter_grades.length > 0 && (
              <>
                <h4>Letter grades</h4>
                <div className="review-grid">
                  {draft.policies.letter_grades.map((grade, i) => (
                    <div className="field" key={i}>
                      <span>{grade.letter}</span>
                      <input required aria-label={`Threshold for ${grade.letter}`} value={grade.threshold}
                        onChange={(e) => editObject('policies', 'letter_grades', draft.policies.letter_grades.map(
                          (item, j) => j === i ? { ...item, threshold: e.target.value } : item,
                        ))} />
                    </div>
                  ))}
                </div>
              </>
            )}

            <h4>Calendar events ({draft.events.length})</h4>
            <datalist id="syllabus-grading-categories">
              {draft.grading.map((grade, i) => <option key={i} value={grade.category} />)}
            </datalist>
            <ul className="found">
              {draft.events.map((item, i) => (
                <li key={i}>
                  <div className="event-review-head">
                    <span className={`type-pill t-${item.type}`}><TypeIcon type={item.type} /></span>
                    <input className="grow" aria-label={`Event ${i + 1} title`} required value={item.title}
                      onChange={(e) => editRow('events', i, { title: e.target.value })} />
                    <button type="button" className="icon-btn tiny" onClick={() => removeRow('events', i)} aria-label={`Remove event ${i + 1}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="review-grid">
                    <label className="field">
                      <span>Type</span>
                      <select value={item.type ?? ''} onChange={(e) => editRow('events', i, { type: e.target.value || null })}>
                        <option value="">Unknown</option>
                        {Object.entries(EVENT_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Grading category</span>
                      <input list="syllabus-grading-categories" value={item.grading_category ?? ''}
                        onChange={(e) => editRow('events', i, { grading_category: e.target.value || null })} />
                    </label>
                    <label className="field">
                      <span>Maximum points</span>
                      <input type="number" step="any" value={item.points ?? ''}
                        onChange={(e) => editRow('events', i, { points: e.target.value === '' ? null : e.target.valueAsNumber })} />
                    </label>
                    <label className="field">
                      <span>Date</span>
                      <input type="date" value={item.date ?? ''} onChange={(e) => editRow('events', i, { date: e.target.value || null })} />
                      {item.date_text && <small className="muted">{item.date_text}</small>}
                    </label>
                    <label className="field">
                      <span>Time</span>
                      <input type="time" value={item.time?.slice(0, 5) ?? ''} onChange={(e) => editRow('events', i, { time: e.target.value || null })} />
                      {item.time_text && <small className="muted">{item.time_text}</small>}
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Back</button>
              <span className="grow" />
              <button type="submit" className="btn primary" disabled={!draft.course.name?.trim() && !draft.course.code?.trim()}>
                Add course to semester
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}

function ReviewField({ name, label, value, onChange, multiline }) {
  const numeric = NUMBER_FIELDS.has(name)
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      ) : (
        <input type={numeric ? 'number' : 'text'} value={value ?? ''} min={numeric ? 0 : undefined}
          max={numeric ? (name === 'absence_limit' ? 365 : 100) : undefined}
          step={numeric ? (name === 'absence_limit' ? 1 : 'any') : undefined}
          onChange={(e) => onChange(e.target.value === '' ? null : numeric ? e.target.valueAsNumber : e.target.value)} />
      )}
    </label>
  )
}
