// Smart reminders. In production a Snowflake TASK runs this nightly and writes to
// the REMINDERS table; the dashboard just selects from it.

import { TODAY, parseISO, daysBetween, fmtShort, fmtMonthDay, relDays, startOfWeek, addDays } from '@/shared/lib/dates'
import { courseGrade } from '@/features/grades/grades.service'
import { buildWorkload, windowLoad } from '@/features/workload/workload.service'

const topNames = (info, n = 2) => info.contributors.slice(0, n).map((c) => c.item.title).join(', ')

export function generateReminders({ courses, assessments, events = [] }) {
  const out = []
  const courseOf = Object.fromEntries(courses.map((c) => [c.id, c]))
  const wl = buildWorkload({ courses, assessments })
  const upcoming = assessments
    .filter((a) => a.score == null && !a.undated && a.date)
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
      sub: `${fmtShort(a.d)} · ${courseOf[a.courseId]?.code}${a.estimated ? ' · estimated date' : ''}`,
      date: a.date,
    })
  }

  // 2. Estimated dates coming up: ask the student to confirm rather than trusting our guess
  for (const a of upcoming.filter((a) => a.estimated && a.days <= 21)) {
    out.push({
      id: `cf-date-${a.id}`,
      kind: 'confirm',
      severity: a.days <= 7 ? 'high' : 'med',
      title: `Confirm date: ${a.title}`,
      sub: `${a.source ?? 'Estimated from syllabus'} · check your course site`,
      date: a.date,
      itemId: a.id,
    })
  }

  // 3. Crunch: two high-stakes items within 48h of each other
  // Items with an unknown date inside a range (e.g. finals week TBD) can't be called a crunch yet
  const big = upcoming.filter((a) => (a.type === 'exam' || a.type === 'project') && a.days <= 30 && !a.windowEnd)
  for (let i = 0; i < big.length - 1; i++) {
    const a = big[i]
    const b = big[i + 1]
    const gap = daysBetween(a.d, b.d)
    if (gap <= 2) {
      out.push({
        id: `cf-${a.id}-${b.id}`,
        kind: 'conflict',
        severity: 'high',
        title: `Crunch: ${a.title} + ${b.title}`,
        sub: `${['Same day', '1 day apart', '2 days apart'][gap]} · ${fmtMonthDay(a.d)}–${fmtMonthDay(b.d)}`,
        date: a.date,
      })
    }
  }

  // 4. Heavy stretches: rolling next-7-days, then the following two calendar weeks
  const next7 = windowLoad(wl, TODAY)
  if (next7.level === 'heavy') {
    out.push({ id: 'wk-next7', kind: 'conflict', severity: 'high', title: 'Heavy 7 days ahead', sub: `Driven by ${topNames(next7)}`, date: null })
  }
  for (let w = 1; w <= 2; w++) {
    const ws = addDays(startOfWeek(TODAY), w * 7)
    const info = windowLoad(wl, ws)
    if (info.level === 'heavy') {
      out.push({ id: `wk-${w}`, kind: 'conflict', severity: 'med', title: `Heavy week of ${fmtMonthDay(ws)}`, sub: `Start early on ${topNames(info)}`, date: null })
    }
  }

  // 5. Term deadlines (withdrawal etc.), with a nudge if an exam lands just before one
  for (const e of events.filter((e) => e.kind === 'deadline')) {
    const days = daysBetween(TODAY, parseISO(e.date))
    if (days < 0 || days > 14) continue
    const examBefore = upcoming.find((a) => a.type === 'exam' && daysBetween(a.d, parseISO(e.date)) >= 0 && daysBetween(a.d, parseISO(e.date)) <= 7)
    out.push({
      id: `ev-${e.id}`,
      kind: 'deadline',
      severity: 'med',
      type: 'assignment',
      title: e.title,
      prefix: '',
      emphasis: relDays(days),
      sub: examBefore ? `${examBefore.title} is ${daysBetween(examBefore.d, parseISO(e.date))} days before: check your standing` : fmtShort(parseISO(e.date)),
      date: e.date,
    })
  }

  // 6. Academic risk: projected grade under goal, attendance at the limit
  for (const c of courses) {
    const g = courseGrade(c, assessments)
    if (g.current != null && c.target != null && g.projected != null && g.projected < c.target) {
      out.push({ id: `rk-${c.id}`, kind: 'risk', severity: c.target - g.projected > 5 ? 'high' : 'med', title: `${c.short} trending ${g.projected.toFixed(1)}%`, sub: `Below your ${c.target}% goal`, date: null })
    }
    const at = c.attendance
    if (at && at.graded !== false && at.maxAbsences != null && at.absences >= at.maxAbsences) {
      out.push({ id: `ab-${c.id}`, kind: 'risk', severity: 'high', title: `${c.short}: at absence limit`, sub: `${at.absences}/${at.maxAbsences} used${at.penalty != null ? ` · next costs ${at.penalty}%` : ''}`, date: null })
    }
  }

  const rank = { high: 0, med: 1, low: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date ?? '9').localeCompare(b.date ?? '9'))
}
