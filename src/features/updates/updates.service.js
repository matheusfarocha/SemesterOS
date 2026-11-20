// Paste an update: turn a professor announcement into concrete calendar changes.
// Production: CORTEX.COMPLETE with the course's current ASSESSMENTS as context, returning a JSON diff.
// Here: sentence-level matching against existing items. The student always reviews before applying.

import { TODAY, iso, addDays, parseISO, fmtShort } from '@/shared/lib/dates'
import { ITEM_RE, typeOf, categoryFor } from '@/features/syllabus/syllabus.service'

const MONTH_IDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }
const WEEKDAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const ALIASES = { calc: ['calculus'], psy: ['psych', 'psychology'], arch: ['architecture'], engl: ['english', 'essay', 'composition'] }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const cap = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())

export function detectCourse(text, courses) {
  const t = text.toLowerCase()
  const score = (c) => {
    const names = [c.code, c.short, c.name, ...(ALIASES[c.id] ?? [])].map((x) => x.toLowerCase())
    return names.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)).length
  }
  return [...courses].sort((a, b) => score(b) - score(a)).find((c) => score(c) > 0) ?? null
}

/** Dates in a sentence, skipping ones introduced by "instead of / from / was" (those are the old date). */
function newDateIn(sentence) {
  const year = TODAY.getFullYear()
  const found = []
  for (const m of sentence.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/gi)) {
    found.push({ at: m.index, date: new Date(year, MONTH_IDX[m[1].toLowerCase()], Number(m[2])) })
  }
  for (const m of sentence.matchAll(/\b(\d{1,2})\/(\d{1,2})\b/g)) found.push({ at: m.index, date: new Date(year, Number(m[1]) - 1, Number(m[2])) })
  const fresh = found.filter((f) => !/(instead of|from|was|originally)\s*(\w+,?\s*)?$/i.test(sentence.slice(Math.max(0, f.at - 22), f.at)))
  if (fresh.length) return fresh.sort((a, b) => a.at - b.at)[0].date
  if (/\btomorrow\b/i.test(sentence)) return addDays(TODAY, 1)
  const wd = sentence.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (wd) {
    const target = WEEKDAY[wd[1].toLowerCase()]
    let d = addDays(TODAY, 1)
    while (d.getDay() !== target) d = addDays(d, 1)
    return d
  }
  return null
}

const norm = (title, course) =>
  title
    .toLowerCase()
    .replace(new RegExp(`^${course.short.toLowerCase()}\\s+`), '')
    .replace(/\bhw\b/g, 'homework')
    .replace(/\bproblem set\b/g, 'pset')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function parseUpdate(text, course, assessments) {
  const items = assessments.filter((a) => a.courseId === course.id)
  const changes = []
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/\bfinal exam(ination)?s?\b/gi, 'final').replace(/\bmidterm exam\b/gi, 'midterm'))
    .filter(Boolean)

  for (const s of sentences) {
    const date = newDateIn(s)
    const mentions = [...s.matchAll(ITEM_RE)].map((m) => cap(`${m[1]}${m[2] ?? ''}`.replace(/\s+/g, ' ').trim()))

    // "No class on Tuesday, Dec 8"
    if (!mentions.length && date && /\bno class|class (is )?cancel/i.test(s)) {
      changes.push({ kind: 'event', date: iso(date), title: `No ${course.short} class`, text: s })
      continue
    }

    for (const title of mentions) {
      const key = norm(title, course)
      const generic = !/\d/.test(key) // "midterm", "final", "quiz" without a number
      const match =
        items.find((a) => norm(a.title, course) === key) ??
        items.find((a) => key.startsWith('final') && /final/i.test(a.title) && a.type === 'exam') ??
        (generic && key !== 'quiz' ? items.filter((a) => a.score == null && norm(a.title, course).startsWith(key)).sort((a, b) => a.date.localeCompare(b.date))[0] : null)

      if (match && /cancel|no longer|dropped/i.test(s)) {
        changes.push({ kind: 'remove', id: match.id, title: match.title, text: s })
      } else if (match && date) {
        const to = iso(date)
        if (to !== match.date) changes.push({ kind: 'move', id: match.id, title: match.title, from: match.date, to, text: s })
        else if (match.estimated) changes.push({ kind: 'confirm', id: match.id, title: match.title, to, text: s })
      } else if (!match && date) {
        const type = typeOf(title)
        const cat =
          categoryFor(title, course.categories) ??
          course.categories.find((c) => (type === 'exam' ? /exam|midterm|final/i : /assign|homework|problem|quiz/i).test(c.name)) ??
          course.categories[0]
        changes.push({ kind: 'add', title: `${course.short} ${title}`, to: iso(date), type, categoryId: cat.id, categoryName: cat.name, text: s })
      }
    }
  }
  // One change per item: keep the last mention (announcements correct themselves)
  const seen = new Map()
  for (const c of changes) seen.set(c.id ?? c.title + c.to, c)
  return [...seen.values()]
}

export async function analyzeUpdate(text, course, assessments) {
  await wait(700) // CORTEX.COMPLETE round trip
  return parseUpdate(text, course, assessments)
}

export function describe(c) {
  const d = (x) => fmtShort(parseISO(x))
  if (c.kind === 'move') return { label: 'Moved', text: `${c.title}: ${d(c.from)} → ${d(c.to)}` }
  if (c.kind === 'confirm') return { label: 'Confirmed', text: `${c.title}: ${d(c.to)} (was an estimate)` }
  if (c.kind === 'add') return { label: 'New', text: `${c.title}: ${d(c.to)}`, note: `counted under ${c.categoryName}` }
  if (c.kind === 'remove') return { label: 'Cancelled', text: c.title }
  return { label: 'No class', text: `${d(c.date)}` }
}

/** Build the store action for the chosen changes. */
export function toAction(changes, course) {
  const source = `Announcement pasted ${fmtShort(TODAY)}`
  const dates = {}
  const remove = []
  const add = []
  const events = []
  changes.forEach((c, i) => {
    if (c.kind === 'move' || c.kind === 'confirm') dates[c.id] = c.to
    if (c.kind === 'remove') remove.push(c.id)
    if (c.kind === 'add') add.push({ id: `${course.id}-u${Date.now().toString(36)}${i}`, courseId: course.id, categoryId: c.categoryId, title: c.title, type: c.type, date: c.to, points: 100, score: null, source })
    if (c.kind === 'event') events.push({ id: `${course.id}-ev${Date.now().toString(36)}${i}`, date: c.date, title: c.title, kind: 'closed', courseId: course.id })
  })
  return { type: 'applyUpdate', dates, remove, add, events, source }
}

export const UPDATE_SAMPLES = [
  {
    label: 'Calc announcement',
    text: `MATH 2413 announcement: Because of the holiday, the Calc midterm is moved to Monday, Nov 30. PSet 7 is now due Dec 7 instead of Dec 4. We'll also have a short quiz on Dec 2 covering series.`,
  },
  {
    label: 'CISC 3130 course-site post',
    text: `CISC 3130 update: Quiz 7 will be Tuesday, Dec 1. Homework 4 is now due Thursday, Dec 3 instead of Nov 24. The final exam is Thursday, Dec 17, 1:00–3:00 PM in New Ingersoll 329. No class on Tuesday, Dec 8 (I'm at a conference).`,
  },
]
