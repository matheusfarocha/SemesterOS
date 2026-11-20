// Demo data. Shapes mirror the Snowflake tables in ARCHITECTURE.md
// (COURSES, GRADE_CATEGORIES, ASSESSMENTS, TASKS, SYLLABUS_CHUNKS).

export const seed = {
  user: { name: 'Matheus' },

  // Non-graded calendar events: holidays, term deadlines. kind: closed | deadline | term | quirk
  events: [
    { id: 'e1', date: '2026-11-06', title: 'Last day to withdraw (W)', kind: 'deadline' },
    { id: 'e2', date: '2026-11-25', title: 'No classes', kind: 'closed' },
    { id: 'e3', date: '2026-11-26', title: 'College closed', kind: 'closed' },
    { id: 'e4', date: '2026-11-27', title: 'College closed', kind: 'closed' },
    { id: 'e5', date: '2026-12-15', title: 'Finals begin', kind: 'term' },
  ],

  courses: [
    {
      id: 'calc',
      code: 'MATH 2413',
      short: 'Calc',
      name: 'Calculus II',
      color: '#60a5fa',
      instructor: 'Dr. Elena Ruiz',
      email: 'eruiz@university.edu',
      officeHours: 'Tue/Thu 2:00–3:30pm, Math 214',
      schedule: 'MWF 9:00–9:50am',
      credits: 4,
      target: 90,
      attendance: { policy: 'More than 4 unexcused absences lowers the final grade by 2% per extra absence.', maxAbsences: 4, penalty: 2, absences: 2 },
      latePolicy: 'Problem sets accepted up to 48h late at -10% per day. Exams cannot be made up without documentation.',
      aiPolicy: 'AI tools may be used to check your understanding, but all submitted work must be your own.',
      rules: [
        'Problem sets accepted up to 48h late at -10% per day.',
        'Exams cannot be made up without documentation.',
        'Regrade requests must be submitted within one week of grades being returned.',
        'Calculators are not permitted on exams.',
      ],
      categories: [
        { id: 'calc-ps', name: 'Problem Sets', weight: 25 },
        { id: 'calc-mid', name: 'Midterms', weight: 40 },
        { id: 'calc-fin', name: 'Final Exam', weight: 35 },
      ],
    },
    {
      id: 'psy',
      code: 'PSY 1001',
      short: 'PSY',
      name: 'Intro to Psychology',
      color: '#f472b6',
      instructor: 'Prof. Daniel Okafor',
      email: 'dokafor@university.edu',
      officeHours: 'Mon 1:00–3:00pm, Social Sciences 120',
      schedule: 'TTh 11:00am–12:15pm',
      credits: 3,
      target: 85,
      attendance: { policy: 'Attendance is taken via clicker. You may miss 3 classes; each additional absence is -1% of the final grade.', maxAbsences: 3, penalty: 1, absences: 3 },
      latePolicy: 'Quizzes close at the deadline. No late submissions.',
      rules: [
        'Quizzes close at 11:59pm. No late submissions.',
        'Each absence after 3 is -1% of the final grade (clicker attendance).',
        'Extra credit: up to 2 SONA research studies, +1% each.',
      ],
      notes: [{ id: 'psy-n1', text: 'Participation (10%): graded on clicker attendance only, or also in-class questions?', resolved: false }],
      categories: [
        { id: 'psy-q', name: 'Chapter Quizzes', weight: 30 },
        { id: 'psy-p', name: 'Participation', weight: 10 },
        { id: 'psy-e', name: 'Exams', weight: 60 },
      ],
    },
    {
      id: 'arch',
      code: 'ARCH 2301',
      short: 'Arch',
      name: 'History of Architecture',
      color: '#a78bfa',
      instructor: 'Dr. Priya Natarajan',
      email: 'pnatarajan@university.edu',
      officeHours: 'Wed 10:00am–12:00pm, Design Hall 305',
      schedule: 'MW 2:00–3:15pm',
      credits: 3,
      target: 88,
      attendance: { policy: 'Attendance is required at all studio critiques. Missing a critique without notice is -5% on the related project.', maxAbsences: 2, penalty: 3, absences: 0 },
      latePolicy: 'Late projects lose one letter grade per day.',
      rules: [
        'Late projects lose one letter grade per day.',
        'Missing a studio critique without notice is -5% on the related project.',
        'Final project proposal had to be approved by Nov 13.',
      ],
      categories: [
        { id: 'arch-r', name: 'Reading Responses', weight: 20 },
        { id: 'arch-e', name: 'Exams', weight: 40 },
        { id: 'arch-p', name: 'Final Project', weight: 40 },
      ],
    },
    {
      id: 'engl',
      code: 'ENGL 1302',
      short: 'Essay',
      name: 'Composition & Rhetoric',
      color: '#34d399',
      instructor: 'Ms. Hannah Cole',
      email: 'hcole@university.edu',
      officeHours: 'Thu 3:30–5:00pm, Humanities 018',
      schedule: 'TTh 1:00–2:15pm',
      credits: 3,
      target: 90,
      attendance: { policy: 'Workshops count toward participation. More than 3 absences = participation capped at 50%.', maxAbsences: 3, penalty: 2, absences: 1 },
      latePolicy: 'One free 72-hour extension per semester. Otherwise -5% per day.',
      aiPolicy: 'Generative AI may be used for brainstorming only. Disclose any use in your reflection letter.',
      rules: [
        'One free 72-hour extension per semester. Otherwise -5% per day.',
        'More than 3 absences caps participation at 50%.',
        'Essay 2 needs 5+ scholarly sources in MLA format.',
      ],
      categories: [
        { id: 'engl-es', name: 'Essays', weight: 60 },
        { id: 'engl-w', name: 'Workshops', weight: 15 },
        { id: 'engl-port', name: 'Portfolio', weight: 25 },
      ],
    },
  ],

  // type: assignment | exam | project | quiz
  assessments: [
    // ---- Calculus
    { id: 'a1', courseId: 'calc', categoryId: 'calc-ps', title: 'Calc PSet 3', type: 'assignment', date: '2026-10-09', points: 100, score: 88 },
    { id: 'a2', courseId: 'calc', categoryId: 'calc-ps', title: 'Calc PSet 4', type: 'assignment', date: '2026-10-23', points: 100, score: 92 },
    { id: 'a3', courseId: 'calc', categoryId: 'calc-mid', title: 'Calc Midterm 1', type: 'exam', date: '2026-10-14', points: 100, score: 79 },
    { id: 'a4', courseId: 'calc', categoryId: 'calc-ps', title: 'Calc PSet 5', type: 'assignment', date: '2026-10-30', points: 100, score: 85 },
    { id: 'a5', courseId: 'calc', categoryId: 'calc-ps', title: 'Calc PSet 6', type: 'assignment', date: '2026-11-06', points: 100, score: 90 },
    { id: 'a6', courseId: 'calc', categoryId: 'calc-mid', title: 'Calc Midterm', type: 'exam', date: '2026-11-24', points: 100, score: null },
    { id: 'a7', courseId: 'calc', categoryId: 'calc-ps', title: 'Calc PSet 7', type: 'assignment', date: '2026-12-04', points: 100, score: null },
    { id: 'a8', courseId: 'calc', categoryId: 'calc-fin', title: 'Calc Final', type: 'exam', date: '2026-12-14', points: 100, score: null },

    // ---- Psychology
    { id: 'b1', courseId: 'psy', categoryId: 'psy-q', title: 'PSY Ch. 5 Quiz', type: 'quiz', date: '2026-10-07', points: 20, score: 17 },
    { id: 'b2', courseId: 'psy', categoryId: 'psy-e', title: 'PSY Exam 1', type: 'exam', date: '2026-10-15', points: 100, score: 74 },
    { id: 'b3', courseId: 'psy', categoryId: 'psy-q', title: 'PSY Ch. 6 Quiz', type: 'quiz', date: '2026-10-21', points: 20, score: 15 },
    { id: 'b4', courseId: 'psy', categoryId: 'psy-q', title: 'PSY Quiz', type: 'quiz', date: '2026-11-04', points: 20, score: 16 },
    { id: 'b5', courseId: 'psy', categoryId: 'psy-p', title: 'Participation', type: 'assignment', date: '2026-12-08', points: 100, score: null },
    { id: 'b6', courseId: 'psy', categoryId: 'psy-q', title: 'PSY Ch. 8', type: 'quiz', date: '2026-11-21', points: 20, score: null },
    { id: 'b7', courseId: 'psy', categoryId: 'psy-e', title: 'PSY Exam 2', type: 'exam', date: '2026-11-19', points: 100, score: null },
    { id: 'b8', courseId: 'psy', categoryId: 'psy-e', title: 'PSY Final', type: 'exam', date: '2026-12-10', points: 100, score: null, estimated: true, source: 'Syllabus says "Week 15"' },

    // ---- Architecture
    { id: 'c1', courseId: 'arch', categoryId: 'arch-r', title: 'Reading Resp. 3', type: 'assignment', date: '2026-10-12', points: 10, score: 9 },
    { id: 'c2', courseId: 'arch', categoryId: 'arch-r', title: 'Reading Resp. 4', type: 'assignment', date: '2026-10-26', points: 10, score: 10 },
    { id: 'c3', courseId: 'arch', categoryId: 'arch-e', title: 'Arch Exam', type: 'exam', date: '2026-11-09', points: 100, score: 91 },
    { id: 'c4', courseId: 'arch', categoryId: 'arch-p', title: 'Final Project', type: 'project', date: '2026-11-27', points: 100, score: null },
    { id: 'c5', courseId: 'arch', categoryId: 'arch-r', title: 'Reading Resp. 5', type: 'assignment', date: '2026-11-18', points: 10, score: null },
    { id: 'c6', courseId: 'arch', categoryId: 'arch-e', title: 'Arch Final Exam', type: 'exam', date: '2026-12-11', points: 100, score: null },

    // ---- English
    { id: 'd1', courseId: 'engl', categoryId: 'engl-es', title: 'Essay 1', type: 'assignment', date: '2026-10-02', points: 100, score: 86 },
    { id: 'd2', courseId: 'engl', categoryId: 'engl-w', title: 'Peer Workshop', type: 'assignment', date: '2026-10-20', points: 20, score: 20 },
    { id: 'd3', courseId: 'engl', categoryId: 'engl-es', title: 'Essay Draft', type: 'assignment', date: '2026-11-12', points: 100, score: 89 },
    { id: 'd4', courseId: 'engl', categoryId: 'engl-es', title: 'Essay 2 Final', type: 'assignment', date: '2026-11-22', points: 100, score: null },
    { id: 'd5', courseId: 'engl', categoryId: 'engl-port', title: 'Portfolio', type: 'project', date: '2026-12-09', points: 100, score: null },
  ],

  tasks: [
    { id: 't1', title: 'Finish Calculus PSet 5', due: '2026-11-17', done: true, courseId: 'calc' },
    { id: 't2', title: 'Review Arch notes', due: '2026-11-18', done: true, courseId: 'arch' },
    { id: 't3', title: 'Write Essay Draft', due: '2026-11-22', done: false, courseId: 'engl' },
    { id: 't4', title: 'Study PSY Chapter 8', due: '2026-11-21', done: false, courseId: 'psy' },
  ],
}

