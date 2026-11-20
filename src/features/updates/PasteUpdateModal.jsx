import { useState } from 'react'
import { Loader2, Megaphone } from 'lucide-react'
import { useStore } from '@/store/store'
import { Modal, Snow } from '@/shared/ui/ui'
import { analyzeUpdate, detectCourse, describe, toAction, UPDATE_SAMPLES } from './updates.service'
import './updates.css'

/** Paste a professor announcement → review detected changes → apply to the calendar. */
export default function PasteUpdateModal({ onClose }) {
  const { state, dispatch } = useStore()
  const [text, setText] = useState('')
  const [courseId, setCourseId] = useState(null) // null = auto-detect
  const [busy, setBusy] = useState(false)
  const [changes, setChanges] = useState(null)
  const [picked, setPicked] = useState({})
  const [done, setDone] = useState(null)

  const detected = detectCourse(text, state.courses)
  const course = state.courses.find((c) => c.id === courseId) ?? detected

  const analyze = async () => {
    setBusy(true)
    const found = await analyzeUpdate(text, course, state.assessments)
    setChanges(found)
    setPicked(Object.fromEntries(found.map((_, i) => [i, true])))
    setBusy(false)
  }

  const apply = () => {
    const chosen = changes.filter((_, i) => picked[i])
    dispatch(toAction(chosen, course))
    setDone(chosen.length)
  }

  if (done != null) {
    return (
      <Modal title="Paste an update" onClose={onClose}>
        <p className="flash">
          Applied {done} change{done === 1 ? '' : 's'} to {course.code}. Your calendar, reminders and workload are updated.
        </p>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Paste an update" onClose={onClose} wide>
      <p className="muted">
        Syllabi don't have everything. Paste an announcement, email or course-site post and we'll find what changed.
      </p>

      {!changes && (
        <>
          <textarea
            className="syllabus-text"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'e.g. "Homework 4 is now due Thursday, Dec 3 instead of Nov 24. Quiz 7 will be Tuesday, Dec 1."'}
          />
          <div className="upd-row">
            <span className="muted small">Try:</span>
            {UPDATE_SAMPLES.map((s) => (
              <button key={s.label} className="btn ghost small" onClick={() => setText(s.text)}>
                <Megaphone size={13} /> {s.label}
              </button>
            ))}
            <span className="grow" />
            <label className="upd-course">
              Course
              <select value={course?.id ?? ''} onChange={(e) => setCourseId(e.target.value)}>
                {!course && <option value="">Choose…</option>}
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}
                    {!courseId && c.id === detected?.id ? ' (detected)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {text && !detected && !courseId && <p className="warn small">Couldn't tell which course this is about. Pick one, or upload its syllabus first.</p>}
          <div className="modal-actions">
            <Snow>Cortex COMPLETE</Snow>
            <span className="grow" />
            <button className="btn primary" disabled={!text.trim() || !course || busy} onClick={analyze}>
              {busy ? <Loader2 size={16} className="spin" /> : null} Find changes
            </button>
          </div>
        </>
      )}

      {changes && (
        <>
          <blockquote className="upd-quote">{text}</blockquote>
          {!changes.length && <p className="muted">No date changes found for {course.code}. Nothing to apply.</p>}
          <ul className="upd-changes">
            {changes.map((c, i) => {
              const d = describe(c)
              return (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={!!picked[i]} onChange={() => setPicked({ ...picked, [i]: !picked[i] })} />
                    <span className={`upd-kind k-${c.kind}`}>{d.label}</span>
                    <span className="grow">
                      {d.text}
                      {d.note && <span className="muted small"> · {d.note}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setChanges(null)}>
              Back
            </button>
            <span className="grow" />
            <button className="btn primary" disabled={!Object.values(picked).some(Boolean)} onClick={apply}>
              Apply {Object.values(picked).filter(Boolean).length} change{Object.values(picked).filter(Boolean).length === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
