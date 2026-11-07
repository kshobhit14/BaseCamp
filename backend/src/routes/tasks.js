const router = require('express').Router();
const db = require('../config/db');
const { ah, fail, authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

// Allowed status transitions
const TRANSITIONS = {
  todo: ['in_progress'],
  in_progress: ['todo', 'in_review'],
  in_review: ['in_progress', 'done'],
  done: ['in_progress'],
};
const PRIORITIES = ['low', 'medium', 'high'];

const getTask = async (id, orgId) => {
  const [r] = await db.query('SELECT * FROM tasks WHERE id=? AND org_id=?', [id, orgId]);
  if (!r[0]) throw fail(404, 'Task not found');
  return r[0];
};
const checkAssignee = async (userId, orgId) => {
  if (!userId) return;
  const [u] = await db.query('SELECT id FROM users WHERE id=? AND org_id=?', [userId, orgId]);
  if (!u[0]) throw fail(400, 'Assignee not found in your organization');
};
const BASE = `SELECT k.*, p.name AS project_name, u.name AS assignee_name FROM tasks k
  JOIN projects p ON p.id=k.project_id LEFT JOIN users u ON u.id=k.assigned_to`;

// GET /api/tasks?status=&projectId=&assignedTo=&priority=   (members only see their own tasks)
router.get('/', ah(async (req, res) => {
  const where = ['k.org_id=?'], args = [req.user.orgId];
  const { status, projectId, assignedTo, priority } = req.query;
  if (req.user.role === 'member') { where.push('k.assigned_to=?'); args.push(req.user.id); }
  else if (assignedTo) { where.push('k.assigned_to=?'); args.push(assignedTo); }
  if (status) { where.push('k.status=?'); args.push(status); }
  if (projectId) { where.push('k.project_id=?'); args.push(projectId); }
  if (priority) { where.push('k.priority=?'); args.push(priority); }
  const [rows] = await db.query(`${BASE} WHERE ${where.join(' AND ')} ORDER BY k.deadline IS NULL, k.deadline`, args);
  res.json(rows);
}));

// GET /api/tasks/overdue   (deadline tracking)
router.get('/overdue', ah(async (req, res) => {
  const args = [req.user.orgId];
  let extra = '';
  if (req.user.role === 'member') { extra = ' AND k.assigned_to=?'; args.push(req.user.id); }
  const [rows] = await db.query(`${BASE} WHERE k.org_id=? AND k.deadline < CURDATE() AND k.status<>'done'${extra} ORDER BY k.deadline`, args);
  res.json(rows);
}));

// POST /api/tasks
router.post('/', authorize('admin', 'manager'), ah(async (req, res) => {
  const { title, description, projectId, assignedTo, priority = 'medium', deadline } = req.body;
  if (!title || !projectId) throw fail(400, 'title and projectId required');
  if (!PRIORITIES.includes(priority)) throw fail(400, 'Invalid priority');
  const [p] = await db.query('SELECT id FROM projects WHERE id=? AND org_id=?', [projectId, req.user.orgId]);
  if (!p[0]) throw fail(404, 'Project not found');
  await checkAssignee(assignedTo, req.user.orgId);
  const [r] = await db.query(
    'INSERT INTO tasks (org_id,project_id,title,description,priority,assigned_to,created_by,deadline) VALUES (?,?,?,?,?,?,?,?)',
    [req.user.orgId, projectId, title, description || null, priority, assignedTo || null, req.user.id, deadline || null]);
  res.status(201).json({ id: r.insertId, title, status: 'todo' });
}));

// GET /api/tasks/:id
router.get('/:id', ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  if (req.user.role === 'member' && t.assigned_to !== req.user.id) throw fail(403, 'Not your task');
  const [comments] = await db.query('SELECT c.*,u.name AS author FROM task_comments c JOIN users u ON u.id=c.user_id WHERE task_id=? ORDER BY c.created_at', [t.id]);
  const [history] = await db.query('SELECT h.*,u.name AS changed_by_name FROM task_status_history h JOIN users u ON u.id=h.changed_by WHERE task_id=? ORDER BY h.changed_at', [t.id]);
  res.json({ ...t, comments, history });
}));

// PUT /api/tasks/:id
router.put('/:id', authorize('admin', 'manager'), ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  const { title = t.title, description = t.description, priority = t.priority, deadline = t.deadline } = req.body;
  if (!PRIORITIES.includes(priority)) throw fail(400, 'Invalid priority');
  await db.query('UPDATE tasks SET title=?,description=?,priority=?,deadline=? WHERE id=?', [title, description, priority, deadline, t.id]);
  res.json({ id: t.id, title, priority, deadline });
}));

// PATCH /api/tasks/:id/status   (members may only update their own tasks)
router.patch('/:id/status', ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  const { status } = req.body;
  if (req.user.role === 'member' && t.assigned_to !== req.user.id) throw fail(403, 'You can only update your own tasks');
  if (!TRANSITIONS[t.status].includes(status))
    throw fail(400, `Invalid transition ${t.status} -> ${status}. Allowed: ${TRANSITIONS[t.status].join(', ')}`);
  await db.query('UPDATE tasks SET status=?, completed_at=? WHERE id=?', [status, status === 'done' ? new Date() : null, t.id]);
  await db.query('INSERT INTO task_status_history (task_id,changed_by,from_status,to_status) VALUES (?,?,?,?)', [t.id, req.user.id, t.status, status]);
  res.json({ id: t.id, from: t.status, status });
}));

// PATCH /api/tasks/:id/assign
router.patch('/:id/assign', authorize('admin', 'manager'), ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  const { assignedTo = null } = req.body;
  await checkAssignee(assignedTo, req.user.orgId);
  await db.query('UPDATE tasks SET assigned_to=? WHERE id=?', [assignedTo, t.id]);
  res.json({ id: t.id, assignedTo });
}));

// DELETE /api/tasks/:id
router.delete('/:id', authorize('admin', 'manager'), ah(async (req, res) => {
  await getTask(req.params.id, req.user.orgId);
  await db.query('DELETE FROM tasks WHERE id=?', [req.params.id]);
  res.status(204).end();
}));

// GET /api/tasks/:id/comments
router.get('/:id/comments', ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  const [rows] = await db.query('SELECT c.*,u.name AS author FROM task_comments c JOIN users u ON u.id=c.user_id WHERE task_id=? ORDER BY c.created_at', [t.id]);
  res.json(rows);
}));

// POST /api/tasks/:id/comments
router.post('/:id/comments', ah(async (req, res) => {
  const t = await getTask(req.params.id, req.user.orgId);
  if (!req.body.body) throw fail(400, 'body required');
  const [r] = await db.query('INSERT INTO task_comments (task_id,user_id,body) VALUES (?,?,?)', [t.id, req.user.id, req.body.body]);
  res.status(201).json({ id: r.insertId });
}));

module.exports = router;
