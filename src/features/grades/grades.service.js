// Grade math. In production these are SQL views over ASSESSMENTS + GRADE_CATEGORIES
// (see ARCHITECTURE.md -> V_COURSE_GRADES). Kept pure so it can be ported 1:1.

const SCALE = [
  [93, 'A', 4.0], [90, 'A-', 3.7], [87, 'B+', 3.3], [83, 'B', 3.0], [80, 'B-', 2.7],
  [77, 'C+', 2.3], [73, 'C', 2.0], [70, 'C-', 1.7], [67, 'D+', 1.3], [60, 'D', 1.0], [0, 'F', 0],
]
export const LETTER_TARGETS = [['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['C', 73]]

export const letter = (p) => (p == null ? '—' : SCALE.find(([min]) => p >= min)[1])
export const gradePoints = (p) => (p == null ? 0 : SCALE.find(([min]) => p >= min)[2])

export function attendancePenalty(course, absences = course.attendance?.absences ?? 0) {
  const a = course.attendance
  if (a?.maxAbsences == null || a.penalty == null) return 0
  return Math.max(0, absences - a.maxAbsences) * a.penalty
}

/**
 * Compute a course grade.
 * opts.hypo   — { [assessmentId]: percent } overrides for ungraded items
 * opts.fill   — percent to assume for every other ungraded item (default: current category average)
 * opts.absences — override absence count
 */
export function courseGrade(course, assessments, opts = {}) {
  const items = assessments.filter((a) => a.courseId === course.id)
  const { hypo = {}, fill = null } = opts

  const cats = course.categories.map((c) => {
    const inCat = items.filter((a) => a.categoryId === c.id)
    const pointItems = inCat.filter((a) => a.points > 0)
    const scored = pointItems.filter((a) => a.score != null)
    const earned = scored.reduce((s, a) => s + a.score, 0)
    const scoredPts = scored.reduce((s, a) => s + a.points, 0)
    const totalPts = pointItems.reduce((s, a) => s + a.points, 0)
    return { ...c, items: inCat, earned, scoredPts, totalPts, avg: scoredPts ? (earned / scoredPts) * 100 : null }
  })

  const weighted = (list, key) => {
    const w = list.reduce((s, c) => s + c.weight, 0)
    return w ? list.reduce((s, c) => s + c.weight * c[key], 0) / w : null
  }

  const hasUnknownPoints = (cat) => cat.items.some((a) => a.points == null)
  const current = weighted(cats.filter((c) => c.weight != null && c.avg != null), 'avg')

  for (const c of cats) {
    if (!c.totalPts || hasUnknownPoints(c)) continue
    let pts = c.earned
    for (const a of c.items) {
      if (a.score != null) continue
      const pct = hypo[a.id] ?? fill ?? c.avg ?? current ?? 85
      pts += (pct / 100) * a.points
    }
    c.projected = (pts / c.totalPts) * 100
  }

  const penalty = attendancePenalty(course, opts.absences)
  const raw = weighted(cats.filter((c) => c.weight != null && c.projected != null), 'projected')
  const projected = raw == null ? null : Math.max(0, raw - penalty)
  const remaining = cats.filter((c) => c.weight > 0 && c.projected != null)
    .flatMap((c) => c.items.filter((a) => a.score == null))

  return { current, projected, penalty, categories: cats, remaining }
}

/** Uniform % needed on every remaining item to land on `target`. null = nothing left to grade. */
export function requiredScore(course, assessments, target, opts = {}) {
  if (target == null) return null
  const lo = courseGrade(course, assessments, { ...opts, fill: 0, hypo: {} }).projected
  const hi = courseGrade(course, assessments, { ...opts, fill: 100, hypo: {} }).projected
  if (lo == null || hi == null || hi === lo) return null
  return ((target - lo) / (hi - lo)) * 100
}

export function semesterGPA(courses, gradeById) {
  let pts = 0
  let cr = 0
  for (const c of courses) {
    const g = gradeById[c.id]
    if (g == null || c.credits == null) continue
    pts += gradePoints(g) * c.credits
    cr += c.credits
  }
  return cr ? pts / cr : null
}

/** Turns the math into one status + one plain sentence. */
export function gradeVerdict(g, need, target) {
  const left = g.remaining.length
  if (g.current == null) return { tone: 'muted', label: 'No grades yet', text: 'Enter a score below to see where you stand.' }
  if (target == null) return { tone: 'muted', label: 'No goal set', text: 'Pick a goal in Grades to see what you need on the rest.' }
  if (need == null) return { tone: 'muted', label: 'Complete', text: 'Everything is graded.' }
  if (need <= 0) return { tone: 'ok', label: 'Locked in', text: `You'll reach ${target}% even with zeros on the rest.` }
  if (need > 100) return { tone: 'bad', label: 'Out of reach', text: `You'd need ${need.toFixed(0)}% on everything left. Try a lower goal.` }
  if (need <= g.current) return { tone: 'ok', label: 'On track', text: `Average ${need.toFixed(0)}% on the ${left} thing${left > 1 ? 's' : ''} left. You're doing better than that now.` }
  return { tone: 'warn', label: 'Stretch', text: `You need ${need.toFixed(0)}% on the ${left} thing${left > 1 ? 's' : ''} left, higher than your ${g.current.toFixed(0)}% so far.` }
}

/** Status for a course in one call (used by Courses and Grades). */
export function courseStatus(course, assessments) {
  const g = courseGrade(course, assessments)
  const need = g.current == null ? null : requiredScore(course, assessments, course.target)
  return { g, need, ...gradeVerdict(g, need, course.target) }
}
