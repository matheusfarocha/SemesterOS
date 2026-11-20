import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import ChatWidget from '@/features/assistant/ChatWidget'
import Nav from './Nav'
import SettingsModal from './SettingsModal'
import { ROUTES } from './routes'
import './app.css'

export default function App() {
  const [settings, setSettings] = useState(false)
  return (
    <HashRouter>
      <Nav onSettings={() => setSettings(true)} />
      <main className="page">
        <Routes>
          {ROUTES.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ChatWidget />
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </HashRouter>
  )
}
