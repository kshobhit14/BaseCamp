const router = require('express').Router();
const db = require('../config/db');
const { ah, fail, authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

const getTeam = async (id, orgId) => {
  const [r] = await db.query('SELECT * FROM teams WHERE id=? AND org_id=?', [id, orgId]);
  if (!r[0]) throw fail(404, 'Team not found');
  return r[0];
};

// GET /api/teams
router.get('/', ah(async (req, res) => {
  const [rows] = await db.query(
    `SELECT t.*, COUNT(tm.user_id) AS member_count FROM teams t
     LEFT JOIN team_members tm ON tm.team_id=t.id WHERE t.org_id=? GROUP BY t.id ORDER BY t.name`, [req.user.orgId]);
  res.json(rows);
}));

// POST /api/teams
router.post('/', authorize('admin', 'manager'), ah(async (req, res) => {
  const { name, description } = req.body;
  if (!name) throw fail(400, 'name required');
  const [r] = await db.query('INSERT INTO teams (org_id,name,description) VALUES (?,?,?)', [req.user.orgId, name, description || null]);
  res.status(201).json({ id: r.insertId, name, description });
}));

// GET /api/teams/:id
router.get('/:id', ah(async (req, res) => {
  const team = await getTeam(req.params.id, req.user.orgId);
  const [members] = await db.query(
    `SELECT u.id,u.name,u.email,u.role FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=?`, [team.id]);
  res.json({ ...team, members });
}));

// PUT /api/teams/:id
router.put('/:id', authorize('admin', 'manager'), ah(async (req, res) => {
  const t = await getTeam(req.params.id, req.user.orgId);
  const { name = t.name, description = t.description } = req.body;
  await db.query('UPDATE teams SET name=?, description=? WHERE id=?', [name, description, t.id]);
  res.json({ id: t.id, name, description });
}));

// DELETE /api/teams/:id
router.delete('/:id', authorize('admin'), ah(async (req, res) => {
  await getTeam(req.params.id, req.user.orgId);
  await db.query('DELETE FROM teams WHERE id=?', [req.params.id]);
  res.status(204).end();
}));

// POST /api/teams/:id/members
router.post('/:id/members', authorize('admin', 'manager'), ah(async (req, res) => {
  await getTeam(req.params.id, req.user.orgId);
  const [u] = await db.query('SELECT id FROM users WHERE id=? AND org_id=?', [req.body.userId, req.user.orgId]);
  if (!u[0]) throw fail(404, 'User not found in your organization');
  await db.query('INSERT IGNORE INTO team_members (team_id,user_id) VALUES (?,?)', [req.params.id, req.body.userId]);
  res.status(201).json({ teamId: +req.params.id, userId: req.body.userId });
}));

// DELETE /api/teams/:id/members/:userId
router.delete('/:id/members/:userId', authorize('admin', 'manager'), ah(async (req, res) => {
  await getTeam(req.params.id, req.user.orgId);
  await db.query('DELETE FROM team_members WHERE team_id=? AND user_id=?', [req.params.id, req.params.userId]);
  res.status(204).end();
}));

module.exports = router;
