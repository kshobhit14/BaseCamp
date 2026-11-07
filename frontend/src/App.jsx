import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

const NEXT = { todo: ['in_progress'], in_progress: ['todo', 'in_review'], in_review: ['in_progress', 'done'], done: ['in_progress'] };
const fmt = (s) => s.replace('_', ' ');
const useForm = (init) => { const [v, set] = useState(init); return [v, (k) => (e) => set({ ...v, [k]: e.target.value }), set]; };

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, on] = useForm({ orgName: '', name: '', email: 'admin@demo.com', password: 'password123' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const d = await api(`/auth/${mode}`, 'POST', f);
      localStorage.setItem('token', d.token); onAuth(d.user);
    } catch (e) { setErr(e.message); }
  };
  return (
    <form className="card auth" onSubmit={submit}>
      <h2>Basecamp {mode === 'login' ? 'Login' : 'Register'}</h2>
      {mode === 'register' && <><input placeholder="Organization name" value={f.orgName} onChange={on('orgName')} /><input placeholder="Your name" value={f.name} onChange={on('name')} /></>}
      <input placeholder="Email" value={f.email} onChange={on('email')} />
      <input type="password" placeholder="Password" value={f.password} onChange={on('password')} />
      {err && <div className="error">{err}</div>}
      <button className="primary">{mode === 'login' ? 'Login' : 'Create organization'}</button>{' '}
      <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); }}>
        {mode === 'login' ? 'New? Register' : 'Have an account? Login'}</a>
    </form>
  );
}

function Dashboard() {
  const [s, setS] = useState(null);
  useEffect(() => { api('/dashboard/stats').then(setS); }, []);
  if (!s) return null;
  const c = (st) => s.tasksByStatus.find((x) => x.status === st)?.count || 0;
  return (
    <div className="stats">
      {['todo', 'in_progress', 'in_review', 'done'].map((st) => <div className="stat" key={st}><b>{c(st)}</b>{fmt(st)}</div>)}
      <div className="stat"><b className="overdue">{s.overdue}</b>overdue</div>
      <div className="stat"><b>{s.projects}</b>projects</div>
      <div className="stat"><b>{s.teams}</b>teams</div>
      <div className="stat"><b>{s.members}</b>members</div>
    </div>
  );
}

