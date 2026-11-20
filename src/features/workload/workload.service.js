// Workload / difficulty model.
//
// Score unit = "grade points at stake": how many percentage points of a course's final grade
// fall in a window, adjusted for credits and risk, with prep spread over the days before each due date.
//
//   load(item) = gradeImpact × creditFactor × riskBoost × (estimated ? 0.8 : 1)
//   spread over prepDays(item) days before the due date, ramping up toward the deadline
//
// Weeks are rated relative to the student's own semester (percentiles), not fixed cutoffs.
// Production: same math as a SQL view (V_DAILY_LOAD) over ASSESSMENTS + V_COURSE_GRADES.

import { parseISO, addDays, iso, startOfWeek } from '@/shared/lib/dates'
import { courseGrade } from '@/features/grades/grades.service'

export const PREP_DAYS = { exam: 7, project: 7, assignment: 4, quiz: 2 }
export const FINAL_PREP_DAYS = 10
export const ESTIMATE_DISCOUNT = 0.8
const PERCENTILES = { moderate: 0.4, heavy: 0.75 }

export const prepDays = (a) => (a.type === 'exam' && /final/i.test(a.title) ? FINAL_PREP_DAYS : PREP_DAYS[a.type] ?? 3)

/** Percentage points of the course's final grade this item is worth. */
export function gradeImpact(a, course, assessments) {
  const cat = course.categories.find((c) => c.id === a.categoryId)
  if (!cat) return 0
  const inCat = assessments.filter((x) => x.categoryId === cat.id)
  const pts = inCat.reduce((s, x) => s + x.points, 0) || 1
  // If the syllabus promises more items than we know about yet, each known one is worth less
  const coverage = inCat.length / Math.max(inCat.length, cat.expectedCount ?? 0)
  return cat.weight * (a.points / pts) * coverage
}

/** Below-goal courses weigh more: up to +50% when 10+ points under target. */
export function riskBoost(course, assessments) {
  const g = courseGrade(course, assessments)
  if (g.current == null) return 1 // no grades yet: no evidence of risk
  const p = g.projected
  return 1 + Math.min(0.5, Math.max(0, (course.target - p) / 20))
}

export function buildWorkload({ courses, assessments }) {
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]))
  const avgCredits = courses.reduce((s, c) => s + c.credits, 0) / (courses.length || 1)
  const factors = Object.fromEntries(courses.map((c) => [c.id, { credit: c.credits / avgCredits, risk: riskBoost(c, assessments) }]))

  const items = {}
  const daily = {}
  for (const a of assessments) {
    const course = byId[a.courseId]
    if (!course || a.undated) continue
    const f = factors[course.id]
    const impact = gradeImpact(a, course, assessments)
    const load = impact * f.credit * f.risk * (a.estimated ? ESTIMATE_DISCOUNT : 1)
    const n = prepDays(a)
    const due = parseISO(a.date)
    const ramp = (n * (n + 1)) / 2
    items[a.id] = { ...a, course, impact, load, prep: n, factors: f, prepStart: iso(addDays(due, -(n - 1))) }
    for (let k = 0; k < n; k++) {
      const day = iso(addDays(due, -(n - 1 - k)))
      ;(daily[day] ??= []).push({ id: a.id, load: (load * (k + 1)) / ramp })
    }
  }

  const wl = { items, daily }
  wl.thresholds = thresholds(wl)
  return wl
}

/** Sum load over [start, start+days). Returns score, level and the items driving it. */
export function windowLoad(wl, start, days = 7) {
  const byItem = {}
  let score = 0
  for (let i = 0; i < days; i++) {
    for (const e of wl.daily[iso(addDays(start, i))] ?? []) {
      score += e.load
      byItem[e.id] = (byItem[e.id] ?? 0) + e.load
    }
  }
  const contributors = Object.entries(byItem)
    .map(([id, load]) => ({ item: wl.items[id], load }))
    .sort((a, b) => b.load - a.load)
  return { score, level: levelOf(score, wl.thresholds), contributors }
}

export const weekLoad = (wl, weekStart) => windowLoad(wl, weekStart, 7)

function thresholds(wl) {
  const days = Object.keys(wl.daily).sort()
  if (!days.length) return { moderate: 1, heavy: 2 }
  const scores = []
  for (let ws = startOfWeek(parseISO(days[0])); iso(ws) <= days[days.length - 1]; ws = addDays(ws, 7)) {
    const s = windowLoad({ ...wl, thresholds: { moderate: 0, heavy: 0 } }, ws).score
    if (s > 0.05) scores.push(s)
  }
  scores.sort((a, b) => a - b)
  const q = (p) => scores[Math.floor(p * (scores.length - 1))] ?? 0
  return { moderate: q(PERCENTILES.moderate), heavy: q(PERCENTILES.heavy) }
}

export function levelOf(score, th) {
  if (score <= 0.05) return 'none'
  if (score >= th.heavy) return 'heavy'
  if (score >= th.moderate) return 'moderate'
  return 'light'
}

/**
 * "Where should I spend my time this week?" Splits the next `days` of load by course.
 * Replaces study-hour sliders with a recommendation the student can act on.
 */
export function focusThisWeek(wl, from, days = 7) {
  const info = windowLoad(wl, from, days)
  const byCourse = {}
  for (const { item, load } of info.contributors) {
    const e = (byCourse[item.courseId] ??= { course: item.course, load: 0, items: [] })
    e.load += load
    e.items.push(item)
  }
  const total = Object.values(byCourse).reduce((s, e) => s + e.load, 0) || 1
  return Object.values(byCourse)
    .map((e) => ({ ...e, share: e.load / total, top: e.items.sort((a, b) => b.load - a.load)[0] }))
    .sort((a, b) => b.load - a.load)
}

export const LEVEL_LABEL = { heavy: 'Heavy', moderate: 'Moderate', light: 'Light', none: 'Clear' }

/**
 * One-line explanation of a week: level, score, and what's driving it.
 * `prepFor` is set when the biggest driver is due AFTER this week (the week is heavy because of prep).
 */
export function weekSummary(wl, weekStart) {
  const info = weekLoad(wl, weekStart)
  const top = info.contributors[0]?.item ?? null
  const weekEnd = iso(addDays(weekStart, 6))
  const prepFor = top && top.date > weekEnd ? top : null
  return { ...info, top, prepFor, label: LEVEL_LABEL[info.level] }
}
