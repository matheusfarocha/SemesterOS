# SemesterOS

AI-powered semester assistant. Gemini extracts structured syllabus data. Snowflake stores PDFs and confirmed records.

```bash
npm install
npm run dev     # http://localhost:5173
```

The initial demo data comes from `src/store/seed.js`, with the demo calendar anchored to Nov 20, 2026. Confirmed syllabi load from the Snowflake alongside the demo data. See [ARCHITECTURE.md](ARCHITECTURE.md) for the feature map.

| Feature | Page | Folder |
|---|---|---|
| Semester Dashboard | `/` Calendar | `src/features/dashboard/` |
| Courses overview | `/courses` | `src/features/courses/` |
| Smart Syllabus Upload | `/syllabus` | `src/features/syllabus/` |
| Grade Simulator | `/grades` | `src/features/grades/` |
| Semester Simulator | `/simulator` | `src/features/simulator/` |
| Smart Reminders | `/reminders` (+ widget on dashboard) | `src/features/reminders/` |
| AI Assistant | `/assistant` (+ floating chat on every page) | `src/features/assistant/` |

## Project structure

```
src/
├── main.jsx                 entry; loads shared/ui/base.css first
├── app/                     shell: App (router), Nav, routes table, SettingsModal
├── store/                   global state (useReducer + localStorage) and seed data
├── shared/
│   ├── lib/dates.js         date helpers, pinned TODAY
│   └── ui/                  Modal, PageHeader, TypeIcon, Snow tag, base.css (theme tokens)
└── features/<feature>/
    ├── <Feature>Page.jsx    the routed page
    ├── *.jsx                components only this feature uses
    ├── <feature>.service.js logic / mock Snowflake call: swap for a real API here
    └── <feature>.css        styles for this feature
```

To add a page, create `features/<name>/<Name>Page.jsx` and add one line to `src/app/routes.jsx`.
Import across features with the `@/` alias (e.g. `@/features/grades/grades.service`).

## Set up syllabus extraction

1. In Snowsight, open **Projects → Workspaces → + Add New → SQL File** in the account that contains `SEMESTEROS_API`. Select the `ACCOUNTADMIN` role. Paste the entire [setup script](backend/admin/setup.sql). If the backend uses a warehouse other than `COMPUTE_WH`, replace that identifier in the script with the same existing warehouse.
2. Run the whole file with **Cmd+Shift+Return** on macOS or **Ctrl+Shift+Enter** on Windows. Confirm each statement succeeds. The final `SHOW GRANTS` results should show warehouse, database, and schema usage, stage read and write, table select, insert and update, and the backend role assignment to the service user. After correcting a failed statement, rerun the entire script. See [Snowsight's Workspaces instructions](https://docs.snowflake.com/en/user-guide/ui-snowsight/workspaces-working).
3. Reuse the service user's key pair in the repository-root `.env`. Add `GEMINI_API_KEY` there and keep it server-side. The default model is `gemini-3.5-flash-lite`. Set `GEMINI_MODEL` to use another Gemini model that supports PDF input and structured JSON. See [the environment example](.env.example).

The setup script creates the database, schema, internal stage, and `SYLLABUS_UPLOADS` table if needed. It adds the `CONFIRMED` column to the earlier upload table when present. The backend uses the dedicated role with secondary roles disabled. Existing `PUBLIC` access applies. Previously saved SQLite data and legacy rows outside the new confirmed payload require a separate import.

From the repository root with Python 3.11 or newer:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest backend.test_syllabus backend.test_workspace -v
python -m backend.snowflake_smoke /path/to/test-syllabus.pdf --expect-code 'MATH 2410'
```

Use the course code printed in your test PDF. The smoke test sends the actual PDF directly to Gemini, checks staged-file access, and checks that the Snowflake persistence table is readable. It removes its own staged test file.

After the smoke test passes, start the API:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Run `npm run dev` in a second terminal. Vite proxies `/api` to the backend on port 8000. In `/syllabus`, select a PDF up to 10 MB, click **Extract with AI**, review the extracted information, and click **Add course to semester**. Dated events appear in Calendar, and events without exact dates appear under Agenda. Reload to verify Courses, Calendar, and Grades pick up the confirmed records. API documentation is available at `http://127.0.0.1:8000/docs`.

```bash
curl -fsS -F 'file=@/path/to/syllabus.pdf' http://127.0.0.1:8000/api/syllabus/upload > draft.json
jq '{upload_id, syllabus}' draft.json > reviewed.json
# Review and edit reviewed.json before confirming.
curl -fsS -H 'Content-Type: application/json' --data-binary @reviewed.json http://127.0.0.1:8000/api/syllabus/confirm
curl -fsS http://127.0.0.1:8000/api/courses
curl -fsS http://127.0.0.1:8000/api/events
curl -fsS "http://127.0.0.1:8000/api/courses/$(jq -r .upload_id draft.json)/grading"
```

Gemini returns a draft to the review screen. Snowflake stores the PDF and an upload receipt. Course, event, policy, and grading data is written to Snowflake only on confirmation. The backend serves one shared demo workspace. Keep it on localhost or behind authenticated access. Score entries, absence counts, tasks, and course visibility are browser-local.
