# SemesterOS — Architecture

The React UI uses FastAPI for syllabus uploads and confirmed records. FastAPI sends PDF bytes directly to Gemini for structured extraction. The other feature services use the browser store for demo behavior.

```
React (Vite) → FastAPI → Gemini API: extract and validate structured drafts
                       → Snowflake stage: @SEMESTEROS.APP.SYLLABI
                       → Snowflake table: upload receipts and confirmed courses
```

## Feature → Snowflake mapping

| # | Feature | Prototype file | Snowflake piece |
|---|---------|----------------|-----------------|
| 1 | Smart Syllabus Upload | `features/syllabus/syllabus.service.js` | Gemini extracts the draft, the PDF is staged, and confirmation writes a Snowflake record |
| 2 | Semester Dashboard | `features/dashboard/`, `store/store.jsx` | `SELECT` from ASSESSMENTS, TASKS; workload view `V_WEEK_LOAD` |
| 3 | Grade Simulator | `features/grades/grades.service.js` | `V_COURSE_GRADES` view (weighted category averages); what-ifs computed client-side |
| 4 | AI Assistant | `features/assistant/assistant.service.js` | `CORTEX.SEARCH_PREVIEW('SYLLABUS_SEARCH', …)` for retrieval + SQL context (grades, deadlines) → `CORTEX.COMPLETE` |
| 5 | Smart Reminders | `features/reminders/reminders.service.js`, `features/workload/workload.service.js` | `TASK NIGHTLY_REMINDERS` (cron) runs SQL for deadlines ≤7d, exam clashes ≤48h, heavy weeks, grade-below-goal, absence limits → `REMINDERS` table |
| 6 | Semester Simulator | `features/grades/` (what-ifs roll up into semester GPA), `features/workload/FocusCard.jsx` (study-time focus) | SQL over V_COURSE_GRADES; Snowpark proc `RECOMMEND_FOCUS()` |
| + | Paste an update | `features/updates/updates.service.js` | `CORTEX.COMPLETE` with the course's ASSESSMENTS as context → JSON diff (add / move / confirm / cancel / no-class) |
| + | Unknowns + rules | `features/courses/unknowns.service.js`, rules from the syllabus policies | View over estimated/undated ASSESSMENTS + COURSE_NOTES |

## Syllabus storage

[The Snowflake setup script](backend/admin/setup.sql) provisions the stage, persistence table, and service role. [The standalone smoke test](backend/snowflake_smoke.py) checks Gemini and Snowflake without starting the app.

A successful upload records PDF metadata in `SYLLABUS_UPLOADS` and returns the draft to the frontend for review. Confirmation writes the reviewed course, events, and grading into one Snowflake row. It only updates the original upload receipt, so retries return the already-confirmed data. The read APIs return confirmed records. Partial or ambiguous dates retain source text and a null calendar date until reviewed.

## Proposed tables for other features

```sql
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

## Trust rules

- **Review before saving.** Gemini's extraction is a draft. Nothing is written to Snowflake until the student reviews
  and confirms it (`/api/syllabus/confirm`).
- **Never silently guess dates.** The backend keeps `date_text` verbatim and only fills `date` when it is unambiguous
  (`backend/syllabus.py`). Items without an exact date stay undated ("Events without an exact date" in Agenda,
  "To confirm" on Courses). Estimated dates (from pasted updates or manual items) are dashed with a **Confirm date** action.
- **No made-up numbers.** Missing weights, points, goals or absence limits are shown as unknown, not defaulted;
  those items are left out of what-ifs and workload rather than counted at a guessed value.
- **No risk without evidence.** Courses with no graded work or no goal don't get risk alerts or risk boosts.
- **Academic integrity.** The assistant quotes each course's AI policy and declines to produce graded work,
  then helps plan it instead (due date, % of grade, prep start, office hours).
- **Privacy.** Real syllabi contain real names; keep PDFs and keys out of git (`.env`, `samples/private/`).
