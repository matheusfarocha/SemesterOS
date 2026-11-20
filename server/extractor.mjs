// Syllabus PDF -> structured facts, using Claude's native PDF input + structured outputs.
// Claude reports only what the syllabus says (week numbers, TBDs, weekly patterns);
// the app turns those into dates and marks them estimated (src/features/syllabus/syllabus.service.js).

import Anthropic from '@anthropic-ai/sdk'
import * as z from 'zod/v4'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

const Day = z.enum(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
const ItemType = z.enum(['assignment', 'quiz', 'exam', 'project'])
const IsoDate = z.string().describe('YYYY-MM-DD')

export const SyllabusFacts = z.object({
  course: z.object({
    code: z.string().describe('e.g. "CISC 3130", "MATH 1206"'),
    name: z.string(),
    term: z.string().nullable().describe('As printed, e.g. "Fall 2026"'),
    instructor: z.string().nullable(),
    email: z.string().nullable(),
    officeHours: z.string().nullable().describe('Times and location, one line'),
    classTimes: z.string().nullable().describe('Days and times, one line, e.g. "Tue/Thu 2:15–3:55 PM, New Ingersoll 329"'),
    credits: z.number().nullable(),
  }),
  meetingDays: z.array(Day),
  firstDay: IsoDate.nullable(),
  lastDay: IsoDate.nullable(),
  categories: z
    .array(
      z.object({
        name: z.string(),
        weight: z.number().describe('TOTAL percent of the final grade for the whole category (e.g. 2 midterms at 20% each = 40)'),
        count: z.number().nullable().describe('How many graded items, if stated'),
        countNote: z.string().nullable().describe('Verbatim count wording if it is a range or vague, e.g. "4-6"'),
      }),
    )
    .describe('Only categories that count toward the grade'),
  items: z
    .array(
      z.object({
        title: z.string().describe('Short, e.g. "Homework 3", "Midterm 1", "Final Exam"'),
        type: ItemType,
        category: z.string().nullable().describe('Name of the matching grading category'),
        date: IsoDate.nullable().describe('Only if the syllabus gives an actual date'),
        week: z.number().nullable().describe('Only if the syllabus gives a week number instead of a date'),
        tbd: z.boolean().describe('True if the syllabus says the date is TBD or "listed later"'),
      }),
    )
    .describe('Individually named graded items (exams, numbered homeworks, projects)'),
  recurring: z
    .array(
      z.object({
        title: z.string().describe('Singular, e.g. "Quiz", "Homework"'),
        type: ItemType,
        category: z.string().nullable(),
        weekday: Day.describe('Day it happens or is due'),
      }),
    )
    .describe('Weekly patterns stated in the syllabus, e.g. "quiz each Wednesday", "homework due Sundays"'),
  attendance: z.object({
    countsTowardGrade: z.boolean().nullable(),
    freeAbsences: z.number().nullable(),
    penaltyPercent: z.number().nullable().describe('Percent of final grade lost per absence beyond the free ones'),
    policy: z.string().nullable().describe('One or two plain sentences'),
  }),
  latePolicy: z.string().nullable(),
  aiPolicy: z.string().nullable().describe('What the syllabus says about AI / LLM use, if anything'),
  rules: z.array(z.string()).describe('Up to 8 short plain-language rules that can cost the student points'),
  importantDates: z.array(
    z.object({
      date: IsoDate,
      title: z.string(),
      kind: z.enum(['closed', 'deadline', 'term', 'schedule_change']).describe('closed = no class; schedule_change = e.g. "follows Monday schedule"'),
    }),
  ),
  finalsWindow: z.object({ start: IsoDate, end: IsoDate }).nullable(),
  ambiguities: z.array(z.string()).describe('Things the student should double-check: conflicts, vague counts, missing dates'),
})

const PROMPT = `Extract the facts from this course syllabus.

Context: today is {TODAY}; the student is in the {TERM} semester. Write every date as YYYY-MM-DD.

Rules:
- Never invent dates. If the syllabus gives a week number, fill "week" and leave "date" null. If it says TBD or "on the dates listed later", set "tbd". If something happens weekly ("quiz each Wednesday", "due Sundays"), put it in "recurring" instead of listing guesses.
- Category weights are the total for the category ("20% each" for 2 midterms = 40).
- If anything conflicts (e.g. the printed term doesn't match the schedule dates, weights don't add to 100, a count is a range), say so in "ambiguities".
- Keep policies and rules short and in plain language a student understands.`

const client = new Anthropic() // credentials from ANTHROPIC_API_KEY (server side only)

/** @param {string} pdfBase64 @returns {Promise<z.infer<typeof SyllabusFacts>>} */
export async function extractSyllabusFacts(pdfBase64, { today, term }) {
  const msg = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // If a request is ever declined, the API retries it on a fallback model inside the same call
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(SyllabusFacts) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: PROMPT.replace('{TODAY}', today).replace('{TERM}', term) },
        ],
      },
    ],
  })

  if (msg.stop_reason === 'refusal') throw new ExtractError('The model declined to read this document.', 422)
  if (msg.stop_reason === 'max_tokens') throw new ExtractError('The syllabus was too long to extract in one pass.', 422)
  if (!msg.parsed_output) throw new ExtractError('Could not read structured data from this syllabus.', 502)
  return msg.parsed_output
}

export class ExtractError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
