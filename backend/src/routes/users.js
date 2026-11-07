const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { ah, fail, authenticate, authorize } = require('../middleware/auth');
router.use(authenticate);

const ROLES = ['admin', 'manager', 'member'];

// GET /api/users
router.get('/', authorize('admin', 'manager'), ah(async (req, res) => {
  const [rows] = await db.query('SELECT id,name,email,role,created_at FROM users WHERE org_id=? ORDER BY name', [req.user.orgId]);
  res.json(rows);
}));

// POST /api/users  (admin adds a member to the organization)
router.post('/', authorize('admin'), ah(async (req, res) => {
  const { name, email, password, role = 'member' } = req.body;
  if (!name || !email || !password || !ROLES.includes(role)) throw fail(400, 'name, email, password and valid role required');
  const [ex] = await db.query('SELECT id FROM users WHERE email=?', [email]);
  if (ex.length) throw fail(409, 'Email already registered');
  const [r] = await db.query('INSERT INTO users (org_id,name,email,password_hash,role) VALUES (?,?,?,?,?)',
    [req.user.orgId, name, email, await bcrypt.hash(password, 10), role]);
  res.status(201).json({ id: r.insertId, name, email, role });
}));

// PATCH /api/users/:id/role
router.patch('/:id/role', authorize('admin'), ah(async (req, res) => {
  const { role } = req.body;
  if (!ROLES.includes(role)) throw fail(400, 'Invalid role');
  if (+req.params.id === req.user.id) throw fail(400, 'You cannot change your own role');
  const [r] = await db.query('UPDATE users SET role=? WHERE id=? AND org_id=?', [role, req.params.id, req.user.orgId]);
  if (!r.affectedRows) throw fail(404, 'User not found');
  res.json({ id: +req.params.id, role });
}));

// DELETE /api/users/:id
router.delete('/:id', authorize('admin'), ah(async (req, res) => {
  if (+req.params.id === req.user.id) throw fail(400, 'You cannot delete yourself');
  const [r] = await db.query('DELETE FROM users WHERE id=? AND org_id=?', [req.params.id, req.user.orgId]);
  if (!r.affectedRows) throw fail(404, 'User not found');
  res.status(204).end();
}));

module.exports = router;
