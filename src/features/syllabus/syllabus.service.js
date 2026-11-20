// Smart Syllabus Upload.
// Production: file -> Snowflake stage -> SNOWFLAKE.CORTEX.PARSE_DOCUMENT -> CORTEX.COMPLETE
// with a JSON-schema prompt (see ARCHITECTURE.md). Here a heuristic parser stands in so the
// UI flow is real end to end.

const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 }
const PALETTE = ['#fbbf24', '#22d3ee', '#fb7185', '#a3e635', '#f97316']

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function typeOf(text) {
  const t = text.toLowerCase()
  if (/\b(final exam|midterm|exam|test)\b/.test(t)) return 'exam'
  if (/\bproject|presentation|portfolio\b/.test(t)) return 'project'
  if (/\bquiz\b/.test(t)) return 'quiz'
  return 'assignment'
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

  const codeM = text.match(/\b([A-Z]{2,4})\s?-?(\d{3,4}[A-Z]?)\b/)
  const code = codeM ? `${codeM[1]} ${codeM[2]}` : 'NEW 1000'
  const titleM = find(/^(?:course title|title)\s*[:\-]\s*(.+)$/i) || (codeM && find(new RegExp(`${codeM[1]}\\s?-?${codeM[2]}\\s*[:\\-–—]?\\s*(.+)`)))
  let name = titleM ? titleM[1].replace(/[,(].*$/, '').trim() : 'Untitled Course'
  const yearM = text.match(/\b(?:fall|spring|summer|winter)\s+(20\d\d)\b/i) || text.match(/\b(20\d\d)\b/)
  const year = yearM ? Number(yearM[1]) : 2026

  const instructor = find(/(?:instructor|professor|prof\.)\s*[:\-]\s*(.+)/i)?.[1]
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]
  const officeHours = find(/office hours?\s*[:\-]\s*(.+)/i)?.[1]
  const credits = Number(text.match(/(\d)\s*credit/i)?.[1] ?? 3)

  // Grading weights: "Homework ....... 20%"
  const categories = []
  for (const l of lines) {
    const m = l.match(/^[-•*\s]*([A-Za-z][A-Za-z /&'-]{2,40}?)[\s.:–—-]+(\d{1,3})\s?%/)
    if (m && Number(m[2]) <= 100 && !/attend|late|absence/i.test(m[1])) {
      categories.push({ name: m[1].trim(), weight: Number(m[2]) })
    }
  }

  // Attendance / late policy
  const isSentence = (l) => l.split(/\s+/).length > 4
  const attLine = lines.find((l) => /attend|absence|miss/i.test(l) && isSentence(l))
  const maxM = attLine?.match(/(\d+|one|two|three|four|five|six)\s+(?:unexcused\s+)?absences?/i)
  const maxAbsences = maxM ? (WORD_NUM[maxM[1].toLowerCase()] ?? Number(maxM[1])) : 3
  const penM = attLine?.match(/(\d+(?:\.\d+)?)\s?%/)
  const lateLine = lines.find((l) => /\blate\b/i.test(l) && !/attendance/i.test(l) && isSentence(l))

  // Dated items: any line containing "Nov 24" / "November 24" / "11/24"
  const assessments = []
  const dateRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b|\b(\d{1,2})\/(\d{1,2})\b/i
  for (const l of lines) {
    const m = l.match(dateRe)
    if (!m || /office hours|^instructor/i.test(l)) continue
    const month = m[1] ? MONTH_IDX[m[1].toLowerCase()] : Number(m[3]) - 1
    const day = Number(m[2] ?? m[4])
    if (month == null || day < 1 || day > 31) continue
    const title = l.replace(dateRe, '').replace(/^[-•*\s:–—|]+|[-•*\s:–—|,(]+$/g, '').replace(/\s{2,}/g, ' ').replace(/\b(due|on)\s*$/i, '').trim() || 'Untitled'
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const type = typeOf(title)
    const tl = title.toLowerCase()
    const cat =
      categories.find((c) => tl.includes(c.name.toLowerCase().split(' ')[0].replace(/(zes|s)$/, ''))) ??
      categories.find((c) => type === 'exam' && /exam|midterm|test/i.test(c.name))
    assessments.push({ title: title.slice(0, 40), date, type, categoryName: cat?.name ?? null, points: 100 })
  }

  return {
    code,
    name,
    instructor: instructor ?? 'TBD',
    email: email ?? '',
    officeHours: officeHours ?? 'See syllabus',
    credits,
    categories: categories.length ? categories : [{ name: 'Coursework', weight: 100 }],
    attendance: {
      policy: attLine ?? 'No attendance policy found.',
      maxAbsences,
      penalty: penM ? Number(penM[1]) : 1,
    },
    latePolicy: lateLine ?? 'No late policy found.',
    assessments,
    confidence: Math.min(0.98, 0.55 + 0.05 * categories.length + 0.03 * assessments.length + (instructor ? 0.08 : 0)),
  }
}

/** Simulates the Cortex pipeline with staged progress callbacks. */
export async function extractSyllabus(text, onStep = () => {}) {
  onStep(0) // PARSE_DOCUMENT
  await wait(600)
  onStep(1) // COMPLETE -> structured JSON
  await wait(900)
  const parsed = parseSyllabus(text)
  onStep(2) // write rows
  await wait(400)
  return parsed
}

/** Converts an extraction result into rows for the store. */
export function toCourseRows(ex, existingCount) {
  const id = ex.code.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36)
  const categories = ex.categories.map((c, i) => ({ id: `${id}-c${i}`, name: c.name, weight: c.weight }))
  const course = {
    id,
    code: ex.code,
    short: ex.code.split(' ')[0],
    name: ex.name,
    color: PALETTE[existingCount % PALETTE.length],
    instructor: ex.instructor,
    email: ex.email,
    officeHours: ex.officeHours,
    schedule: 'See syllabus',
    credits: ex.credits,
    target: 90,
    attendance: { ...ex.attendance, absences: 0 },
    latePolicy: ex.latePolicy,
    categories,
  }
  const assessments = ex.assessments.map((a, i) => ({
    id: `${id}-a${i}`,
    courseId: id,
    categoryId: (categories.find((c) => c.name === a.categoryName) ?? categories[0]).id,
    title: a.title,
    type: a.type,
    date: a.date,
    points: a.points,
    score: null,
  }))
  return { course, assessments }
}

export const SAMPLE_SYLLABUS = `PHYS 2101 — Physics for Engineers I, Fall 2026
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
Dec 15 — Final Exam (cumulative)`
