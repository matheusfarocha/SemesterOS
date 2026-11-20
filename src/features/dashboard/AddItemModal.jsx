import { useState } from 'react'
import { useStore } from '@/store/store'
import { Modal } from '@/shared/ui/ui'
import { categoryFor } from '@/features/syllabus/syllabus.service'

const TYPES = ['assignment', 'quiz', 'exam', 'project']

/** "New item" from the calendar: add a deadline the syllabus didn't have (a quiz that was just announced, etc.). */
export default function AddItemModal({ defaultDate, onClose }) {
  const { state, dispatch } = useStore()
  const [courseId, setCourseId] = useState(state.courses[0]?.id)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('quiz')
  const [date, setDate] = useState(defaultDate)
  const course = state.courses.find((c) => c.id === courseId)

  const save = (e) => {
    e.preventDefault()
    if (!course || !title.trim()) return
    const cat =
      categoryFor(title, course.categories) ??
      course.categories.find((c) => (type === 'exam' ? /exam|midterm|final/i : new RegExp(type === 'quiz' ? 'quiz' : 'assign|homework|problem|project', 'i')).test(c.name)) ??
      course.categories[0]
    const label = title.toLowerCase().startsWith(course.short.toLowerCase()) ? title.trim() : `${course.short} ${title.trim()}`
    dispatch({
      type: 'applyUpdate',
      dates: {},
      remove: [],
      events: [],
      add: [{ id: `${course.id}-m${Date.now().toString(36)}`, courseId: course.id, categoryId: cat.id, title: label, type, date, points: 100, score: null, source: 'Added manually' }],
    })
    onClose()
  }

  return (
    <Modal title="New item" onClose={onClose}>
      <form className="add-item" onSubmit={save}>
        <label className="field">
          <span>Course</span>
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {state.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>What is it?</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Quiz 7" />
        </label>
        <div className="add-item-row">
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0].toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!title.trim()}>
            Add to calendar
          </button>
        </div>
      </form>
    </Modal>
  )
}
