const router = require('express').Router();
const db = require('../config/db');
const { ah, authenticate } = require('../middleware/auth');
router.use(authenticate);

// GET /api/dashboard/stats
router.get('/stats', ah(async (req, res) => {
  const o = req.user.orgId;
  const [byStatus] = await db.query('SELECT status, COUNT(*) AS count FROM tasks WHERE org_id=? GROUP BY status', [o]);
  const [[overdue]] = await db.query("SELECT COUNT(*) AS c FROM tasks WHERE org_id=? AND deadline<CURDATE() AND status<>'done'", [o]);
  const [[projects]] = await db.query('SELECT COUNT(*) AS c FROM projects WHERE org_id=?', [o]);
  const [[teams]] = await db.query('SELECT COUNT(*) AS c FROM teams WHERE org_id=?', [o]);
  const [[members]] = await db.query('SELECT COUNT(*) AS c FROM users WHERE org_id=?', [o]);
  res.json({ tasksByStatus: byStatus, overdue: overdue.c, projects: projects.c, teams: teams.c, members: members.c });
}));

module.exports = router;
