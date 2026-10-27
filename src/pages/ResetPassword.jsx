import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

export default function ResetPassword() {
  const { session, loading, clearRecovering } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    setDone(true)
    clearRecovering()
    setTimeout(() => navigate('/'), 1500)
  }

  if (loading) return <div className="center muted">Loading…</div>

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="brand big">CT</div>
        <h2>Set a new password</h2>
        {!session ? (
          <>
            <div className="alert error">
              This reset link is invalid or has expired. Please request a new one.
            </div>
            <Link to="/forgot-password" className="link small">Request a new link</Link>
          </>
        ) : done ? (
          <div className="alert ok">Password updated! Taking you to your boards…</div>
        ) : (
          <>
            <label>
              New password
              <input type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              Confirm new password
              <input type="password" required minLength={8} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </>
        )}
      </form>
    </div>
  )
}
