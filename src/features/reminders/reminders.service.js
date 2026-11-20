// Smart reminders. In production a Snowflake TASK runs this nightly and writes to
// the REMINDERS table; the dashboard just selects from it.

import { TODAY, parseISO, daysBetween, fmtShort, relDays, startOfWeek, addDays, iso } from '@/shared/lib/dates'
import { courseGrade } from '@/features/grades/grades.service'

const LOAD = { exam: 3, project: 3, assignment: 1.5, quiz: 1 }

export function weekLoad(assessments, weekStart) {
  const end = addDays(weekStart, 7)
  const score = assessments
    .filter((a) => {
      if (!a.date) return false
      const d = parseISO(a.date)
      return d >= weekStart && d < end
    })
    .reduce((s, a) => s + (LOAD[a.type] ?? 1), 0)
  const level = score === 0 ? 'none' : score < 3 ? 'light' : score < 5.5 ? 'moderate' : 'heavy'
  return { score, level }
}

export function generateReminders({ courses, assessments }) {
  const out = []
  const courseOf = Object.fromEntries(courses.map((c) => [c.id, c]))
  const upcoming = assessments
    .filter((a) => a.date && a.score == null)
    .map((a) => ({ ...a, d: parseISO(a.date), days: daysBetween(TODAY, parseISO(a.date)) }))
    .filter((a) => a.days >= 0)
    .sort((x, y) => x.d - y.d)

  // 1. Deadlines in the next 7 days
  for (const a of upcoming.filter((a) => a.days <= 7)) {
    const big = a.type === 'exam' || a.type === 'project'
    out.push({
      id: `dl-${a.id}`,
      kind: 'deadline',
      severity: big ? 'high' : 'med',
      type: a.type,
      title: a.title,
      emphasis: relDays(a.days),
      prefix: a.type === 'exam' ? '' : 'due ',
      sub: `${fmtShort(a.d)} · ${courseOf[a.courseId]?.code}`,
      date: a.date,
    })
  }

  // 2. Conflicts: two high-stakes items within 48h of each other
  const big = upcoming.filter((a) => (a.type === 'exam' || a.type === 'project') && a.days <= 30)
  for (let i = 0; i < big.length - 1; i++) {
    const a = big[i]
    const b = big[i + 1]
    if (daysBetween(a.d, b.d) <= 2) {
      out.push({
        id: `cf-${a.id}-${b.id}`,
        kind: 'conflict',
        severity: 'high',
        title: `Crunch: ${a.title} + ${b.title}`,
        sub: `${['Same day', '1 day apart', '2 days apart'][daysBetween(a.d, b.d)]} · ${fmtShort(a.d).slice(5)}–${fmtShort(b.d).slice(5)}`,
        date: a.date,
      })
    }
  }

  // 3. Heavy weeks ahead
  for (let w = 0; w < 3; w++) {
    const ws = addDays(startOfWeek(TODAY), w * 7)
    if (weekLoad(assessments, ws).level === 'heavy') {
      out.push({ id: `wk-${iso(ws)}`, kind: 'conflict', severity: 'med', title: `Heavy week of ${fmtShort(ws).slice(5)}`, sub: 'Consider front-loading work', date: iso(ws) })
    }
  }

  // 4. Academic risk: projected grade under goal, attendance at the limit
  for (const c of courses) {
    const g = courseGrade(c, assessments)
    if (g.projected != null && g.projected < c.target) {
      out.push({ id: `rk-${c.id}`, kind: 'risk', severity: c.target - g.projected > 5 ? 'high' : 'med', title: `${c.short} trending ${g.projected.toFixed(1)}%`, sub: `Below your ${c.target}% goal`, date: null })
    }
    const at = c.attendance
    if (at?.maxAbsences != null && at.absences >= at.maxAbsences) {
      out.push({ id: `ab-${c.id}`, kind: 'risk', severity: 'high', title: `${c.short}: at absence limit`, sub: `${at.absences}/${at.maxAbsences} used${at.penalty != null ? ` · next costs ${at.penalty}%` : ''}`, date: null })
    }
  }

  const rank = { high: 0, med: 1, low: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date ?? '9').localeCompare(b.date ?? '9'))
}
