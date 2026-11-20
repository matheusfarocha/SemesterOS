import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload } from 'lucide-react'
import { useStore } from '@/store/store'
import { Modal } from '@/shared/ui/ui'

export default function SettingsModal({ onClose }) {
  const { state, dispatch, resetDemoData } = useStore()
  const navigate = useNavigate()
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleReset() {
    if (!window.confirm('Reset this browser and permanently delete all uploaded syllabi and courses from the shared workspace?')) return
    setResetting(true)
    setResetError('')
    try {
      await resetDemoData()
    } catch (error) {
      setResetError(`Couldn’t reset demo data. ${error.message}`)
      setResetting(false)
    }
  }

  return (
    <Modal title="Settings" onClose={() => { if (!resetting) onClose() }}>
      <div className="settings-row">
        <div>
          <strong>Syllabi</strong>
          <span className="muted small">{state.courses.filter((course) => course.uploadId).length} uploaded · add a course by uploading its syllabus</span>
        </div>
        <button
          className="btn ghost"
          disabled={resetting}
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
        <input disabled={resetting} value={state.user.name} onChange={(e) => dispatch({ type: 'setUser', patch: { name: e.target.value } })} />
      </label>
      {resetError && <p className="warn small" role="alert">{resetError}</p>}
      <div className="modal-actions">
        <button
          className="btn ghost danger"
          disabled={resetting}
          onClick={handleReset}
        >
          {resetting ? 'Resetting…' : 'Reset demo data'}
        </button>
        <span className="grow" />
        <button className="btn primary" disabled={resetting} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