// Raw syllabus text per course. In Snowflake these get chunked into SYLLABUS_CHUNKS
// and indexed by a Cortex Search service; the assistant retrieves from them.
export const seedSyllabi = {
  calc: `MATH 2413 Calculus II. Instructor: Dr. Elena Ruiz. Grading: Problem Sets 25%, Midterms 40%, Final Exam 35%. The lowest problem set score is not dropped. Calculators are not permitted on exams. Midterm 2 covers sections 7.1–8.4: integration techniques, improper integrals and sequences. The final exam is cumulative. Regrade requests must be submitted within one week of grades being returned.`,
  psy: `PSY 1001 Introduction to Psychology. Chapter quizzes are online, open-note, 20 points each, and close at 11:59pm. Exams are closed-book and multiple choice. Exam 2 covers chapters 6–9. Extra credit: participate in up to 2 research studies via SONA for +1% each on your final grade.`,
  arch: `ARCH 2301 History of Architecture. The final project is a 10-page analysis of a building of your choice with original sketches. A project proposal must be approved by Nov 13. The final exam includes slide identification of 20 buildings from the course image list.`,
  engl: `ENGL 1302 Composition and Rhetoric. Essay 2 is a 2,000-word argumentative essay with at least five scholarly sources in MLA format. The Writing Center offers free 45-minute sessions. The final portfolio includes revised versions of both essays and a 500-word reflective letter.`,
}
