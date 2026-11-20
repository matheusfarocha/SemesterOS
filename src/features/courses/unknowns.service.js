// Unknowns tracker: what we still don't know about a course, and how complete our picture is.
// Production: a view over ASSESSMENTS (estimated/undated flags) + COURSE_NOTES.

import { TODAY, parseISO, fmtMonthDay, daysBetween } from '@/shared/lib/dates'

export function courseUnknowns(course, assessments) {
  const items = assessments.filter((a) => a.courseId === course.id)
  const unknowns = []

  // Past items need a score, not a date (the Grades page asks for those), so only future dates count here
  for (const a of items.filter((x) => x.score == null && (x.undated || daysBetween(TODAY, parseISO(x.date)) >= 0))) {
    if (a.undated) unknowns.push({ kind: 'date', text: `${a.title}: no dates yet`, hint: 'Paste the announcement when they post it' })
    else if (a.windowEnd) unknowns.push({ kind: 'date', text: `${a.title}: date TBD (${fmtMonthDay(parseISO(a.date))}–${fmtMonthDay(parseISO(a.windowEnd))})`, hint: 'Paste the exam schedule when it’s out' })
    else if (a.estimated) unknowns.push({ kind: 'date', text: `${a.title}: estimated ${fmtMonthDay(parseISO(a.date))}`, hint: 'Confirm it on the calendar' })
  }
  for (const c of course.categories) {
    const n = items.filter((a) => a.categoryId === c.id && !a.undated).length
    if (c.expectedCount > n) unknowns.push({ kind: 'count', text: `${c.name}: ${c.expectedCount - n} more expected, not announced yet` })
  }
  if (!course.aiPolicy) unknowns.push({ kind: 'policy', text: 'AI policy not stated', hint: 'Ask before using AI tools' })
  if (!course.latePolicy || /not found/i.test(course.latePolicy)) unknowns.push({ kind: 'policy', text: 'Late-work policy unknown' })
  for (const n of course.notes ?? []) if (!n.resolved) unknowns.push({ kind: 'note', text: n.text, noteId: n.id })

  // Known facts: firm dates/grades, grading categories, stated policies, resolved questions
  const known =
    items.filter((a) => !a.estimated && !a.undated).length +
    course.categories.length +
    (course.aiPolicy ? 1 : 0) +
    (course.latePolicy && !/not found/i.test(course.latePolicy) ? 1 : 0) +
    (course.attendance?.policy ? 1 : 0) +
    (course.notes ?? []).filter((n) => n.resolved).length

  const pct = Math.round((known / Math.max(1, known + unknowns.length)) * 100)
  return { unknowns, pct }
}
