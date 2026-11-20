import { TODAY, parseISO, daysBetween, relDays } from '@/shared/lib/dates'
import { letter } from '@/features/grades/grades.service'

/**
 * Expanding course panels: the open one shows a stat row, the rest collapse to a vertical label.
 * Desktop: columns animate (active 5fr, others 1fr). Phone: rows animate the same way.
 */
export default function CourseStrip({ courses, summaries, active, onSelect }) {
  const tracks = courses.map((c) => (c.id === active ? '5fr' : '1fr')).join(' ')

  return (
    <ul className="strip" style={{ '--tracks': tracks }}>
      {courses.map((c) => {
        const s = summaries[c.id]
        const isActive = c.id === active
        return (
          <li
            key={c.id}
            className="strip-card"
            data-active={isActive}
            style={{ '--c': c.color }}
            tabIndex={0}
            role="button"
            aria-pressed={isActive}
            aria-label={`${c.code} ${c.name}`}
            onClick={() => onSelect(c.id)}
            onFocus={() => onSelect(c.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(c.id)}
          >
            <div className="strip-collapsed">
              <span className="strip-vertical">{c.short}</span>
              <span className="strip-mini">{s.g.current == null ? '—' : Math.round(s.g.current)}</span>
            </div>

            <article className="strip-body">
              <div className="strip-title">
                <span className="cdot" style={{ background: c.color }} />
                <span className="strip-code">{c.code}</span>
              </div>
              <h3>{c.name}</h3>
              <dl className="stat-row">
                <div>
                  <dt>Grade</dt>
                  <dd>
                    {s.g.current == null ? '—' : `${s.g.current.toFixed(1)}%`} <span className="muted">{letter(s.g.current)}</span>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd className={`tone-${s.tone}`}>{s.label}</dd>
                </div>
                <div>
                  <dt>Next due</dt>
                  <dd>{s.next ? `${s.next.title} · ${relDays(daysBetween(TODAY, parseISO(s.next.date)))}` : 'Nothing upcoming'}</dd>
                </div>
              </dl>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
