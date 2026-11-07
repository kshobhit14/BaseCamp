require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

if (!process.env.JWT_SECRET) { console.error('JWT_SECRET missing in .env'); process.exit(1); }

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
db.query('SELECT 1')
  .then(() => app.listen(PORT, () => console.log(`Basecamp API running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Cannot connect to MySQL:', e.message); process.exit(1); });
