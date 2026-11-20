# SemesterOS

AI-powered semester assistant. Hackathon prototype on top of Snowflake (Cortex AI, Cortex Search, Tasks, Snowpark).

```bash
npm install
npm run dev     # http://localhost:5173
```

All six core features run in the browser against mock data (`src/data/seed.js`), with "today" pinned to Nov 20, 2026.
See [ARCHITECTURE.md](ARCHITECTURE.md) for how each one maps to Snowflake.

| Feature | Page | Folder |
|---|---|---|
| Semester Dashboard | `/` Calendar | `src/features/dashboard/` |
| Courses overview | `/courses` | `src/features/courses/` |
| Smart Syllabus Upload | `/syllabus` (try "Load sample syllabus") | `src/features/syllabus/` |
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

Data persists in localStorage. Settings (gear icon) → Reset demo data.
