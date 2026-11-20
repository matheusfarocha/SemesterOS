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
| 5 | Smart Reminders | `features/reminders/reminders.service.js` | `TASK NIGHTLY_REMINDERS` (cron) runs SQL for deadlines ≤7d, exam clashes ≤48h, heavy weeks, grade-below-goal, absence limits → `REMINDERS` table |
| 6 | Semester Simulator | `features/simulator/simulator.service.js` | Snowpark Python stored proc `SIMULATE_SEMESTER(scenario VARIANT)` + `OPTIMIZE_HOURS` |

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
