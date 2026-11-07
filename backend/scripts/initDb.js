// Creates the database/tables and inserts demo data.  Run: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  await conn.query(fs.readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8'));
  console.log('Schema created.');

  const [ex] = await conn.query('SELECT id FROM users WHERE email="admin@demo.com"');
  if (!ex.length) {
    const hash = await bcrypt.hash('password123', 10);
    const [o] = await conn.query('INSERT INTO organizations (name) VALUES ("Demo Org")');
    const org = o.insertId;
    const ins = async (n, e, r) => (await conn.query('INSERT INTO users (org_id,name,email,password_hash,role) VALUES (?,?,?,?,?)', [org, n, e, hash, r]))[0].insertId;
    const admin = await ins('Alice Admin', 'admin@demo.com', 'admin');
    const mgr = await ins('Mark Manager', 'manager@demo.com', 'manager');
    const mem = await ins('Mia Member', 'member@demo.com', 'member');
    const [t] = await conn.query('INSERT INTO teams (org_id,name,description) VALUES (?,?,?)', [org, 'Engineering', 'Core product team']);
    await conn.query('INSERT INTO team_members (team_id,user_id) VALUES (?,?),(?,?)', [t.insertId, mgr, t.insertId, mem]);
    const [p] = await conn.query('INSERT INTO projects (org_id,team_id,name,description,deadline,created_by) VALUES (?,?,?,?,DATE_ADD(CURDATE(),INTERVAL 30 DAY),?)', [org, t.insertId, 'Website Redesign', 'Revamp the marketing site', admin]);
    await conn.query(
      `INSERT INTO tasks (org_id,project_id,title,priority,assigned_to,created_by,deadline) VALUES
       (?,?,'Design homepage mockup','high',?,?,DATE_ADD(CURDATE(),INTERVAL 5 DAY)),
       (?,?,'Set up CI pipeline','medium',?,?,DATE_SUB(CURDATE(),INTERVAL 2 DAY))`,
      [org, p.insertId, mem, mgr, org, p.insertId, mem, mgr]);
    console.log('Demo data inserted. Logins (password: password123): admin@demo.com, manager@demo.com, member@demo.com');
  }
  await conn.end();
})().catch((e) => { console.error('DB init failed:', e.message); process.exit(1); });
