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

## Feature → Snowflake mapping

| # | Feature | Prototype file | Snowflake piece |
|---|---------|----------------|-----------------|
| 1 | Smart Syllabus Upload | `features/syllabus/syllabus.service.js` (`extractSyllabus`) | `PUT` to `@SYLLABI` → `CORTEX.PARSE_DOCUMENT` → `CORTEX.COMPLETE` with JSON schema → `INSERT` into COURSES / GRADE_CATEGORIES / ASSESSMENTS; text chunked into SYLLABUS_CHUNKS |
| 2 | Semester Dashboard | `features/dashboard/`, `store/store.jsx` | `SELECT` from ASSESSMENTS, TASKS; workload view `V_WEEK_LOAD` |
| 3 | Grade Simulator | `features/grades/grades.service.js` | `V_COURSE_GRADES` view (weighted category averages); what-ifs computed client-side |
| 4 | AI Assistant | `features/assistant/assistant.service.js` | `CORTEX.SEARCH_PREVIEW('SYLLABUS_SEARCH', …)` for retrieval + SQL context (grades, deadlines) → `CORTEX.COMPLETE` |
| 5 | Smart Reminders | `features/reminders/reminders.service.js` | `TASK NIGHTLY_REMINDERS` (cron) runs SQL for deadlines ≤7d, exam clashes ≤48h, heavy weeks, grade-below-goal, absence limits → `REMINDERS` table |
| 6 | Semester Simulator | `features/simulator/simulator.service.js` | Snowpark Python stored proc `SIMULATE_SEMESTER(scenario VARIANT)` + `OPTIMIZE_HOURS` |

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

## Swapping a mock for the real thing

Each service already has an async signature, for example `extractSyllabus(text)` and `askAssistant(q, state)`.
To make one real, replace its body with `fetch('/api/…')` and keep the return shape the same, and the UI won't need changes.

## Open decisions (for today's 5–6pm sync)
- Backend: thin FastAPI (Python matches Snowpark) vs. Streamlit-in-Snowflake (fastest, but we lose this UI).
- Auth: single demo user vs. Snowflake OAuth.
- Which Cortex model to use for extraction and for chat.
