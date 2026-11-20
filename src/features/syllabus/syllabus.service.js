const PALETTE = ['#fbbf24', '#22d3ee', '#fb7185', '#a3e635', '#f97316']

async function request(path, options) {
  const response = await fetch(`/api${path}`, options)
  const data = await response.json().catch(() => null)
  if (!response.ok || data == null) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : detail?.[0]?.msg
    throw new Error(message ?? 'The SemesterOS API is unavailable. Try again.')
  }
  return data
}

export function extractSyllabus(file) {
  const body = new FormData()
  body.append('file', file)
  return request('/syllabus/upload', { method: 'POST', body })
}

export function confirmSyllabus(uploadId, syllabus) {
  return request('/syllabus/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id: uploadId, syllabus }),
  })
}

export async function loadConfirmedSyllabi(signal) {
  const options = { signal }
  const courses = await request('/courses', options)
  if (!courses.length) return []
  const [events, ...grading] = await Promise.all([
    request('/events', options),
    ...courses.map(({ id }) => request(`/courses/${id}/grading`, options)),
  ])
  return courses.map((course, i) => ({
    course,
    events: events.filter((event) => event.course_id === course.id),
    grading: grading[i],
  }))
}

export function toStoreRows({ course: row, events, grading }) {
  const { course, policies } = row
  const name = course.name ?? course.code ?? 'Unnamed course'
  const code = course.code ?? course.name ?? 'Course'
  return {
    course: {
      id: row.id,
      uploadId: row.upload_id,
      name,
      code,
      short: course.code ?? name,
      instructor: course.professor,
      email: course.email,
      contact: course.contact,
      semester: course.semester,
      schedule: course.meetings,
      officeHours: course.office_hours,
      description: course.description,
      credits: course.credits,
      color: PALETTE[parseInt(row.id.slice(0, 4), 16) % PALETTE.length],
      attendance: {
        policy: policies.attendance,
        maxAbsences: policies.absence_limit,
        penalty: policies.absence_penalty,
        absences: 0,
      },
      latePolicy: policies.late_work,
      policies,
      categories: grading.map(({ id, category, weight }) => ({ id, name: category, weight })),
    },
    assessments: events.map((event) => ({
      id: event.id,
      courseId: row.id,
      categoryId: event.grading_id,
      categoryName: event.grading_category,
      title: event.title,
      type: event.type,
      date: event.date,
      time: event.time,
      dateText: event.date_text,
      timeText: event.time_text,
      points: event.points,
      score: null,
    })),
  }
}
