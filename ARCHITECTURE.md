# SemesterOS — Architecture

Frontend prototype is live (`npm run dev`). Every feature calls a function in its `src/features/<feature>/<feature>.service.js`
that is a stand-in for one Snowflake capability, so we can swap mocks for real calls one at a time.

```
React (Vite)  ──►  API layer (FastAPI / Node, or Streamlit-in-Snowflake)  ──►  Snowflake
                                                                               ├─ Stage: @SYLLABI (raw PDFs)
                                                                               ├─ Tables (below)
                                                                               ├─ Cortex: PARSE_DOCUMENT, COMPLETE
                                                                               ├─ Cortex Search: SYLLABUS_SEARCH
                                                                               ├─ Task: NIGHTLY_REMINDERS
                                                                               └─ Snowpark proc: SIMULATE_SEMESTER
```

## Without Snowflake: Claude API path (implemented)

`server/extractor.mjs` sends the PDF to Claude (`claude-opus-5-5`, native PDF input, structured output via a Zod schema,
server-side refusal fallback). It returns raw facts only: dates when printed, otherwise week numbers, TBD flags, weekly
patterns. `fromExtraction()` in `src/features/syllabus/syllabus.service.js` resolves those into estimated dates using class
days, closures and schedule changes. The API key stays on the server (`.env`); Vite proxies `/api` in dev.

## Feature → Snowflake mapping

| # | Feature | Prototype file | Snowflake piece |
|---|---------|----------------|-----------------|
| 1 | Smart Syllabus Upload | `features/syllabus/syllabus.service.js` (`extractSyllabus`) | `PUT` to `@SYLLABI` → `CORTEX.PARSE_DOCUMENT` → `CORTEX.COMPLETE` with JSON schema → `INSERT` into COURSES / GRADE_CATEGORIES / ASSESSMENTS; text chunked into SYLLABUS_CHUNKS |
| 2 | Semester Dashboard | `features/dashboard/`, `store/store.jsx` | `SELECT` from ASSESSMENTS, TASKS; workload view `V_WEEK_LOAD` |
| 3 | Grade Simulator | `features/grades/grades.service.js` | `V_COURSE_GRADES` view (weighted category averages); what-ifs computed client-side |
| 4 | AI Assistant | `features/assistant/assistant.service.js` | `CORTEX.SEARCH_PREVIEW('SYLLABUS_SEARCH', …)` for retrieval + SQL context (grades, deadlines) → `CORTEX.COMPLETE` |
| 5 | Smart Reminders | `features/reminders/reminders.service.js`, `features/workload/workload.service.js` | `TASK NIGHTLY_REMINDERS` (cron) runs SQL for deadlines ≤7d, exam clashes ≤48h, heavy weeks, grade-below-goal, absence limits → `REMINDERS` table |
| 6 | Semester Simulator | `features/grades/` (what-ifs roll up into semester GPA), `features/workload/FocusCard.jsx` (study-time focus) | SQL over V_COURSE_GRADES; Snowpark proc `RECOMMEND_FOCUS()` |
| + | Paste an update | `features/updates/updates.service.js` | `CORTEX.COMPLETE` with the course's ASSESSMENTS as context → JSON diff (add / move / confirm / cancel / no-class) |
| + | Unknowns + rules | `features/courses/unknowns.service.js`, `rules` from syllabus extraction | View over estimated/undated ASSESSMENTS + COURSE_NOTES |

## Tables

```sql
CREATE TABLE COURSES (
  course_id STRING PRIMARY KEY, user_id STRING, code STRING, name STRING, credits INT,
  instructor STRING, email STRING, office_hours STRING, schedule STRING,
  attendance_policy STRING, max_absences INT, absence_penalty FLOAT, absences INT,
  late_policy STRING, target_pct FLOAT, color STRING
);
CREATE TABLE GRADE_CATEGORIES (category_id STRING, course_id STRING, name STRING, weight FLOAT);
CREATE TABLE ASSESSMENTS (
  assessment_id STRING, course_id STRING, category_id STRING, title STRING,
  type STRING,            -- assignment | exam | project | quiz
  due_date DATE, points FLOAT, score FLOAT NULL
);
CREATE TABLE TASKS (task_id STRING, user_id STRING, course_id STRING, title STRING, due_date DATE, done BOOLEAN);
CREATE TABLE SYLLABUS_CHUNKS (chunk_id STRING, course_id STRING, chunk STRING);
CREATE TABLE REMINDERS (reminder_id STRING, user_id STRING, kind STRING, severity STRING, title STRING, detail STRING, ref_date DATE, created_at TIMESTAMP);
```

