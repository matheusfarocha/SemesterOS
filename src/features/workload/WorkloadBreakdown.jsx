import { fmtMonthDay, parseISO } from '@/shared/lib/dates'
import { TypeIcon } from '@/shared/ui/ui'
import { ESTIMATE_DISCOUNT } from './workload.service'
import './workload.css'

const LEVEL_COPY = { heavy: 'Heavy', moderate: 'Moderate', light: 'Light', none: 'Clear' }

/** "Why is this week heavy?": the items driving a window's load, and the math behind each. */
export default function WorkloadBreakdown({ info, thresholds }) {
  const max = info.contributors[0]?.load || 1
  return (
    <div className="wl-breakdown">
      <div className="wl-summary">
        <span className={`wl-level l-${info.level}`}>{LEVEL_COPY[info.level]}</span>
        <span>
          <b>{info.score.toFixed(1)}</b> workload points in this window
        </span>
        <span className="muted small">
          your moderate ≥ {thresholds.moderate.toFixed(1)} · heavy ≥ {thresholds.heavy.toFixed(1)}
        </span>
      </div>
      {!info.contributors.length && <p className="muted">Nothing due or being prepped for.</p>}
      <ul>
        {info.contributors.map(({ item, load }) => (
          <li key={item.id}>
            <span className={`type-pill t-${item.type}`}>
              <TypeIcon type={item.type} />
            </span>
            <div className="wl-main">
              <div className="wl-title">
                <strong>{item.title}</strong>
                {item.estimated && <span className="est-tag">estimated</span>}
                <span className="muted small">
                  {item.course.short} · due {fmtMonthDay(parseISO(item.date))}
                </span>
              </div>
              <div className="wl-bar">
                <span style={{ width: `${(load / max) * 100}%`, background: item.course.color }} />
              </div>
              <span className="muted small">
                {item.impact == null ? `${item.baseLoad.toFixed(1)} estimated from item type` : `${item.impact.toFixed(1)}% of grade`}
                {' × '}{item.factors.credit.toFixed(2)} credit factor
                {item.factors.risk > 1.001 && <> × {item.factors.risk.toFixed(2)} below-goal</>}
                {item.estimated && <> × {ESTIMATE_DISCOUNT} estimated</>} · {item.prep}-day prep from {fmtMonthDay(parseISO(item.prepStart))}
              </span>
            </div>
            <b className="wl-load">{load.toFixed(1)}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
