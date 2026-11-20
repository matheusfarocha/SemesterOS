// Smart Syllabus Upload.
// Production: file -> Snowflake stage -> CORTEX.PARSE_DOCUMENT (LAYOUT) -> CORTEX.COMPLETE with the
// JSON schema in ARCHITECTURE.md. Here a heuristic parser stands in so the whole flow is demoable.
//
// Design rule: never silently guess. Anything inferred is marked `estimated`, and anything
// ambiguous goes into `ambiguities` for the student to confirm on the review screen.

import { TODAY, addDays, iso, parseISO, startOfWeek, fmtMonthDay, DOW } from '@/shared/lib/dates'

const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const DAY_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const TODAY_YEAR = TODAY.getFullYear()
const PALETTE = ['#fbbf24', '#22d3ee', '#fb7185', '#a3e635', '#f97316']
export const ITEM_RE = /\b(homework|hw|problem set|pset|assignment|project|lab(?: report)?|quiz|midterm|exam|final|essay|paper)\b(\s*#?\d+)?/gi
const MONTH_DATE_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const num = (s) => WORD_NUM[s?.toLowerCase()] ?? Number(s)
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function typeOf(text) {
  const t = text.toLowerCase()
  if (/\b(final|midterm|exam|test)\b/.test(t)) return 'exam'
  if (/\b(project|presentation|portfolio)\b/.test(t)) return 'project'
  if (/\bquiz/.test(t)) return 'quiz'
  return 'assignment'
}

// Map an item title to a grading category by meaning, not just spelling
const CAT_HINTS = [
  [/homework|hw|problem set|pset|assignment/i, /assign|homework|problem|program/i],
  [/midterm/i, /midterm/i],
  [/final/i, /final/i],
  [/exam|test/i, /exam|test|midterm/i],
  [/quiz/i, /quiz/i],
  [/lab/i, /lab/i],
  [/project/i, /project/i],
  [/essay|paper/i, /essay|paper|writing/i],
]
export function categoryFor(title, categories) {
  for (const [itemRe, catRe] of CAT_HINTS) {
    if (itemRe.test(title)) {
      const hit = categories.find((c) => catRe.test(c.name))
      if (hit) return hit
    }
  }
  const stemHit = categories.find((c) => title.toLowerCase().includes(c.name.toLowerCase().split(' ')[0].replace(/(zes|s)$/, '')))
  return stemHit ?? null
}

function parseMonthDate(s, year) {
  const m = s.match(MONTH_DATE_RE)
  if (!m) return null
  return new Date(year, MONTH_IDX[m[1].toLowerCase()], Number(m[2]))
}

export function parseSyllabus(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const find = (re) => {
    for (const l of lines) {
      const m = l.match(re)
      if (m) return m
    }
    return null
  }
  const isSentence = (l) => l.split(/\s+/).length > 4
  const ambiguities = []

  // ---- Course info
  const codeM = text.match(/\b([A-Z]{2,4})\s?-?(\d{3,4}[A-Z]?)\b/)
  const code = codeM ? `${codeM[1]} ${codeM[2]}` : 'NEW 1000'
  const titleM = find(/^(?:course title|title)\s*[:\-]\s*(.+)$/i) || (codeM && find(new RegExp(`${codeM[1]}\\s?-?${codeM[2]}\\s*[:\\-–—]?\\s*(.+)`)))
  const name = titleM ? titleM[1].replace(/[,(].*$/, '').trim() : 'Untitled Course'
  const yearM = text.match(/\b(?:fall|spring|summer|winter)\s+(20\d\d)\b/i) || text.match(/\b(20\d\d)\b/)
  const year = yearM ? Number(yearM[1]) : 2026
  const instructor = find(/(?:instructor|professor|prof\.)\s*[:\-]\s*(.+)/i)?.[1]
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]
  const officeHours = find(/office hours?\s*[:\-]\s*(.+)/i)?.[1]
  const credits = Number(text.match(/(\d)\s*credits?\b/i)?.[1] ?? 3)

  // ---- Meeting pattern
  const meetLine = lines.find((l) => /meet|class meetings|lecture|schedule:/i.test(l) && /\b(mon|tue|wed|thu|fri)/i.test(l))
  const meets = meetLine ? [...new Set([...meetLine.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/gi)].map((m) => DAY_IDX[m[1].toLowerCase()]))].sort() : []
  const firstDay = parseMonthDate(find(/first day\s*[:\-]?\s*(.+)/i)?.[1] ?? '', year)
  const lastDay = parseMonthDate(find(/last day\s*[:\-]?\s*(?:of class)?\s*(.+)/i)?.[1] ?? '', year)

  // ---- Important dates table: "[2026-11-26 Thu] College closed"
  const events = []
  const quirks = {}
  let finalsStart = null
  let finalsEnd = null
  for (const l of lines) {
    const m = l.match(/^\[?(\d{4}-\d{2}-\d{2})[^\]]*\]?\s+(.+)$/)
    if (!m) continue
    const [, date, title] = m
    const follows = title.match(/follow\s+(\w+)\s+schedule/i)
    if (follows) quirks[date] = follows[1]
    if (/final exam\w*\s+begin/i.test(title)) finalsStart = date
    if (/final exam\w*\s+end/i.test(title)) finalsEnd = date
    const kind = follows ? 'quirk' : /closed|no classes/i.test(title) ? 'closed' : /withdraw|drop|last day|deadline/i.test(title) ? 'deadline' : 'term'
    events.push({ date, title: title.replace(/\s+with grade of\s+/i, ' (').replace(/\(W$/, '(W)'), kind })
  }
  const noClass = new Set(events.filter((e) => e.kind === 'closed').map((e) => e.date))

  // ---- Grading: both "Homework ..... 20%" and "20% Quizzes — description"
  const categories = []
  for (const l of lines) {
    const nameFirst = l.match(/^[-•*\s]*([A-Za-z][A-Za-z /&'-]{2,40}?)[\s.:–—-]+(\d{1,3})\s?%/)
    const weightFirst = l.match(/^[-•*\s]*(\d{1,3})\s?%\s+([A-Za-z][A-Za-z /&'-]{2,40}?)(?:\s+[—–-]\s+|\s{2,}|:\s|$)(.*)$/)
    let cat = null
    if (weightFirst) cat = { name: weightFirst[2].trim(), weight: Number(weightFirst[1]), desc: weightFirst[3] ?? '' }
    else if (nameFirst && !/attend|late|absence|deduct/i.test(nameFirst[1])) cat = { name: nameFirst[1].trim(), weight: Number(nameFirst[2]), desc: '' }
    if (!cat || cat.weight > 100 || categories.some((c) => c.name === cat.name)) continue
    const range = cat.desc.match(/(\d+)\s*[-–]\s*(\d+)\s+\w+/)
    const exact = cat.desc.match(/there will be (\d+|one|two|three|four|five|six)\b/i)
    if (range) cat.countRange = [Number(range[1]), Number(range[2])]
    if (exact) cat.expectedCount = num(exact[1])
    if (/attend/i.test(cat.name) && /deduct|from (their|your) final grade/i.test(cat.desc)) {
      cat.deduction = true
      ambiguities.push(`"${cat.name}" is listed as ${cat.weight}% of the grade and also as a per-absence deduction. We'll track absences as deductions; confirm with your instructor how the ${cat.weight}% is awarded.`)
    }
    categories.push(cat)
  }
  const totalWeight = categories.reduce((s, c) => s + c.weight, 0)
  if (categories.length && totalWeight !== 100) ambiguities.push(`Grading weights add up to ${totalWeight}%, not 100%.`)

  // ---- Policies
  const policyLine = (re) => lines.find((l) => re.test(l) && isSentence(l))
  const attLine = policyLine(/absence|attend/i)
  const freeM = attLine?.match(/first (\w+)?\s*absences?[^.]*forgiven|(\d+|one|two|three|four|five|six)\s+(?:unexcused\s+)?(?:absences?|classes|sessions)/i)
  const maxAbsences = attLine && /first absence[^.]*forgiven/i.test(text) ? 1 : freeM?.[2] ? num(freeM[2]) : 3
  // The penalty is the % after a verb like "deducted"/"lowers", not a category weight earlier in the line
  const penM = attLine?.match(/(?:deduct|lower|reduc|lose)\w*[^%]*?(\d+(?:\.\d+)?)\s?%/i)
  const lateLine = policyLine(/\blate\b/i)
  const aiPolicy = policyLine(/\b(LLM|LLMs|AI|ChatGPT|generative)\b/)
  const excused = policyLine(/excused absences?/i)
  const makeup = policyLine(/make-?up/i)

  // ---- Meeting-day helpers for week-based schedules
  const meetingInWeek = (n) => firstClassOfWeek(n, { firstDay, meets, noClass, quirks })

  // ---- Deadlines
  const assessments = []
  const seen = new Set()
  const push = (a) => {
    const key = a.title.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const cat = categoryFor(a.title, categories)
    assessments.push({ points: 100, ...a, type: typeOf(a.title), categoryName: cat?.name ?? null })
  }

  // a) "Week 7  Unit 4: Sets and Maps  Homework 2"
  const undatedWeekItems = []
  for (const l of lines) {
    const w = l.match(/^week\s+(\d{1,2})\b(.*)$/i)
    if (!w) continue
    const n = Number(w[1])
    for (const m of w[2].matchAll(ITEM_RE)) {
      const title = cap(`${m[1]}${m[2] ?? ''}`.replace(/\s+/g, ' ').trim())
      if (/^final$/i.test(title)) continue // handled below with the finals window
      const d = meetingInWeek(n)
      if (!d) {
        undatedWeekItems.push(`${title} (week ${n})`)
        continue
      }
      const ws = addDays(startOfWeek(firstDay), 7 * (n - 1))
      const skipped = [...Array(7).keys()].map((i) => iso(addDays(ws, i))).filter((x) => quirks[x] && meets.includes(parseISO(x).getDay()))
      push({ title, date: iso(d), estimated: true, source: `Syllabus week ${n} (first class that week)` })
      if (skipped.length) ambiguities.push(`${title}: week ${n} has a schedule change (${skipped.map((x) => `${fmtMonthDay(parseISO(x))} follows a ${quirks[x]} schedule`).join(', ')}). Due date may differ.`)
    }
  }

  // b) Explicit dates: "Nov 23 — Homework 9"
  for (const l of lines) {
    const m = l.match(MONTH_DATE_RE)
    if (!m || /office hours|instructor|first day|last day|^\[|^week\b|^final\s*[:\-]/i.test(l)) continue
    const title = l.replace(MONTH_DATE_RE, '').replace(/^[-•*\s:–—|]+|[-•*\s:–—|,(]+$/g, '').replace(/\s{2,}/g, ' ').replace(/\b(due|on)\s*$/i, '').trim()
    if (!title || !ITEM_RE.test(title)) {
      ITEM_RE.lastIndex = 0
      continue
    }
    ITEM_RE.lastIndex = 0
    const d = new Date(year, MONTH_IDX[m[1].toLowerCase()], Number(m[2]))
    push({ title: title.slice(0, 40), date: iso(d), estimated: false })
  }

  // c) Final exam: explicit date, or "TBD" inside the finals window
  const finalLine = find(/^final(?: exam)?\s*[:\-]?\s*(.+)$/i)
  const hasFinal = categories.some((c) => /final/i.test(c.name)) || /week\s+\d+\s+.*\bfinal\b/i.test(text)
  if (hasFinal && !assessments.some((a) => /final/i.test(a.title))) {
    const explicit = finalLine && parseMonthDate(finalLine[1], year)
    if (explicit) push({ title: 'Final Exam', date: iso(explicit), estimated: false })
    else if (finalsStart) {
      push({ title: 'Final Exam', date: finalsStart, windowEnd: finalsEnd ?? undefined, estimated: true, source: 'Final listed as TBD, placed in the finals window' })
      ambiguities.push(`Final exam date is TBD. Placed on ${fmtMonthDay(parseISO(finalsStart))}${finalsEnd ? `–${fmtMonthDay(parseISO(finalsEnd))}` : ''} as a placeholder.`)
    } else if (lastDay) {
      push({ title: 'Final Exam', date: iso(lastDay), estimated: true, source: 'Final date not given, placed on the last day of class' })
      ambiguities.push('Final exam date not found. Placed on the last day of class.')
    }
  }

  // d) Categories with nothing dated: quizzes "given regularly", engagement, attendance
  for (const c of categories) {
    if (c.deduction || assessments.some((a) => a.categoryName === c.name)) continue
    push({ title: c.name, date: iso(lastDay ?? new Date(year, 11, 10)), undated: true, estimated: true, source: 'No dates in syllabus' })
    if (/quiz/i.test(c.name)) ambiguities.push(`${c.name} have no dates in the syllabus. Add them as they're announced.`)
  }

  // e) Counts that disagree with the schedule
  for (const c of categories) {
    const found = assessments.filter((a) => a.categoryName === c.name && !a.undated).length
    if (c.countRange) {
      c.expectedCount = Math.max(found, c.countRange[0])
      ambiguities.push(`${c.name}: syllabus says ${c.countRange[0]}–${c.countRange[1]}, schedule lists ${found}. Using ${c.expectedCount}.`)
    }
  }
  if (assessments.some((a) => a.estimated && !a.undated && !a.windowEnd) && /approximate|detailed schedule|posted on/i.test(text)) {
    ambiguities.unshift('Schedule is marked approximate. Dates were estimated from week numbers; confirm each one on your course site.')
  }

  assessments.sort((a, b) => a.date.localeCompare(b.date))
  const certain = assessments.filter((a) => !a.estimated).length

  // ---- Problems: things we clearly failed to read. Shown in red; they cap confidence so a bad read never looks fine.
  const problems = []
  if (!categories.length) problems.push('No grading breakdown found. Add the categories and weights below before saving.')
  if (undatedWeekItems.length) {
    const why = !firstDay ? 'the first day of class' : 'which days the class meets'
    problems.push(`The schedule lists ${undatedWeekItems.length} item(s) by week number (${undatedWeekItems.slice(0, 3).join(', ')}${undatedWeekItems.length > 3 ? ', …' : ''}), but we couldn't find ${why}, so they weren't added.`)
  }
  if (!assessments.some((a) => !a.undated)) problems.push('No dated deadlines found. Add them as they are announced, or paste an update later.')
  if (!instructor) ambiguities.push('Instructor name and office hours not found.')
  if (!lateLine) ambiguities.push('No late-work policy found.')

  // ---- Rules that can cost points: policy sentences with consequences
  const RULE_RE = /\b(only|must|cannot|can't|forbidden|not (?:be )?accepted|no late|deduct\w*|lower\w*|penalt\w*|lose[sd]?|zero|interview|before the)\b/i
  const rules = [
    ...new Set(
      [
        lateLine,
        aiPolicy,
        makeup,
        excused,
        attLine?.replace(/^\d{1,3}\s?%\s+\w+\s+[—–-]\s+/, ''),
        ...lines.filter((l) => isSentence(l) && RULE_RE.test(l) && !/^[-•*\s]*\d{1,3}\s?%/.test(l)),
      ].filter(Boolean),
    ),
  ].slice(0, 8)

  const baseConf = 0.6 + 0.04 * categories.length + 0.04 * certain - 0.04 * ambiguities.length + (instructor ? 0.05 : 0)
  const confidence = problems.length ? Math.max(0.15, 0.4 - 0.08 * problems.length) : Math.max(0.4, Math.min(0.97, baseConf))
  return {
    code,
    name,
    instructor: instructor ?? 'TBD',
    email: email ?? '',
    officeHours: officeHours ?? 'See syllabus',
    credits,
    meets: meets.map((d) => DOW[d]),
    schedule: meetLine?.replace(/^(class meetings|meets|lecture|schedule)\s*:\s*/i, '') ?? null,
    categories: (categories.length ? categories : [{ name: 'Coursework', weight: 100 }]).map(({ desc, ...c }) => c),
    attendance: {
      policy: attLine?.replace(/^\d{1,3}\s?%\s+\w+\s+[—–-]\s+/, '') ?? 'No attendance policy found.',
      maxAbsences,
      penalty: penM ? Number(penM[1]) : 1,
      excused: excused ?? null,
    },
    latePolicy: lateLine ?? 'No late policy found.',
    aiPolicy: aiPolicy ?? null,
    rules,
    events,
    assessments,
    problems,
    ambiguities,
    confidence,
  }
}


// ---- Calendar helpers shared by the text parser and the AI (PDF) path

/** First regular class meeting in syllabus week n (skips closures and "follows Monday schedule" days). */
export function firstClassOfWeek(n, { firstDay, meets, noClass, quirks = {} }) {
  if (!firstDay || !meets.length) return null
  const ws = addDays(startOfWeek(firstDay), 7 * (n - 1))
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i)
    if (d < firstDay || !meets.includes(d.getDay()) || noClass.has(iso(d)) || quirks[iso(d)]) continue
    return d
  }
  return null
}

/** Every `weekday` between two dates, skipping days with no classes. */
function weeklyDates(weekday, from, to, noClass) {
  const out = []
  let d = addDays(from, (weekday - from.getDay() + 7) % 7)
  for (; d <= to; d = addDays(d, 7)) if (!noClass.has(iso(d))) out.push(d)
  return out
}

/**
 * Convert Claude's raw syllabus facts (server/extractor.mjs) into the same shape parseSyllabus returns,
 * so the review screen, store and trust rules work unchanged. Dates are only resolved here, never by the model.
 */
export function fromExtraction(f, source = 'Claude (PDF)') {
  const ambiguities = [...f.ambiguities]
  const problems = []
  const year = TODAY_YEAR
  const firstDay = f.firstDay ? parseISO(f.firstDay) : null
  const meets = [...new Set(f.meetingDays.map((d) => DAY_IDX[d.toLowerCase()]))].sort()
  const noClass = new Set(f.importantDates.filter((e) => e.kind === 'closed').map((e) => e.date))
  const quirks = Object.fromEntries(f.importantDates.filter((e) => e.kind === 'schedule_change').map((e) => [e.date, e.title]))
  let lastDay = f.lastDay ? parseISO(f.lastDay) : null
  if (!lastDay && firstDay) {
    lastDay = addDays(firstDay, 7 * 15 - 1)
    if (f.recurring.length) ambiguities.push(`No last day of class found. Weekly items were generated for 15 weeks (until ${fmtMonthDay(lastDay)}).`)
  }

  const categories = f.categories.map((c) => ({ name: c.name, weight: c.weight, expectedCount: c.count ?? undefined }))
  const catName = (name) => (name && categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.name) ?? categoryFor(name ?? '', categories)?.name ?? null

  const assessments = []
  for (const it of f.items) {
    const base = { title: it.title, type: it.type, categoryName: catName(it.category) ?? categoryFor(it.title, categories)?.name ?? null, points: 100 }
    if (it.date && !it.tbd) assessments.push({ ...base, date: it.date, estimated: false, source })
    else if (it.week != null) {
      const d = firstClassOfWeek(it.week, { firstDay, meets, noClass, quirks })
      if (d) assessments.push({ ...base, date: iso(d), estimated: true, source: `Syllabus week ${it.week} (first class that week)` })
      else assessments.push({ ...base, date: iso(lastDay ?? new Date(year, 11, 10)), undated: true, estimated: true, source: `Syllabus week ${it.week}, class days unknown` })
    } else if (/final/i.test(it.title) && f.finalsWindow) {
      assessments.push({ ...base, date: f.finalsWindow.start, windowEnd: f.finalsWindow.end, estimated: true, source: 'Final listed as TBD, placed in the finals window' })
    } else {
      assessments.push({ ...base, date: iso(lastDay ?? new Date(year, 11, 10)), undated: true, estimated: true, source: 'Date TBD in syllabus' })
    }
  }

  for (const r of f.recurring) {
    if (!firstDay || !lastDay) {
      ambiguities.push(`"${r.title}" happens every ${r.weekday}, but the semester dates weren't found, so they weren't added.`)
      continue
    }
    const dates = weeklyDates(DAY_IDX[r.weekday.toLowerCase()], firstDay, lastDay, noClass)
    dates.forEach((d, i) =>
      assessments.push({ title: `${r.title} ${i + 1}`, type: r.type, categoryName: catName(r.category) ?? categoryFor(r.title, categories)?.name ?? null, date: iso(d), points: 100, estimated: true, source: `Every ${r.weekday} per syllabus` }),
    )
  }

  // Categories with nothing to put on the calendar still need a slot for grade math
  for (const c of categories) {
    const isDeduction = /attend/i.test(c.name) && f.attendance.penaltyPercent != null
    if (isDeduction || assessments.some((a) => a.categoryName === c.name)) continue
    assessments.push({ title: c.name, type: 'assignment', categoryName: c.name, date: iso(lastDay ?? new Date(year, 11, 10)), points: 100, undated: true, estimated: true, source: 'No dates in syllabus' })
  }

  const total = categories.reduce((s, c) => s + c.weight, 0)
  if (!categories.length) problems.push('No grading breakdown found. Add the categories and weights below before saving.')
  else if (Math.round(total) !== 100) ambiguities.push(`Grading weights add up to ${total}%, not 100%.`)
  if (!assessments.some((a) => !a.undated)) problems.push('No dated deadlines found. Add them as they are announced, or paste an update later.')

  assessments.sort((a, b) => a.date.localeCompare(b.date))
  const at = f.attendance
  return {
    code: f.course.code,
    name: f.course.name,
    instructor: f.course.instructor ?? 'TBD',
    email: f.course.email ?? '',
    officeHours: f.course.officeHours ?? 'See syllabus',
    credits: f.course.credits ?? 3,
    meets: meets.map((d) => DOW[d]),
    schedule: f.course.classTimes,
    categories,
    attendance: {
      policy: at.policy ?? (at.countsTowardGrade === false ? 'Attendance is not part of the grade.' : 'No attendance policy found.'),
      graded: !(at.countsTowardGrade === false || (at.penaltyPercent == null && at.freeAbsences == null)),
      maxAbsences: at.freeAbsences ?? 0,
      penalty: at.penaltyPercent ?? 0,
      excused: null,
    },
    latePolicy: f.latePolicy ?? 'No late policy found.',
    aiPolicy: f.aiPolicy,
    rules: f.rules,
    events: f.importantDates.map((e) => ({ date: e.date, title: e.title, kind: e.kind === 'schedule_change' ? 'quirk' : e.kind })),
    assessments,
    problems,
    ambiguities,
    confidence: problems.length ? 0.35 : Math.max(0.6, 0.95 - 0.03 * ambiguities.length),
    via: 'ai',
  }
}

/** Upload a PDF to the extraction server (server/index.mjs) and convert the result. */
export async function extractSyllabusPdf(pdfBase64, onStep = () => {}) {
  onStep(0)
  const req = fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfBase64, today: iso(TODAY), term: 'Fall 2026' }),
  })
  onStep(1)
  let res
  try {
    res = await req
  } catch {
    throw new Error('Extraction server is not running. Start it with `npm run server`.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Extraction failed (${res.status}). Is \`npm run server\` running?`)
  onStep(2)
  await wait(300)
  return fromExtraction(body)
}

/** Simulates the Cortex pipeline with staged progress callbacks. */
export async function extractSyllabus(text, onStep = () => {}) {
  onStep(0) // PARSE_DOCUMENT
  await wait(600)
  onStep(1) // COMPLETE -> structured JSON
  await wait(900)
  const parsed = parseSyllabus(text)
  onStep(2) // resolve weeks -> dates, write rows
  await wait(400)
  return parsed
}

/** Converts an extraction result into rows for the store. */
export function toCourseRows(ex, existingCount) {
  const id = ex.code.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36)
  const categories = ex.categories.map((c, i) => ({ id: `${id}-c${i}`, name: c.name, weight: c.weight, expectedCount: c.expectedCount }))
  const course = {
    id,
    code: ex.code,
    short: ex.code.split(' ')[0],
    name: ex.name,
    color: PALETTE[existingCount % PALETTE.length],
    instructor: ex.instructor,
    email: ex.email,
    officeHours: ex.officeHours,
    schedule: ex.schedule ?? 'See syllabus',
    credits: ex.credits,
    target: 90,
    attendance: { ...ex.attendance, absences: 0 },
    latePolicy: ex.latePolicy,
    aiPolicy: ex.aiPolicy,
    rules: ex.rules,
    // Open questions from upload; the Unknowns tracker lets the student resolve them
    notes: [...(ex.problems ?? []), ...ex.ambiguities]
      .filter((t) => !/TBD|no dates|approximate|schedule change/i.test(t)) // date gaps are tracked on the items themselves
      .map((text, i) => ({ id: `${id}-n${i}`, text, resolved: false })),
    categories,
  }
  const assessments = ex.assessments.map((a, i) => ({
    id: `${id}-a${i}`,
    courseId: id,
    categoryId: (categories.find((c) => c.name === a.categoryName) ?? categories[0]).id,
    // Prefix generic titles ("Homework 4") so they're unambiguous next to other courses
    title: a.title.toLowerCase().startsWith(course.short.toLowerCase()) ? a.title : `${course.short} ${a.title}`,
    type: a.type,
    date: a.date,
    points: a.points,
    score: null,
    estimated: a.estimated || undefined,
    undated: a.undated || undefined,
    windowEnd: a.windowEnd,
    source: a.source,
  }))
  const events = ex.events.filter((e) => e.kind !== 'quirk').map((e, i) => ({ id: `${id}-e${i}`, ...e }))
  return { course, assessments, events }
}

export const SAMPLES = [
  {
    id: 'cisc',
    label: 'CISC 3130 (real format, anonymized)',
    file: 'CISC3130_syllabus.pdf',
    text: `CISC 3130 — Data Structures
Fall 2026
Instructor: Prof. Jordan Rivera
Email: jrivera@college.edu
Class Meetings: Tuesday, Thursday 2:15 PM – 3:55 PM
First day: Tuesday, September 1
Last day: Thursday, December 10
Final: TBD
Office Hours: Tue 12:30–2:00 PM, Wed 1:00–2:20 PM
4 hours; 4 credits

SCHEDULE OUTLINE
The following schedule is approximate. A detailed schedule, including quiz dates and assignment due dates, will be posted on the course site.
Week 1   Unit 1: Introduction
Week 2   Unit 2: Lists, Stacks, Queues
Week 4   ...   Homework 1
Week 5   Midterm 1
Week 6   Unit 3: Priority Queues
Week 7   Unit 4: Sets and Maps   Homework 2
Week 10  Midterm 2   Homework 3
Week 11  Unit 5: Binary Search Trees
Week 13  ...   Homework 4
Week 14  Unit 6: Sorting
Week 15  Final   Homework 5

GRADING
20% Quizzes — Regular short quizzes will be given.
20% Programming Assignments — Students will complete 4-6 programming assignments in Java.
20% Midterms — There will be 2 midterms.
20% Final — The final exam will be cumulative.
10% Attendance — After the first absence, which is forgiven, students will be deducted 1% from their final grade for every class they miss.
10% Engagement — Students are expected to make active use of class time.

POLICIES
Submitting work that is generated or assisted by LLMs (i.e. AI) is strictly forbidden and will be treated as a violation of academic integrity.
5% will be deducted from late assignments for each class elapsed past the submission deadline, unless an extension is granted.
Excused absences will reduce the grade by .5% instead of 1%.
Students will only have an opportunity to make-up quizzes if they have an excused absence and arrange it before the quiz is given.

IMPORTANT DATES
[2026-09-07 Mon] College closed
[2026-10-12 Mon] College closed
[2026-10-13 Tue] Classes follow Monday schedule
[2026-11-06 Fri] Last day to withdraw with grade of W
[2026-11-25 Wed] No classes scheduled
[2026-11-26 Thu] College closed
[2026-11-27 Fri] College closed
[2026-12-15 Tue] Final examinations begin
[2026-12-21 Mon] Final examinations end`,
  },
  {
    id: 'phys',
    label: 'PHYS 2101 (simple, dated)',
    file: 'PHYS2101_syllabus.pdf',
    text: `PHYS 2101 — Physics for Engineers I, Fall 2026
Instructor: Dr. Marcus Feld
Email: mfeld@university.edu
Office Hours: Mon/Wed 3:00–4:30pm, Physics 110
4 credit hours. Lecture MWF 10:00am, Lab Thursdays.

GRADING
- Homework ............ 20%
- Labs ................ 15%
- Midterm Exam ........ 25%
- Final Exam .......... 30%
- Quizzes ............. 10%

ATTENDANCE
Students may miss three unexcused lab sessions; each additional absence lowers the final grade by 2%.

LATE WORK
Homework submitted late loses 10% per day, up to 3 days.

SCHEDULE
Nov 23 — Homework 9: Rotational dynamics
Nov 25 — Quiz 6
Dec 1 — Lab Report 5 due
Dec 3 — Homework 10: Oscillations
Dec 8 — Midterm Exam 2
Dec 15 — Final Exam (cumulative)`,
  },
]
