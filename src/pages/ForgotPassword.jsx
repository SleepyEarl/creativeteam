import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="center">
      <form className="card auth" onSubmit={submit}>
        <div className="brand big">CT</div>
        <h2>Forgot password</h2>
        {sent ? (
          <div className="alert ok">
            If that email has an account, a reset link is on its way. Check your inbox (and spam).
          </div>
        ) : (
          <>
            <p className="muted small">Enter your email and we'll send you a reset link.</p>
            <label>
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </>
        )}
        <Link to="/login" className="link small">Back to log in</Link>
      </form>
    </div>
  )
}
