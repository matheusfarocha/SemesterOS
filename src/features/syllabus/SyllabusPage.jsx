import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, CheckCircle2 } from 'lucide-react'
import { useStore } from '@/store/store'
import { PageHeader } from '@/shared/ui/ui'
import SyllabusUploader from './SyllabusUploader'
import './syllabus.css'

export default function SyllabusPage() {
  const { state, syncError, refreshSyllabi } = useStore()
  const [added, setAdded] = useState(null)

  return (
    <>
      <PageHeader title="Smart Syllabus Upload" sub="Drop in a syllabus. We pull out deadlines, grading, attendance and policies." />
      {added && (
        <div className="flash">
          Added {added.name}. View its events on your <Link to="/">calendar</Link> and its grading policy in{' '}
          <Link to="/grades">Grades</Link>.
        </div>
      )}
      <div className="syllabus-layout">
        <SyllabusUploader onDone={(course) => { setAdded(course); refreshSyllabi() }} />
        <aside className="card side-card">
          <header className="side-head">
            <FileText size={20} />
            <h2>Your syllabi</h2>
            <span className="count">{state.courses.length}</span>
          </header>
          {syncError && (
            <p className="small warn">
              Couldn’t load saved syllabi. <button className="link-btn" onClick={refreshSyllabi}>Retry</button>
            </p>
          )}
          <ul className="syllabus-list">
            {state.courses.map((c) => (
              <li key={c.id}>
                <i className="cdot" style={{ background: c.color }} />
                <div>
                  <strong>{c.code}</strong>
                  <span className="muted small">
                    {c.categories.length} grade categories · {state.assessments.filter((a) => a.courseId === c.id).length} deadlines
                  </span>
                </div>
                <CheckCircle2 size={18} className="ok" />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  )
}
