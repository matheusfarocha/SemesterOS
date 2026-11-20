// Pinned "today" so the demo data always lines up. Swap for `new Date()` once data is live.
export const TODAY = new Date(2026, 10, 20)

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const startOfWeek = (d) => addDays(d, -d.getDay())
export const sameDay = (a, b) => iso(a) === iso(b)
export const daysBetween = (a, b) => Math.round((parseISO(iso(b)) - parseISO(iso(a))) / 86400000)

export const fmtShort = (d) => `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`
export const fmtMonthDay = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`

export function relDays(n) {
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n < 0) return `${-n} days ago`
  return `in ${n} days`
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// 6x7 grid of dates for a month view
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const start = startOfWeek(first)
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
}
