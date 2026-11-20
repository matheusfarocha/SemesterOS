# SemesterOS: demo script (~4 min)

Setup: `npm run dev`, open http://localhost:5173, then gear icon → **Reset demo data**. "Today" is pinned to Fri Nov 20, 2026.

## 1. The problem (15s)
"Every class hands you a syllabus with different rules, and half the dates say 'Week 5' or 'TBD'. Students track it all in their heads."

## 2. Upload a real-format syllabus (60s)
Gear icon → **Upload syllabus** → **CISC 3130 (real format, anonymized)** → **Extract with AI**.

Point out:
- Grading is a "20% Quizzes" table, the schedule is in **week numbers**, and the final is **TBD**. We still turned it into dates.
- **"6 things to double-check"**: we never silently guess. Oct 13 follows a Monday schedule, so Homework 2 moved to Thursday. "4–6 assignments" vs 5 listed. Attendance is both 10% *and* a deduction.
- Every inferred date is tagged **estimated**, with where it came from ("Syllabus week 13").
- The **AI policy** and **important dates** (holidays, withdrawal deadline, finals window) are captured too.

Click **Add course to semester**.

## 3. Calendar: honest dates + difficulty that explains itself (60s)
Go to **Calendar**.
- Dashed **~ CISC** chips are estimated. Click **~ CISC Homework 4** → "Estimated date · Confirm date". It's also worth **4.0%** of the grade; start prep Sat Nov 21.
- Gray labels: *No classes*, *College closed* (Thanksgiving).
- Click the **red bar** on the week of Nov 15 → **"Why is this week heavy?"** Each item shows *% of grade × credits × below-goal boost*, with prep spread before the deadline. PSY Exam 2 dominates because it's 20% of a course you're below goal in.
- Heavy/light is relative to **your** semester (percentiles), not a fixed cutoff.

## 3b. Syllabi don't have everything (45s)
**Courses** → click the **PSY** panel: grade, status (*Stretch*) and what's due next. In the tabs below: **Grading** shows weight vs. your average per category; **To confirm** lists the open questions (estimated final, no AI policy, an unclear participation rule); **Rules** lists what can cost you points.
Click **Paste an update** → **Calc announcement** → **Find changes**: *Midterm moved Nov 24 → Nov 30, PSet 7 moved, new quiz Dec 2*. **Apply**. The calendar, reminders and workload all update.
Dashboard → **Focus this week**: "Spend most of your time on …", with the reason. **Plan it** adds a study task.

## 4. Reminders (30s)
Dashboard card → **View all**.
- **Confirm date: CISC Homework 4** is high priority because it's 4 days out and still estimated.
- **Crunch: Portfolio + PSY Final** (1 day apart). **Heavy 7 days ahead**, driven by Calc Midterm + Final Project.
- Risk alerts only fire for courses with real grades. A brand-new course isn't flagged on zero evidence.
- Click weeks in **Workload ahead** to see the breakdown.

## 5. Assistant knows the rules and won't break them (45s)
Chat bubble or **Assistant**:
- "Can I use AI in CISC?" → quotes the syllabus: LLM-assisted work is forbidden.
- "**write my CISC homework**" → declines, cites the policy, then helps plan: due date (estimated), % of grade, when to start, office hours.
- "When is the CISC final?" → "sometime Dec 15–21 · estimated, confirm on your course site".

## 6. What-if (30s)
**Grades**: each course shows a status (*On track / Stretch / Out of reach*) and one sentence on what it takes. Open **PSY**, slide PSY Final to 95: semester GPA updates at the top. Hit **Skip** on an item or add a missed class to see the cost.

## Close
"Every number on screen can explain where it came from. Next: Cortex `PARSE_DOCUMENT` + `COMPLETE` replace our parser (same JSON shape), and the workload math becomes a SQL view."
