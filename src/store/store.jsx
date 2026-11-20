import { createContext, useContext, useEffect, useReducer } from 'react'
import { seed, seedSyllabi } from '@/store/seed'

const KEY = 'semesteros:v1'
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
    case 'updateCourse':
      return { ...state, courses: state.courses.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) }
    case 'addCourse':
      return {
        ...state,
        courses: [...state.courses, action.course],
        assessments: [...state.assessments, ...action.assessments],
        syllabi: { ...state.syllabi, [action.course.id]: action.syllabus },
      }
    case 'removeCourse':
      return {
        ...state,
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
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {}
  }, [state])
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
