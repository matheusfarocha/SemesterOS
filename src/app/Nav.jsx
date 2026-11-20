import { NavLink, useLocation } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useSlidingPill } from '@/shared/ui/useSlidingPill'
import { ROUTES } from './routes'

export default function Nav({ onSettings }) {
  const { pathname } = useLocation()
  // Pages not in the nav (e.g. /syllabus, /reminders) have no active tab, so the pill hides
  const [tabsRef, pillStyle] = useSlidingPill('.tab.active', pathname)

  return (
    <nav className="topnav">
      <span className="brand">SemesterOS</span>
      <span className="divider" />
      <div className="tabs" ref={tabsRef}>
        <span className="tab-pill" aria-hidden style={pillStyle} />
        {ROUTES.filter((r) => r.nav !== false).map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
      <span className="grow" />
      <button className="icon-btn" onClick={onSettings} aria-label="Settings">
        <Settings size={24} strokeWidth={1.8} />
      </button>
    </nav>
  )
}
