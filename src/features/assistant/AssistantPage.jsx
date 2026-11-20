import { RotateCcw } from 'lucide-react'
import { useStore } from '@/store/store'
import { PageHeader, Snow } from '@/shared/ui/ui'
import { useAssistant } from './useAssistant'
import ChatThread from './ChatThread'
import './assistant.css'

export default function AssistantPage() {
  const { state } = useStore()
  const chat = useAssistant()

  return (
    <>
      <PageHeader title="AI Semester Assistant" sub="Answers grounded in your syllabi, grades and calendar.">
        <button className="btn ghost" onClick={chat.clear} disabled={chat.msgs.length < 2}>
          <RotateCcw size={16} /> New chat
        </button>
      </PageHeader>
      <div className="assistant-layout">
        <section className="card chat-page">
          <ChatThread {...chat} />
        </section>
        <aside className="card side-card">
          <header className="side-head">
            <h2>Knowledge sources</h2>
          </header>
          <ul className="kb">
            {state.courses.map((c) => (
              <li key={c.id}>
                <i className="cdot" style={{ background: c.color }} />
                <div>
                  <strong>{c.code} syllabus</strong>
                  <span className="muted small">{(state.syllabi[c.id] ?? '').split(/(?<=\.)\s+/).filter(Boolean).length} chunks indexed</span>
                </div>
              </li>
            ))}
            <li>
              <i className="cdot" style={{ background: 'var(--accent)' }} />
              <div>
                <strong>Grades & calendar</strong>
                <span className="muted small">{state.assessments.length} assessments via SQL</span>
              </div>
            </li>
          </ul>
          <Snow>Cortex Search · SYLLABUS_SEARCH</Snow>
        </aside>
      </div>
    </>
  )
}
