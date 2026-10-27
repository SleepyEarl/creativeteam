import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { configured } from './supabase'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Boards from './pages/Boards'
import Board from './pages/Board'

function Protected({ children }) {
  const { session, loading, recovering } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (recovering) return <Navigate to="/reset-password" replace />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function PublicOnly({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (session) return <Navigate to="/" replace />
  return children
}

export default function App() {
  if (!configured) {
    return (
      <div className="center">
        <div className="card">
          <h2>Setup needed</h2>
          <p className="muted">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your
            <code> .env</code> file (or to your hosting environment variables), then restart.
          </p>
        </div>
      </div>
    )
  }
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<Protected><Boards /></Protected>} />
      <Route path="/board/:id" element={<Protected><Board /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
