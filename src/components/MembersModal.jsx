import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function MembersModal({ board, members, isOwner, currentUserId, onClose, onChanged }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [invites, setInvites] = useState([])

  async function loadInvites() {
    if (!isOwner) return
    const { data } = await supabase.from('board_invites').select('*').eq('board_id', board.id)
    setInvites(data || [])
  }
  useEffect(() => {
    loadInvites()
  }, [])

  async function add(e) {
    e.preventDefault()
    setMsg('')
    setError('')
    const { data, error } = await supabase.rpc('add_member_by_email', {
      p_board: board.id,
      p_email: email,
    })
    if (error) return setError(error.message)
    setMsg(
      data === 'added'
        ? 'Member added.'
        : 'No account with that email yet. They will join this board automatically when they sign up with it.'
    )
    setEmail('')
    onChanged()
    loadInvites()
  }

  async function remove(userId) {
    if (!confirm('Remove this member from the board?')) return
    const { error } = await supabase.from('board_members').delete().eq('board_id', board.id).eq('user_id', userId)
    if (error) return setError(error.message)
    onChanged()
  }

  async function cancelInvite(id) {
    await supabase.from('board_invites').delete().eq('id', id)
    loadInvites()
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal small-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Members</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {isOwner && (
          <form onSubmit={add} className="row">
            <input type="email" required placeholder="teammate@email.com" value={email}
              onChange={(e) => setEmail(e.target.value)} />
            <button className="btn primary">Add</button>
          </form>
        )}
        {msg && <div className="alert ok">{msg}</div>}
        {error && <div className="alert error">{error}</div>}

        <ul className="list">
          {members.map((m) => (
            <li key={m.user_id}>
              <div>
                <strong>{m.profile?.full_name || m.profile?.email}</strong>
                <div className="muted small">{m.profile?.email} · {m.role}</div>
              </div>
              {m.role !== 'owner' && (isOwner || m.user_id === currentUserId) && (
                <button className="btn small danger" onClick={() => remove(m.user_id)}>
                  {m.user_id === currentUserId ? 'Leave' : 'Remove'}
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && invites.length > 0 && (
          <>
            <h4>Pending invites</h4>
            <ul className="list">
              {invites.map((i) => (
                <li key={i.id}>
                  <span>{i.email}</span>
                  <button className="btn small" onClick={() => cancelInvite(i.id)}>Cancel</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
