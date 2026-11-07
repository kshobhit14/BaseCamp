const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { ah, fail, authenticate } = require('../middleware/auth');

const sign = (u) =>
  jwt.sign({ id: u.id, orgId: u.org_id, role: u.role, name: u.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

// POST /api/auth/register  -> creates a new organization + its first Admin
router.post('/register', ah(async (req, res) => {
  const { orgName, name, email, password } = req.body;
  if (!orgName || !name || !email || !password || password.length < 6)
    throw fail(400, 'orgName, name, email and password (min 6 chars) are required');
  const [ex] = await db.query('SELECT id FROM users WHERE email=?', [email]);
  if (ex.length) throw fail(409, 'Email already registered');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [o] = await conn.query('INSERT INTO organizations (name) VALUES (?)', [orgName]);
    const hash = await bcrypt.hash(password, 10);
    const [u] = await conn.query(
      'INSERT INTO users (org_id,name,email,password_hash,role) VALUES (?,?,?,?,?)',
      [o.insertId, name, email, hash, 'admin']);
    await conn.commit();
    const user = { id: u.insertId, org_id: o.insertId, name, email, role: 'admin' };
    res.status(201).json({ token: sign(user), user: { id: user.id, name, email, role: 'admin' } });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// POST /api/auth/login
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query('SELECT * FROM users WHERE email=?', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw fail(401, 'Invalid email or password');
  res.json({ token: sign(u), user: { id: u.id, name: u.name, email: u.email, role: u.role } });
}));

// GET /api/auth/me
router.get('/me', authenticate, ah(async (req, res) => {
  const [rows] = await db.query('SELECT id,name,email,role FROM users WHERE id=?', [req.user.id]);
  if (!rows[0]) throw fail(404, 'User not found');
  res.json(rows[0]);
}));

module.exports = router;
