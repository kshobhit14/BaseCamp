const router = require('express').Router();
const db = require('../config/db');
const { ah, fail, authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

const getProject = async (id, orgId) => {
  const [r] = await db.query('SELECT * FROM projects WHERE id=? AND org_id=?', [id, orgId]);
  if (!r[0]) throw fail(404, 'Project not found');
  return r[0];
};

// GET /api/projects
router.get('/', ah(async (req, res) => {
  const [rows] = await db.query(
    `SELECT p.*, t.name AS team_name, COUNT(k.id) AS task_count, SUM(k.status='done') AS done_count
     FROM projects p LEFT JOIN teams t ON t.id=p.team_id LEFT JOIN tasks k ON k.project_id=p.id
     WHERE p.org_id=? GROUP BY p.id ORDER BY p.created_at DESC`, [req.user.orgId]);
  res.json(rows);
}));

// POST /api/projects
router.post('/', authorize('admin', 'manager'), ah(async (req, res) => {
  const { name, description, teamId, deadline } = req.body;
  if (!name) throw fail(400, 'name required');
  const [r] = await db.query('INSERT INTO projects (org_id,team_id,name,description,deadline,created_by) VALUES (?,?,?,?,?,?)',
    [req.user.orgId, teamId || null, name, description || null, deadline || null, req.user.id]);
  res.status(201).json({ id: r.insertId, name });
}));

// GET /api/projects/:id
router.get('/:id', ah(async (req, res) => {
  const p = await getProject(req.params.id, req.user.orgId);
  const [tasks] = await db.query('SELECT id,title,status,priority,assigned_to,deadline FROM tasks WHERE project_id=?', [p.id]);
  res.json({ ...p, tasks });
}));

// PUT /api/projects/:id
router.put('/:id', authorize('admin', 'manager'), ah(async (req, res) => {
  const p = await getProject(req.params.id, req.user.orgId);
  const { name = p.name, description = p.description, teamId = p.team_id, deadline = p.deadline } = req.body;
  await db.query('UPDATE projects SET name=?,description=?,team_id=?,deadline=? WHERE id=?', [name, description, teamId, deadline, p.id]);
  res.json({ id: p.id, name });
}));

// DELETE /api/projects/:id
router.delete('/:id', authorize('admin'), ah(async (req, res) => {
  await getProject(req.params.id, req.user.orgId);
  await db.query('DELETE FROM projects WHERE id=?', [req.params.id]);
  res.status(204).end();
}));

module.exports = router;
