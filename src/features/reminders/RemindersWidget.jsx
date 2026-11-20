import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useStore } from '@/store/store'
import { generateReminders } from './reminders.service'
import ReminderItem from './ReminderItem'
import './reminders.css'

/** Compact reminders card shown on the dashboard. Full list lives on /reminders. */
export default function RemindersWidget({ limit = 4 }) {
  const { state } = useStore()
  const reminders = useMemo(() => generateReminders(state), [state])

  return (
    <section className="card side-card">
      <header className="side-head">
        <Bell size={22} />
        <h2>Reminders</h2>
        <span className="badge">{reminders.length}</span>
      </header>
      <ul className="reminders">
        {reminders.slice(0, limit).map((r) => (
          <ReminderItem key={r.id} r={r} />
        ))}
        {!reminders.length && <li className="muted">You're all caught up.</li>}
      </ul>
      {reminders.length > limit && (
        <Link className="link-btn center" to="/reminders">
          View all {reminders.length}
        </Link>
      )}
    </section>
  )
}
