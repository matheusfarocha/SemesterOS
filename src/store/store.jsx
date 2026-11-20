import { createContext, useContext, useEffect, useReducer, useState } from 'react'
import { seed, seedSyllabi } from '@/store/seed'
import { loadConfirmedSyllabi, toStoreRows } from '@/features/syllabus/syllabus.service'

const KEY = 'semesteros:v3' // bump when the data shape changes
const initial = () => ({ ...structuredClone(seed), syllabi: { ...seedSyllabi } })

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return initial()
}

function reducer(state, action) {
  switch (action.type) {
    case 'toggleTask':
      return { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t)) }
    case 'addTask':
      return { ...state, tasks: [...state.tasks, { id: `t${Date.now()}`, done: false, ...action.task }] }
    case 'removeTask':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== action.id) }
    case 'setScore':
      return { ...state, assessments: state.assessments.map((a) => (a.id === action.id ? { ...a, score: action.score } : a)) }
    case 'confirmDate':
      return {
        ...state,
        assessments: state.assessments.map((a) => (a.id === action.id ? { ...a, date: action.date, estimated: false, windowEnd: undefined } : a)),
      }
    case 'resolveNote':
      return {
        ...state,
        courses: state.courses.map((c) =>
          c.id === action.courseId ? { ...c, notes: (c.notes ?? []).map((n) => (n.id === action.noteId ? { ...n, resolved: true } : n)) } : c,
        ),
      }
    // Pasted updates: add new items, move/confirm existing ones, drop cancelled ones
    case 'applyUpdate':
      return {
        ...state,
        assessments: [
          ...state.assessments
            .filter((a) => !action.remove.includes(a.id))
            .map((a) => (action.dates[a.id] ? { ...a, date: action.dates[a.id], estimated: false, windowEnd: undefined, source: action.source } : a)),
          ...action.add,
        ],
        events: [...state.events, ...action.events],
      }
    case 'updateCourse':
      return { ...state, courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) }
    case 'addCourse':
      return {
        ...state,
        courses: [...state.courses, action.course],
        assessments: [...state.assessments, ...action.assessments],
        syllabi: { ...state.syllabi, [action.course.id]: action.syllabus },
        // Term dates repeat across syllabi, so de-dupe: one "closed" label per day, otherwise date + title
        events: [
          ...state.events,
          ...(action.events ?? []).filter((e) => !state.events.some((x) => x.date === e.date && (x.title === e.title || (x.kind === 'closed' && e.kind === 'closed')))),
        ],
      }
    // Confirmed syllabi from the backend (Gemini + Snowflake). Local-only edits survive a re-sync.
    case 'syncSyllabi': {
      const rows = action.rows.filter(({ course }) => !state.hiddenCourseIds?.includes(course.id))
      const courseIds = new Set(rows.map(({ course }) => course.id))
      const previousCourses = new Map(state.courses.map((course) => [course.id, course]))
      const previousScores = new Map(state.assessments.map((event) => [event.id, event.score]))
      return {
        ...state,
        courses: [
          ...state.courses.filter((course) => !courseIds.has(course.id)),
          ...rows.map(({ course }) => {
            const prev = previousCourses.get(course.id)
            return {
              ...course,
              target: prev?.target ?? course.target,
              notes: prev?.notes ?? course.notes,
              attendance: { ...course.attendance, absences: prev?.attendance.absences ?? 0 },
            }
          }),
        ],
        assessments: [
          ...state.assessments.filter((event) => !courseIds.has(event.courseId)),
          ...rows.flatMap(({ assessments }) => assessments.map((event) => ({
            ...event, score: previousScores.get(event.id) ?? null,
          }))),
        ],
      }
    }
    case 'removeCourse':
      return {
        ...state,
        hiddenCourseIds: [...(state.hiddenCourseIds ?? []), action.id],
        courses: state.courses.filter((c) => c.id !== action.id),
        assessments: state.assessments.filter((a) => a.courseId !== action.id),
        tasks: state.tasks.filter((t) => t.courseId !== action.id),
      }
    case 'setUser':
      return { ...state, user: { ...state.user, ...action.patch } }
    case 'reset':
      return initial()
    default:
      return state
  }
}

const Ctx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)
  const [syncError, setSyncError] = useState('')
  const [syncAttempt, setSyncAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loadConfirmedSyllabi(controller.signal)
      .then((rows) => {
        dispatch({ type: 'syncSyllabi', rows: rows.map(toStoreRows) })
        setSyncError('')
      })
      .catch((error) => {
        if (!controller.signal.aborted) setSyncError(error.message)
      })
    return () => controller.abort()
  }, [syncAttempt])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {}
  }, [state])
  return (
    <Ctx.Provider value={{ state, dispatch, syncError, refreshSyllabi: () => setSyncAttempt((attempt) => attempt + 1) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useStore = () => useContext(Ctx)
