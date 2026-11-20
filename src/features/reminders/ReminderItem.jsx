import { Clock, FileText, GraduationCap, AlertTriangle, TrendingDown, CalendarClock } from 'lucide-react'

const KIND_ICON = { conflict: AlertTriangle, risk: TrendingDown, confirm: CalendarClock }

export default function ReminderItem({ r }) {
  const Icon = r.kind === 'deadline' ? (r.type === 'exam' ? Clock : r.type === 'project' ? GraduationCap : FileText) : KIND_ICON[r.kind]
  return (
    <li className={`reminder sev-${r.severity} k-${r.kind}`}>
      <span className="r-icon">
        <Icon size={20} />
      </span>
      <div>
        {r.kind === 'deadline' ? (
          <strong>
            {r.title} {r.prefix}
            <em>{r.emphasis}</em>
          </strong>
        ) : (
          <strong>{r.title}</strong>
        )}
        <span>{r.sub}</span>
      </div>
    </li>
  )
}
