import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { useStore } from '@/store/store'
import { Modal } from '@/shared/ui/ui'

export default function SettingsModal({ onClose }) {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="settings-row">
        <div>
          <strong>Syllabi</strong>
          <span className="muted small">{state.courses.length} uploaded · add a course by uploading its syllabus</span>
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            navigate('/syllabus')
            onClose()
          }}
        >
          <Upload size={16} /> Upload syllabus
        </button>
      </div>
      <label className="field">
        <span>Your name</span>
        <input value={state.user.name} onChange={(e) => dispatch({ type: 'setUser', patch: { name: e.target.value } })} />
      </label>
      <label className="field">
        <span>Weekly study hours available</span>
        <input type="number" value={state.user.weeklyStudyHours} onChange={(e) => dispatch({ type: 'setUser', patch: { weeklyStudyHours: Number(e.target.value) } })} />
      </label>
      <div className="modal-actions">
        <button
          className="btn ghost danger"
          onClick={() => {
            dispatch({ type: 'reset' })
            onClose()
          }}
        >
          Reset demo data
        </button>
        <span className="grow" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
