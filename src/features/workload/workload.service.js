// Workload / difficulty model.
//
// Workload uses grade impact where available and a type-based estimate otherwise.
//
//   load(item) = gradeImpact × creditFactor × riskBoost × (estimated ? 0.8 : 1)
//   spread over prepDays(item) days before the due date, ramping up toward the deadline
//
// Weekly ratings use semester percentiles with minimum cutoffs for sparse schedules.
// Production: same math as a SQL view (V_DAILY_LOAD) over ASSESSMENTS + V_COURSE_GRADES.

import { parseISO, addDays, iso, startOfWeek } from '@/shared/lib/dates'
import { courseGrade } from '@/features/grades/grades.service'

export const PREP_DAYS = { exam: 7, project: 7, assignment: 4, quiz: 2 }
export const FINAL_PREP_DAYS = 10
export const ESTIMATE_DISCOUNT = 0.8
const PERCENTILES = { moderate: 0.4, heavy: 0.75 }
const MIN_THRESHOLDS = { moderate: 4, heavy: 10 }
const ESTIMATED_LOAD = { exam: 6, project: 5, presentation: 4, assignment: 2, quiz: 1 }

export const prepDays = (a) => (a.type === 'exam' && /final/i.test(a.title) ? FINAL_PREP_DAYS : PREP_DAYS[a.type] ?? 3)

/** Percentage points of the course's final grade this item is worth. */
function knownGradeImpact(a, course, assessments) {
  const cat = course.categories.find((c) => c.id === a.categoryId)
  if (cat?.weight === 0) return 0
  if (!cat || cat.weight == null || !(a.points > 0)) return null
  const allInCat = assessments.filter((x) => x.categoryId === cat.id)
  // Same rule as courseGrade: if any item's points are unknown, the category's split is unknown
  if (allInCat.some((x) => x.points == null)) return null
  const inCat = allInCat.filter((x) => x.points > 0)
  const pts = inCat.reduce((s, x) => s + x.points, 0) || 1
  // If the syllabus promises more items than we know about yet, each known one is worth less
  const coverage = inCat.length / Math.max(inCat.length, cat.expectedCount ?? 0)
  return cat.weight * (a.points / pts) * coverage
}

export function gradeImpact(a, course, assessments) {
  return knownGradeImpact(a, course, assessments) ?? 0
}

/** Below-goal courses weigh more: up to +50% when 10+ points under target. */
export function riskBoost(course, assessments) {
  const g = courseGrade(course, assessments)
  if (g.current == null || course.target == null || g.projected == null) return 1 // no grades or no goal: no evidence of risk
  const p = g.projected
  return 1 + Math.min(0.5, Math.max(0, (course.target - p) / 20))
}

export function buildWorkload({ courses, assessments }) {
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]))
  const withCredits = courses.filter((c) => c.credits > 0)
  const avgCredits = withCredits.reduce((s, c) => s + c.credits, 0) / (withCredits.length || 1)
  const factors = Object.fromEntries(courses.map((c) => [c.id, { credit: c.credits > 0 ? c.credits / avgCredits : 1, risk: riskBoost(c, assessments) }]))

  const items = {}
  const daily = {}
  for (const a of assessments) {
    const course = byId[a.courseId]
    if (!course || a.undated || !a.date || a.type === 'important_date') continue
    const f = factors[course.id]
    const impact = knownGradeImpact(a, course, assessments)
    const baseLoad = impact ?? ESTIMATED_LOAD[a.type] ?? 2
    if (baseLoad <= 0) continue
    const load = baseLoad * f.credit * f.risk * (a.estimated ? ESTIMATE_DISCOUNT : 1)
    const n = prepDays(a)
    const due = parseISO(a.date)
    const ramp = (n * (n + 1)) / 2
    items[a.id] = { ...a, course, impact, baseLoad, load, prep: n, factors: f, prepStart: iso(addDays(due, -(n - 1))) }
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
  if (!days.length) return MIN_THRESHOLDS
  const scores = []
  for (let ws = startOfWeek(parseISO(days[0])); iso(ws) <= days[days.length - 1]; ws = addDays(ws, 7)) {
    const s = windowLoad({ ...wl, thresholds: { moderate: 0, heavy: 0 } }, ws).score
    if (s > 0.05) scores.push(s)
  }
  scores.sort((a, b) => a - b)
  const q = (p) => scores[Math.floor(p * (scores.length - 1))] ?? 0
  return {
    moderate: Math.max(MIN_THRESHOLDS.moderate, q(PERCENTILES.moderate)),
    heavy: Math.max(MIN_THRESHOLDS.heavy, q(PERCENTILES.heavy)),
  }
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