### Grade view (feature 3)

```sql
CREATE VIEW V_COURSE_GRADES AS
WITH cat AS (
  SELECT a.course_id, a.category_id, g.weight,
         SUM(a.score) / NULLIF(SUM(IFF(a.score IS NOT NULL, a.points, 0)), 0) * 100 AS avg_pct
  FROM ASSESSMENTS a JOIN GRADE_CATEGORIES g USING (category_id)
  GROUP BY 1, 2, 3
)
SELECT course_id, SUM(weight * avg_pct) / SUM(weight) AS current_pct
FROM cat WHERE avg_pct IS NOT NULL GROUP BY 1;
```

### Syllabus extraction prompt (feature 1)

```sql
SELECT SNOWFLAKE.CORTEX.COMPLETE('claude-sonnet-4-5', CONCAT(
  'Extract JSON {code,name,instructor,email,office_hours,credits,',
  'categories:[{name,weight}], attendance:{policy,max_absences,penalty_pct}, late_policy,',
  'assessments:[{title,type,date,category}]} from this syllabus. Dates as YYYY-MM-DD.\n\n',
  SNOWFLAKE.CORTEX.PARSE_DOCUMENT(@SYLLABI, :file, {'mode':'LAYOUT'}):content::STRING));
```
Pick the model from what Cortex offers in our region.

### Reminders task (feature 5)

```sql
CREATE TASK NIGHTLY_REMINDERS WAREHOUSE = APP_WH SCHEDULE = 'USING CRON 0 6 * * * America/New_York'
AS CALL GENERATE_REMINDERS();
```

## Difficulty / workload model (`features/workload/workload.service.js`)

Unit: **grade-points at stake**. For each assessment:

```
load = gradeImpact × (credits / avg credits) × riskBoost × (estimated ? 0.8 : 1)
gradeImpact = category weight × item points / category points × (known items / expected items)
riskBoost   = 1 + min(0.5, (target − projected) / 20)   -- only when the course has real grades
```

Load is spread over a prep window before the due date (exam/project 7 days, cumulative final 10,
assignment 4, quiz 2), ramping up toward the deadline. Weeks are rated against the student's own
semester: heavy = top 25% of weeks, moderate = top 60%. Every score returns its contributors, so the UI can
show *why* a week is heavy. In Snowflake: `V_DAILY_LOAD` view over ASSESSMENTS + V_COURSE_GRADES.

## Trust rules (apply to the real Cortex pipeline too)

- **Never silently guess.** Inferred dates are `estimated` (week numbers resolved through meeting days,
  holidays and schedule changes; TBD finals placed in the finals window) and shown dashed with a
  **Confirm date** action. Upcoming estimated dates generate "Confirm date" reminders.
- **Flag bad reads.** If extraction misses the grading breakdown, class days, or can't date the schedule, it says so in red and confidence drops below 40%.
- **Surface ambiguity.** Extraction returns `ambiguities[]` (weights ≠ 100, count ranges vs. schedule,
  attendance that is both a category and a deduction, approximate schedules) shown before saving.
- **No risk without evidence.** Courses with no graded work don't get risk alerts or risk boosts.
- **Academic integrity.** The assistant quotes each course's AI policy and declines to produce graded work,
  then helps plan it instead (due date, % of grade, prep start, office hours).
- **Privacy.** Demo syllabi are anonymized. Real grades are student records; keep them in the student's account.



Each service already has an async signature, for example `extractSyllabus(text)` and `askAssistant(q, state)`.
To make one real, replace its body with `fetch('/api/…')` and keep the return shape the same, and the UI won't need changes.

## Open decisions (for today's 5–6pm sync)
- Backend: thin FastAPI (Python matches Snowpark) vs. Streamlit-in-Snowflake (fastest, but we lose this UI).
- Auth: single demo user vs. Snowflake OAuth.
- Which Cortex model to use for extraction and for chat.
