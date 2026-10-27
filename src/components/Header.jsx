import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }

  useEffect(() => {
    if (!user) return
    load()
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const unread = items.filter((n) => !n.read).length

  async function markAllRead() {
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    load()
  }

  async function openItem(n) {
    if (!n.read) await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    setOpen(false)
    if (n.board_id) navigate(`/board/${n.board_id}`)
    load()
  }

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="Notifications">
        🔔{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link small" onClick={markAllRead}>Mark all read</button>}
          </div>
          {items.length === 0 && <div className="muted pad">Nothing yet.</div>}
          {items.map((n) => (
            <button key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <span>{n.message}</span>
              <span className="muted small">{timeAgo(n.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Header({ title, back }) {
  const { profile, user, signOut } = useAuth()
  return (
    <header className="header">
      <div className="header-left">
        {back && <Link to="/" className="link">← Boards</Link>}
        <Link to="/" className="brand">CT</Link>
        <span className="header-title">{title || 'Creative Team'}</span>
      </div>
      <div className="header-right">
        <NotificationBell />
        <span className="muted small hide-mobile">{profile?.full_name || user?.email}</span>
        <button className="btn small" onClick={signOut}>Log out</button>
      </div>
    </header>
  )
}