function Tasks({ user }) {
  const canManage = user.role !== 'member';
  const [tasks, setTasks] = useState([]); const [projects, setProjects] = useState([]); const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState(''); const [err, setErr] = useState('');
  const [f, on, setF] = useForm({ title: '', projectId: '', assignedTo: '', priority: 'medium', deadline: '' });
  const load = useCallback(() => api('/tasks' + (filter ? `?status=${filter}` : '')).then(setTasks), [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/projects').then(setProjects); if (canManage) api('/users').then(setUsers); }, [canManage]);
  const guard = (fn) => async (...a) => { setErr(''); try { await fn(...a); load(); } catch (e) { setErr(e.message); } };
  const create = guard(async (e) => { e.preventDefault(); await api('/tasks', 'POST', f); setF({ ...f, title: '' }); });
  const setStatus = guard((id, status) => api(`/tasks/${id}/status`, 'PATCH', { status }));
  const assign = guard((id, assignedTo) => api(`/tasks/${id}/assign`, 'PATCH', { assignedTo: assignedTo || null }));
  const del = guard((id) => api(`/tasks/${id}`, 'DELETE'));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Dashboard />
      {canManage && (
        <form className="card row" onSubmit={create}>
          <input placeholder="Task title" value={f.title} onChange={on('title')} required />
          <select value={f.projectId} onChange={on('projectId')} required><option value="">Project…</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={f.assignedTo} onChange={on('assignedTo')}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <select value={f.priority} onChange={on('priority')}><option>low</option><option>medium</option><option>high</option></select>
          <input type="date" value={f.deadline} onChange={on('deadline')} />
          <button className="primary">Add task</button>
        </form>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All statuses</option>{Object.keys(NEXT).map((s) => <option key={s} value={s}>{fmt(s)}</option>)}</select>
        {err && <span className="error">{err}</span>}
      </div>
      {tasks.map((t) => (
        <div className="card row between" key={t.id}>
          <div><b>{t.title}</b> <span className={`badge ${t.priority}`}>{t.priority}</span><br />
            <small>{t.project_name} · {t.assignee_name || 'Unassigned'} · <span className={t.deadline && t.deadline < today && t.status !== 'done' ? 'overdue' : ''}>{t.deadline || 'no deadline'}</span></small></div>
          <div className="row">
            <span className="badge">{fmt(t.status)}</span>
            <select value="" onChange={(e) => setStatus(t.id, e.target.value)}><option value="">Move to…</option>{NEXT[t.status].map((s) => <option key={s} value={s}>{fmt(s)}</option>)}</select>
            {canManage && <select value={t.assigned_to || ''} onChange={(e) => assign(t.id, e.target.value)}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
            {canManage && <button className="danger" onClick={() => del(t.id)}>Delete</button>}
          </div>
        </div>
      ))}
      {!tasks.length && <div className="card">No tasks found.</div>}
    </>
  );
}

function Projects({ user }) {
  const [list, setList] = useState([]); const [teams, setTeams] = useState([]); const [err, setErr] = useState('');
  const [f, on, setF] = useForm({ name: '', description: '', teamId: '', deadline: '' });
  const load = () => api('/projects').then(setList);
  useEffect(() => { load(); api('/teams').then(setTeams); }, []);
  const create = async (e) => { e.preventDefault(); setErr(''); try { await api('/projects', 'POST', f); setF({ name: '', description: '', teamId: '', deadline: '' }); load(); } catch (e) { setErr(e.message); } };
  const del = async (id) => { try { await api(`/projects/${id}`, 'DELETE'); load(); } catch (e) { setErr(e.message); } };
  return (
    <>
      {user.role !== 'member' && (
        <form className="card row" onSubmit={create}>
          <input placeholder="Project name" value={f.name} onChange={on('name')} required />
          <input placeholder="Description" value={f.description} onChange={on('description')} />
          <select value={f.teamId} onChange={on('teamId')}><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input type="date" value={f.deadline} onChange={on('deadline')} /><button className="primary">Add project</button>
        </form>
      )}
      {err && <div className="error">{err}</div>}
      {list.map((p) => (
        <div className="card row between" key={p.id}>
          <div><b>{p.name}</b><br /><small>{p.description} · Team: {p.team_name || '—'} · Due {p.deadline || '—'} · {p.done_count || 0}/{p.task_count} tasks done</small></div>
          {user.role === 'admin' && <button className="danger" onClick={() => del(p.id)}>Delete</button>}
        </div>
      ))}
    </>
  );
}

function Teams({ user }) {
  const [teams, setTeams] = useState([]); const [users, setUsers] = useState([]); const [detail, setDetail] = useState({});
  const [name, setName] = useState(''); const [err, setErr] = useState('');
  const canManage = user.role !== 'member';
  const load = () => api('/teams').then(setTeams);
  useEffect(() => { load(); if (canManage) api('/users').then(setUsers); }, [canManage]);
  const guard = (fn) => async (...a) => { setErr(''); try { await fn(...a); load(); } catch (e) { setErr(e.message); } };
  const create = guard(async (e) => { e.preventDefault(); await api('/teams', 'POST', { name }); setName(''); });
  const show = async (id) => setDetail({ ...detail, [id]: await api(`/teams/${id}`) });
  const addM = guard(async (id, userId) => { if (userId) { await api(`/teams/${id}/members`, 'POST', { userId: +userId }); await show(id); } });
  const rmM = guard(async (id, uid) => { await api(`/teams/${id}/members/${uid}`, 'DELETE'); await show(id); });
  const del = guard((id) => api(`/teams/${id}`, 'DELETE'));
  return (
    <>
      {canManage && <form className="card row" onSubmit={create}><input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required /><button className="primary">Add team</button></form>}
      {err && <div className="error">{err}</div>}
      {teams.map((t) => (
        <div className="card" key={t.id}>
          <div className="row between"><div><b>{t.name}</b> <small>({t.member_count} members)</small></div>
            <div className="row"><button onClick={() => show(t.id)}>View members</button>{user.role === 'admin' && <button className="danger" onClick={() => del(t.id)}>Delete</button>}</div></div>
          {detail[t.id] && <div style={{ marginTop: 10 }}>
            {detail[t.id].members.map((m) => <div className="row" key={m.id}>{m.name} <span className="badge">{m.role}</span>{canManage && <button className="danger" onClick={() => rmM(t.id, m.id)}>Remove</button>}</div>)}
            {canManage && <select value="" onChange={(e) => addM(t.id, e.target.value)}><option value="">Add member…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
          </div>}
        </div>
      ))}
    </>
  );
}

function Users({ me }) {
  const [users, setUsers] = useState([]); const [err, setErr] = useState('');
  const [f, on, setF] = useForm({ name: '', email: '', password: '', role: 'member' });
  const load = () => api('/users').then(setUsers);
  useEffect(() => { load(); }, []);
  const guard = (fn) => async (...a) => { setErr(''); try { await fn(...a); load(); } catch (e) { setErr(e.message); } };
  const create = guard(async (e) => { e.preventDefault(); await api('/users', 'POST', f); setF({ name: '', email: '', password: '', role: 'member' }); });
  const role = guard((id, r) => api(`/users/${id}/role`, 'PATCH', { role: r }));
  const del = guard((id) => api(`/users/${id}`, 'DELETE'));
  return (
    <>
      {me.role === 'admin' && (
        <form className="card row" onSubmit={create}>
          <input placeholder="Name" value={f.name} onChange={on('name')} required /><input placeholder="Email" value={f.email} onChange={on('email')} required />
          <input type="password" placeholder="Password" value={f.password} onChange={on('password')} required />
          <select value={f.role} onChange={on('role')}><option>member</option><option>manager</option><option>admin</option></select><button className="primary">Add user</button>
        </form>
      )}
      {err && <div className="error">{err}</div>}
      {users.map((u) => (
        <div className="card row between" key={u.id}>
          <div><b>{u.name}</b> <small>{u.email}</small></div>
          <div className="row">
            {me.role === 'admin' && u.id !== me.id
              ? <><select value={u.role} onChange={(e) => role(u.id, e.target.value)}><option>member</option><option>manager</option><option>admin</option></select><button className="danger" onClick={() => del(u.id)}>Delete</button></>
              : <span className="badge">{u.role}</span>}
          </div>
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null); const [ready, setReady] = useState(false); const [tab, setTab] = useState('tasks');
  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api('/auth/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  if (!user) return <Auth onAuth={setUser} />;
  const tabs = [['tasks', 'Tasks'], ['projects', 'Projects'], ['teams', 'Teams'], ...(user.role !== 'member' ? [['users', 'Users']] : [])];
  return (
    <>
      <header>
        <h1>Basecamp</h1>
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
        <span className="spacer" />
        <span>{user.name} ({user.role})</span>
        <button onClick={() => { localStorage.removeItem('token'); setUser(null); }}>Logout</button>
      </header>
      <main>
        {tab === 'tasks' && <Tasks user={user} />}
        {tab === 'projects' && <Projects user={user} />}
        {tab === 'teams' && <Teams user={user} />}
        {tab === 'users' && <Users me={user} />}
      </main>
    </>
  );
}
