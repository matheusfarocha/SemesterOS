// AI Semester Assistant.
// Production: question -> Cortex Search (SYLLABUS_CHUNKS) + SQL context (grades, deadlines)
// -> CORTEX.COMPLETE for the answer. Here: intent routing over the same data + keyword
// retrieval over syllabus text, so answers are grounded in what the user actually uploaded.

import { TODAY, parseISO, daysBetween, fmtShort, relDays, addDays } from '@/shared/lib/dates'
import { courseGrade, requiredScore, letter, semesterGPA, LETTER_TARGETS } from '@/features/grades/grades.service'
import { gradeImpact, prepDays } from '@/features/workload/workload.service'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const STOP = new Set('the a an is are what when how do does i my me of for to in on and or it this that with about can will be at by'.split(' '))
const tokens = (s) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => !STOP.has(t) && t.length > 1) ?? []

const EXTRA_ALIASES = { calc: ['calculus', 'math'], psy: ['psych', 'psychology'], arch: ['architecture'], engl: ['english', 'essay', 'composition', 'writing'] }

function matchCourses(q, courses) {
  const t = q.toLowerCase()
  return courses.filter((c) => {
    const aliases = [c.short, c.code, c.code.split(' ')[0], c.name, ...(EXTRA_ALIASES[c.id] ?? [])].map((s) => s.toLowerCase())
    return aliases.some((a) => new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))
  })
}

function parseTarget(q) {
  const pct = q.match(/(\d{2,3})\s?%/)
  if (pct) return { label: `${pct[1]}%`, value: Number(pct[1]) }
  const l = q.match(/\b(?:an?|get)\s+([ABCD][+-]?)(?=\s|$|\?|\.|,)/)
  if (l) {
    const hit = LETTER_TARGETS.find(([x]) => x === l[1].toUpperCase())
    if (hit) return { label: hit[0], value: hit[1] }
    const base = LETTER_TARGETS.find(([x]) => x === l[1][0].toUpperCase())
    if (base) return { label: l[1], value: base[1] }
  }
  return null
}

