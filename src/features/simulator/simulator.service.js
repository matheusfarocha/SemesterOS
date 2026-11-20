// Semester Simulator.
// Production: a Snowpark Python stored procedure (SIMULATE_SEMESTER) so the effort model can
// grow into something fitted on real data. The model here is deliberately simple:
//   expected % on remaining work = current avg + effort(hours) - effort(recommended hours)
//   effort(h) has diminishing returns; skipped items score 0; absences apply course penalties.

import { courseGrade, gradePoints, letter, semesterGPA } from '@/features/grades/grades.service'

const effort = (h) => 18 * (1 - Math.exp(-h / 5))
export const recommendedHours = (course) => course.credits * 2

export function simulateCourse(course, assessments, { hours, skipped = [], absences }) {
  const base = courseGrade(course, assessments).current ?? 85
  const h = hours ?? recommendedHours(course)
  const expected = Math.max(0, Math.min(100, base + effort(h) - effort(recommendedHours(course))))
  const hypo = {}
  for (const a of assessments) {
    if (a.courseId === course.id && a.score == null) hypo[a.id] = skipped.includes(a.id) ? 0 : expected
  }
  const g = courseGrade(course, assessments, { hypo, absences })
  return { expected, projected: g.projected, letter: letter(g.projected), points: gradePoints(g.projected), penalty: g.penalty }
}

export function simulateSemester({ courses, assessments }, scenario) {
  const perCourse = {}
  for (const c of courses) {
    perCourse[c.id] = simulateCourse(c, assessments, {
      hours: scenario.hours[c.id],
      skipped: scenario.skipped,
      absences: scenario.absences[c.id],
    })
  }
  const gpa = semesterGPA(courses, Object.fromEntries(Object.entries(perCourse).map(([k, v]) => [k, v.projected])))
  return { perCourse, gpa }
}

/** Greedy hour-by-hour allocation that maximises GPA (ties broken by raw % gain). */
export function optimizeHours(state, scenario, budget) {
  const hours = Object.fromEntries(state.courses.map((c) => [c.id, 0]))
  for (let i = 0; i < budget; i++) {
    let best = null
    for (const c of state.courses) {
      const opts = { skipped: scenario.skipped, absences: scenario.absences[c.id] }
      const now = simulateCourse(c, state.assessments, { ...opts, hours: hours[c.id] })
      const next = simulateCourse(c, state.assessments, { ...opts, hours: hours[c.id] + 1 })
      const gain = (next.points - now.points) * c.credits * 100 + (next.projected - now.projected)
      if (!best || gain > best.gain) best = { id: c.id, gain }
    }
    hours[best.id] += 1
  }
  return hours
}
