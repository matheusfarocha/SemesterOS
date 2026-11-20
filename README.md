# SemesterOS

AI-powered semester assistant. Hackathon prototype on top of Snowflake (Cortex AI, Cortex Search, Tasks, Snowpark).

```bash
npm install
npm run dev     # http://localhost:5173
```

All six core features run in the browser against mock data (`src/data/seed.js`), with "today" pinned to Nov 20, 2026.
See [ARCHITECTURE.md](ARCHITECTURE.md) for how each one maps to Snowflake, and [DEMO.md](DEMO.md) for the demo script.

| Feature | Page | Folder |
|---|---|---|
| Semester Dashboard | `/` Calendar | `src/features/dashboard/` |
| Courses overview | `/courses`: per course "What we know" % + unknowns, "Rules that can cost you points" | `src/features/courses/` |
| Paste an update | `/courses` → **Paste an update** (announcement → reviewed changes → calendar) | `src/features/updates/` |
| Smart Syllabus Upload | `/syllabus` (gear icon → Upload syllabus; try the CISC 3130 sample) | `src/features/syllabus/` |
| Grade + Semester Simulator | `/grades`: per-course status, "what do I need", what-if sliders, missed classes; what-ifs roll up into semester GPA | `src/features/grades/` |
| Smart Reminders | `/reminders` (via "View all" on the dashboard card) | `src/features/reminders/` |
| Workload / difficulty + Focus | calendar week bars (click for why), Reminders chart, **Focus this week** card | `src/features/workload/` |
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


## Reading real syllabus PDFs (Claude API)

PDF uploads go to a small local server that sends the file to Claude and gets back structured facts
(grading, dated/weekly/TBD items, policies, important dates, things to double-check). The app then turns
week numbers and weekly patterns into **estimated** dates; the model never invents dates.

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # .env is gitignored
npm run server                               # terminal 1: http://127.0.0.1:8787
npm run dev                                  # terminal 2: Vite proxies /api to the server
```

Then **Settings → Upload syllabus**, drop a PDF, **Extract with AI**, review, **Add course**.
To check a PDF from the terminal: `npm run extract -- samples/private/MySyllabus.pdf` (writes `*.extracted.json`).
Keep real syllabi in `samples/private/` (gitignored): they contain real names and emails.
Without a key the server still runs and the app falls back to pasted text.

Data persists in localStorage. Settings (gear icon) → Reset demo data.
