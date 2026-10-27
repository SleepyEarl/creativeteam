import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Header from '../components/Header'
import TaskModal from '../components/TaskModal'
import MembersModal from '../components/MembersModal'

const initials = (p) => (p?.full_name || p?.email || '?').slice(0, 2).toUpperCase()

function ColumnHeader({ column, count, onRename, onDelete }) {
  const [name, setName] = useState(column.name)
  useEffect(() => setName(column.name), [column.name])
  return (
    <div className="col-head">
      <input
        className="col-title"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== column.name && onRename(name.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="muted small">{count}</span>
      <button className="icon-btn small" title="Delete category" onClick={onDelete}>🗑</button>
    </div>
  )
}

function AddTask({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  if (!open)
    return <button className="add-card" onClick={() => setOpen(true)}>+ Add a task</button>
  return (
    <form
      className="add-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim()) onAdd(title.trim())
        setTitle('')
        setOpen(false)
      }}
    >
      <textarea autoFocus rows={2} placeholder="Task title…" value={title} maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit() }
          if (e.key === 'Escape') setOpen(false)
        }} />
      <div className="row">
        <button className="btn primary small">Add</button>
        <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

export default function Board() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [board, setBoard] = useState(null)
  const [columns, setColumns] = useState([])
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [openTaskId, setOpenTaskId] = useState(null)
  const [showMembers, setShowMembers] = useState(false)
  const [newCol, setNewCol] = useState('')
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const loadAll = useCallback(async () => {
    const [b, c, t, m] = await Promise.all([
      supabase.from('boards').select('*').eq('id', id).maybeSingle(),
      supabase.from('columns').select('*').eq('board_id', id).order('position'),
      supabase.from('tasks').select('*').eq('board_id', id).order('position'),
      supabase
        .from('board_members')
        .select('user_id, role, profile:profiles(id, email, full_name)')
        .eq('board_id', id),
    ])
    if (!b.data) return setNotFound(true)
    setBoard(b.data)
    setColumns(c.data || [])
    setTasks(t.data || [])
    setMembers(m.data || [])
  }, [id])

  useEffect(() => {
    loadAll()
    const channel = supabase
      .channel(`board-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `board_id=eq.${id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'columns', filter: `board_id=eq.${id}` }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_members', filter: `board_id=eq.${id}` }, (p) => {
        // if I was removed, leave the board
        if (p.eventType === 'DELETE') loadAll()
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id, loadAll])

  const isOwner = board?.owner_id === user?.id
  const memberById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.profile])), [members])
  const tasksByColumn = useMemo(() => {
    const map = Object.fromEntries(columns.map((c) => [c.id, []]))
    tasks.forEach((t) => map[t.column_id]?.push(t))
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.position - b.position))
    return map
  }, [columns, tasks])

  async function addTask(columnId, title) {
    const list = tasksByColumn[columnId] || []
    const position = (list[list.length - 1]?.position ?? 0) + 1000
    const { error } = await supabase
      .from('tasks')
      .insert({ board_id: id, column_id: columnId, title, position, created_by: user.id })
    if (error) setError(error.message)
    loadAll()
  }

  async function onDragEnd(result) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const destList = (tasksByColumn[destination.droppableId] || []).filter((t) => t.id !== draggableId)
    const prev = destList[destination.index - 1]
    const next = destList[destination.index]
    let position
    if (prev && next) position = (prev.position + next.position) / 2
    else if (prev) position = prev.position + 1000
    else if (next) position = next.position - 1000
    else position = 1000

    // optimistic update
    setTasks((ts) =>
      ts.map((t) => (t.id === draggableId ? { ...t, column_id: destination.droppableId, position } : t))
    )
    const { error } = await supabase
      .from('tasks')
      .update({ column_id: destination.droppableId, position })
      .eq('id', draggableId)
    if (error) {
      setError(error.message)
      loadAll()
    }
  }

  async function addColumn(e) {
    e.preventDefault()
    if (!newCol.trim()) return
    const position = (columns[columns.length - 1]?.position ?? 0) + 1000
    const { error } = await supabase.from('columns').insert({ board_id: id, name: newCol.trim(), position })
    if (error) setError(error.message)
    setNewCol('')
    loadAll()
  }

  async function renameColumn(colId, name) {
    await supabase.from('columns').update({ name }).eq('id', colId)
    loadAll()
  }

  async function deleteColumn(col) {
    const n = (tasksByColumn[col.id] || []).length
    const msg = n
      ? `Delete "${col.name}" and its ${n} task(s)? This cannot be undone.`
      : `Delete the empty category "${col.name}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('columns').delete().eq('id', col.id)
    if (error) setError(error.message)
    loadAll()
  }

  async function renameBoard() {
    const name = prompt('Board name', board.name)
    if (!name?.trim()) return
    await supabase.from('boards').update({ name: name.trim() }).eq('id', id)
    loadAll()
  }

  async function deleteBoard() {
    if (!confirm(`Delete the board "${board.name}" and everything in it? This cannot be undone.`)) return
    const { error } = await supabase.from('boards').delete().eq('id', id)
    if (error) return setError(error.message)
    navigate('/')
  }

  if (notFound)
    return (
      <>
        <Header back />
        <main className="page">
          <h2>Board not found</h2>
          <p className="muted">It may have been deleted, or you are no longer a member.</p>
        </main>
      </>
    )
  if (!board) return <div className="center muted">Loading…</div>

  const openTask = tasks.find((t) => t.id === openTaskId)

  return (
    <>
      <Header back title={board.name} />
      <div className="toolbar">
        <div className="avatars">
          {members.map((m) => (
            <span key={m.user_id} className="avatar" title={m.profile?.full_name || m.profile?.email}>
              {initials(m.profile)}
            </span>
          ))}
        </div>
        <button className="btn small" onClick={() => setShowMembers(true)}>👥 Members</button>
        {isOwner && <button className="btn small" onClick={renameBoard}>Rename</button>}
        {isOwner && <button className="btn small danger" onClick={deleteBoard}>Delete board</button>}
        {error && <span className="alert error inline" onClick={() => setError('')}>{error} ✕</span>}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="columns">
          {columns.map((col) => (
            <div className="column" key={col.id}>
              <ColumnHeader
                column={col}
                count={(tasksByColumn[col.id] || []).length}
                onRename={(name) => renameColumn(col.id, name)}
                onDelete={() => deleteColumn(col)}
              />
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    className={`task-list ${snapshot.isDraggingOver ? 'over' : ''}`}
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {(tasksByColumn[col.id] || []).map((t, index) => (
                      <Draggable key={t.id} draggableId={t.id} index={index}>
                        {(p, s) => (
                          <div
                            className={`task ${s.isDragging ? 'dragging' : ''}`}
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            onClick={() => setOpenTaskId(t.id)}
                          >
                            <div className="task-title">{t.title}</div>
                            <div className="task-meta">
                              {t.due_date && <span className="chip">📅 {t.due_date}</span>}
                              {t.assignee_id && (
                                <span className="avatar tiny" title={memberById[t.assignee_id]?.full_name || memberById[t.assignee_id]?.email}>
                                  {initials(memberById[t.assignee_id])}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
              <AddTask onAdd={(title) => addTask(col.id, title)} />
            </div>
          ))}

          <form className="column add-col" onSubmit={addColumn}>
            <input placeholder="+ New category…" value={newCol} maxLength={60}
              onChange={(e) => setNewCol(e.target.value)} />
            {newCol && <button className="btn primary small">Add</button>}
          </form>
        </div>
      </DragDropContext>

      {openTask && (
        <TaskModal
          key={openTask.id}
          task={openTask}
          columns={columns}
          members={members}
          currentUserId={user.id}
          onClose={() => setOpenTaskId(null)}
          onChanged={loadAll}
        />
      )}
      {showMembers && (
        <MembersModal
          board={board}
          members={members}
          isOwner={isOwner}
          currentUserId={user.id}
          onClose={() => setShowMembers(false)}
          onChanged={loadAll}
        />
      )}
    </>
  )
}
