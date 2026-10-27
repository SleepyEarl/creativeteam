import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'

function fmt(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function TaskModal({ task, columns, members, currentUserId, onClose, onChanged }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [assignee, setAssignee] = useState(task.assignee_id || '')
  const [due, setDue] = useState(task.due_date || '')
  const [columnId, setColumnId] = useState(task.column_id)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  const nameOf = (uid) => {
    const m = members.find((x) => x.user_id === uid)
    return m?.profile?.full_name || m?.profile?.email || 'Former member'
  }

  async function loadComments() {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at')
    setComments(data || [])
  }

  useEffect(() => {
    loadComments()
    const channel = supabase
      .channel(`comments-${task.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `task_id=eq.${task.id}` }, loadComments)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [task.id])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  async function save() {
    if (!title.trim()) return setError('Title is required.')
    setSaving(true)
    setError('')
    const patch = {
      title: title.trim(),
      description,
      assignee_id: assignee || null,
      due_date: due || null,
    }
    if (columnId !== task.column_id) {
      // put at the end of the new category
      const { data } = await supabase
        .from('tasks')
        .select('position')
        .eq('column_id', columnId)
        .order('position', { ascending: false })
        .limit(1)
      patch.column_id = columnId
      patch.position = (data?.[0]?.position ?? 0) + 1000
    }
    const { error } = await supabase.from('tasks').update(patch).eq('id', task.id)
    setSaving(false)
    if (error) return setError(error.message)
    onChanged()
    onClose()
  }

  async function del() {
    if (!confirm('Delete this task? This cannot be undone.')) return
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) return setError(error.message)
    onChanged()
    onClose()
  }

  async function addComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    const { error } = await supabase.from('comments').insert({
      board_id: task.board_id,
      task_id: task.id,
      user_id: currentUserId,
      body: newComment.trim(),
    })
    if (error) return setError(error.message)
    setNewComment('')
    loadComments()
  }

  async function saveCommentEdit(id) {
    if (!editText.trim()) return
    await supabase.from('comments').update({ body: editText.trim() }).eq('id', id)
    setEditingId(null)
    loadComments()
  }

  async function deleteComment(id) {
    if (!confirm('Delete this comment?')) return
    await supabase.from('comments').delete().eq('id', id)
    loadComments()
  }

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Edit task</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-col">
            <label>Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </label>
            <label>Description
              <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="row">
              <label className="grow">Category
                <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
                  {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="grow">Assigned to
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || m.profile?.email}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>Due date
              <input type="date" value={due || ''} onChange={(e) => setDue(e.target.value)} />
            </label>
            {error && <div className="alert error">{error}</div>}
            <div className="row between">
              <button className="btn danger" onClick={del}>Delete task</button>
              <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </div>

          <div className="modal-col">
            <h4>Comments</h4>
            <div className="comments">
              {comments.length === 0 && <p className="muted small">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="comment">
                  <div className="small">
                    <strong>{nameOf(c.user_id)}</strong> <span className="muted">· {fmt(c.created_at)}</span>
                  </div>
                  {editingId === c.id ? (
                    <>
                      <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                      <div className="row">
                        <button className="btn small primary" onClick={() => saveCommentEdit(c.id)}>Save</button>
                        <button className="btn small" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="comment-body">{c.body}</div>
                      {c.user_id === currentUserId && (
                        <div className="row">
                          <button className="link small" onClick={() => { setEditingId(c.id); setEditText(c.body) }}>Edit</button>
                          <button className="link small" onClick={() => deleteComment(c.id)}>Delete</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <form onSubmit={addComment}>
              <textarea rows={2} placeholder="Write a comment…" value={newComment}
                onChange={(e) => setNewComment(e.target.value)} maxLength={2000} />
              <button className="btn primary small">Comment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