function retrieve(q, syllabi, courses, scope) {
  const qt = new Set(tokens(q))
  const chunks = []
  for (const c of courses) {
    if (scope.length && !scope.includes(c)) continue
    const text = syllabi[c.id] ?? ''
    for (const s of text.split(/(?<=\.)\s+/)) chunks.push({ course: c, text: s })
  }
  return chunks
    .map((ch) => ({ ...ch, score: tokens(ch.text).filter((t) => qt.has(t)).length }))
    .filter((ch) => ch.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
}

export async function askAssistant(question, { courses, assessments }, syllabi) {
  await wait(500 + Math.random() * 500)
  const q = question.toLowerCase()
  const mentioned = matchCourses(q, courses)
  const scope = mentioned.length ? mentioned : courses
  const src = (c, what) => `${c.code} · ${what}`
  const aiLine = (c) => (c.aiPolicy ? `**${c.short}** — ${c.aiPolicy}` : `**${c.short}** — No AI policy in the syllabus. Ask ${c.instructor ?? 'your instructor'} before using AI tools.`)

  // Academic integrity: help plan graded work, never produce it
  if (/\b(write|do|solve|finish|complete|code|answer)\b.{0,30}\b(my|the|this)\b.{0,20}\b(homework|hw|assignment|essay|pset|problem set|project|lab|quiz|exam|paper)/.test(q)) {
    const wantType = /exam|test|midterm|final/.test(q) ? 'exam' : /quiz/.test(q) ? 'quiz' : /project/.test(q) ? 'project' : 'assignment'
    const next = assessments
      .filter((a) => a.date && a.score == null && !a.undated && a.type === wantType && scope.some((c) => c.id === a.courseId) && daysBetween(TODAY, parseISO(a.date)) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    const c = next && courses.find((x) => x.id === next.courseId)
    const lines = ["I can't do graded work for you. That would put your academic integrity at risk."]
    const strict = scope.filter((x) => x.aiPolicy)
    if (strict.length) lines.push(...strict.map(aiLine))
    if (next) {
      const start = addDays(parseISO(next.date), -(prepDays(next) - 1))
      lines.push(
        `What I can do: **${next.title}** is due ${fmtShort(parseISO(next.date))}${next.estimated ? ' (estimated)' : ''} and is worth **${gradeImpact(next, c, assessments).toFixed(1)}%** of your ${c.short} grade. Start by ${fmtShort(start)}${c.officeHours ? `; office hours are ${c.officeHours}` : ''}.`,
      )
    }
    return { text: lines.join('\n'), sources: [...strict.map((x) => src(x, 'AI policy')), ...(next ? ['Calendar · ASSESSMENTS'] : [])] }
  }

  if (/\b(ai|llm|llms|chatgpt|gpt|claude|copilot|generative)\b/.test(q)) {
    return { text: scope.map(aiLine).join('\n'), sources: scope.filter((c) => c.aiPolicy).map((c) => src(c, 'AI policy')) }
  }

  // Required score ("what do I need on the final to get an A in calc")
  if (/\bneed\b|required|to get an?\b|to keep an?\b|to end with/.test(q)) {
    const target = parseTarget(question) ?? { label: 'your goal', value: null }
    const lines = scope.map((c) => {
      const t = target.value ?? c.target
      if (t == null) return `**${c.short}** — specify a percentage to use as your goal.`
      const r = requiredScore(c, assessments, t)
      if (r == null) return `**${c.short}** — nothing left to grade.`
      if (r > 100) return `**${c.short}** — ${target.label === 'your goal' ? `${t}%` : target.label} is out of reach (would need ${r.toFixed(0)}% on everything left).`
      if (r <= 0) return `**${c.short}** — already locked in, even with zeros on the rest.`
      return `**${c.short}** — average **${r.toFixed(1)}%** on the remaining ${courseGrade(c, assessments).remaining.length} item(s) to finish at ${target.label === 'your goal' ? `${t}%` : target.label}.`
    })
    return { text: lines.join('\n'), sources: scope.map((c) => src(c, 'grade weights')) }
  }

  if (/attend|absen|\bmiss(ed|ing)?\b|skip/.test(q)) {
    return {
      text: scope.map((c) => `**${c.short}** — ${c.attendance.policy ?? 'No attendance policy recorded.'}${c.attendance.maxAbsences != null ? ` You've used **${c.attendance.absences}/${c.attendance.maxAbsences}**.` : ''}`).join('\n'),
      sources: scope.map((c) => src(c, 'attendance policy')),
    }
  }

  if (/\blate\b|extension/.test(q)) {
    return { text: scope.map((c) => `**${c.short}** — ${c.latePolicy ?? 'No late work policy recorded.'}`).join('\n'), sources: scope.map((c) => src(c, 'late policy')) }
  }

  if (/weight|worth|breakdown|grading|policy|percent|count/.test(q)) {
    return {
      text: scope.map((c) => `**${c.short}** — ${c.categories.map((k) => `${k.name} ${k.weight == null ? '(weight not stated)' : `${k.weight}%`}`).join(', ')}`).join('\n'),
      sources: scope.map((c) => src(c, 'grading policy')),
    }
  }

  if (/how am i doing|my grades?|current grade|gpa|standing|passing/.test(q)) {
    const g = Object.fromEntries(courses.map((c) => [c.id, courseGrade(c, assessments).current]))
    const lines = scope.map((c) => {
      const cur = g[c.id]
      return `**${c.short}** — ${cur == null ? 'no grades yet' : `${cur.toFixed(1)}% (${letter(cur)})`}${cur != null && cur < c.target ? ` · below your ${c.target}% goal` : ''}`
    })
    const gpa = semesterGPA(courses, g)
    if (!mentioned.length && gpa != null) lines.push(`Projected semester GPA: **${gpa.toFixed(2)}**`)
    return { text: lines.join('\n'), sources: ['Grades · V_COURSE_GRADES'] }
  }

  if (/office|instructor|professor|prof\b|email|contact|teacher/.test(q)) {
    return { text: scope.map((c) => `**${c.short}** — ${c.instructor} (${c.email}). Office hours: ${c.officeHours}`).join('\n'), sources: scope.map((c) => src(c, 'course info')) }
  }

  if (/when|due|deadline|next|upcoming|exam|test|quiz|this week|busy|schedule/.test(q)) {
    const horizon = /this week|busy/.test(q) ? 7 : 30
    const typeFilter = /project/.test(q) ? ['project'] : /exam|test|midterm|final/.test(q) ? ['exam'] : /quiz/.test(q) ? ['quiz'] : null
    const items = assessments
      .filter((a) => a.date && a.score == null && !a.undated && scope.some((c) => c.id === a.courseId))
      .filter((a) => !typeFilter || typeFilter.includes(a.type))
      .map((a) => ({ ...a, days: daysBetween(TODAY, parseISO(a.date)) }))
      .filter((a) => a.days >= 0 && a.days <= horizon)
      .sort((a, b) => a.days - b.days)
      .slice(0, 6)
    if (!items.length) return { text: `Nothing coming up in the next ${horizon} days${mentioned.length ? ` for ${mentioned.map((c) => c.short).join(', ')}` : ''}.`, sources: [] }
    return {
      text: items
        .map((a) => {
          const when = a.windowEnd ? `sometime ${fmtShort(parseISO(a.date))}–${fmtShort(parseISO(a.windowEnd))}` : `${fmtShort(parseISO(a.date))} (${relDays(a.days)})`
          return `**${a.title}** — ${when}${a.estimated ? ' · estimated, confirm on your course site' : ''}`
        })
        .join('\n'),
      sources: ['Calendar · ASSESSMENTS'],
    }
  }

  // Fallback: semantic-search stand-in over syllabus chunks
  const hits = retrieve(question, syllabi, courses, mentioned)
  if (hits.length) {
    return { text: hits.map((h) => `**${h.course.short}** — ${h.text}`).join('\n'), sources: hits.map((h) => src(h.course, 'syllabus')) }
  }
  return {
    text: "I couldn't find that in your syllabi. Try asking about deadlines, grading weights, attendance, late work, or what you need to get an A.",
    sources: [],
  }
}

export const SUGGESTIONS = [
  'What do I need on the rest of Calc to get an A?',
  "What's due this week?",
  'How many classes can I miss in PSY?',
  'How am I doing overall?',
  'What does the Calc midterm cover?',
  'Can I use ChatGPT on my essay?',
  'Can you write my Calc problem set?',
]
