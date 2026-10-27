import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Header from '../components/Header'

export default function Boards() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('boards').select('*').order('created_at')
    if (error) setError(error.message)
    setBoards(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e) {
    e.preventDefault()
    if (!name.trim()) return
    const { data, error } = await supabase.rpc('create_board', { p_name: name.trim() })
    if (error) return setError(error.message)
    setName('')
    navigate(`/board/${data}`)
  }

  return (
    <>
      <Header />
      <main className="page">
        <h1>Your boards</h1>
        {error && <div className="alert error">{error}</div>}
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="board-grid">
            {boards.map((b) => (
              <Link key={b.id} to={`/board/${b.id}`} className="board-tile">
                {b.name}
              </Link>
            ))}
            <form className="board-tile new" onSubmit={create}>
              <input
                placeholder="New board name…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              <button className="btn primary small">Create</button>
            </form>
          </div>
        )}
        {!loading && boards.length === 0 && (
          <p className="muted">No boards yet. Create your first one, or ask a teammate to add your email to theirs.</p>
        )}
      </main>
    </>
  )
}
