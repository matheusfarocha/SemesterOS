import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ReactLenis, useLenis } from 'lenis/react'
import ChatWidget from '@/features/assistant/ChatWidget'
import Nav from './Nav'
import SettingsModal from './SettingsModal'
import { ROUTES } from './routes'
import './app.css'

// Smooth wheel/trackpad scrolling for the page. Skipped for people who ask for reduced motion.
const SMOOTH = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
// allowNestedScroll: inner panels (chat, agenda, modals) keep scrolling on their own
const LENIS_OPTIONS = { lerp: 0.1, allowNestedScroll: true, anchors: true }

/** Each page opens at the top instead of wherever the last one was scrolled to. */
function ScrollToTop() {
  const { pathname } = useLocation()
  const lenis = useLenis()
  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }, [pathname, lenis])
  return null
}

/** Keyed by path so each page replays its enter animation (see .page in app.css). */
function Page() {
  const { pathname } = useLocation()
  return (
    <main className="page" key={pathname}>
      <Routes>
        {ROUTES.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  )
}

export default function App() {
  const [settings, setSettings] = useState(false)
  return (
    <HashRouter>
      {SMOOTH && <ReactLenis root options={LENIS_OPTIONS} />}
      <ScrollToTop />
      <Nav onSettings={() => setSettings(true)} />
      <Page />
      <ChatWidget />
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </HashRouter>
  )
}
