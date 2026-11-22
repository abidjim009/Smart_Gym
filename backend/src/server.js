import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { pool } from './db.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import workoutRoutes from './routes/workouts.js';
import planRoutes from './routes/plans.js';
import liveRoutes from './routes/live.js';
import prescriptionRoutes from './routes/prescriptions.js';
import adminRoutes from './routes/admin.js';
import fitwithaiRoutes from './routes/fitwithai.js';
import { startReminderScheduler } from './jobs/reminders.js';

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 60 }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'smart_gym', gymMode: process.env.GYM_MODE === 'true' });
  } catch (err) {
    res.status(500).json({ status: 'db_error', error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api', workoutRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/fitwithai', fitwithaiRoutes);
app.use('/api', adminRoutes);

app.get('/api/screening', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, screening_version, answers, risk_flagged, created_at FROM health_screenings WHERE user_id = ? ORDER BY id DESC',
    [req.user.id]
  );
  res.json({ screenings: rows });
});

app.post('/api/screening', requireAuth, async (req, res) => {
  const { answers, riskFlagged, version = 'parq-v1' } = req.body;
  await pool.query(
    'INSERT INTO health_screenings (user_id, screening_version, answers, risk_flagged) VALUES (?, ?, ?, ?)',
    [req.user.id, version, JSON.stringify(answers || {}), riskFlagged ? 1 : 0]
  );
  res.status(201).json({ ok: true });
});

app.use('/api/gym', (_req, res) => {
  if (process.env.GYM_MODE !== 'true') {
    return res.status(404).json({ error: 'Gym mode is switched off in Individual Edition.' });
  }
  res.status(404).json({ error: 'Gym mode route not configured.' });
});

app.use(express.static(path.join(__dirname, '../../frontend')));
app.use((_req, res) => res.sendFile(path.join(__dirname, '../../frontend/index.html')));

startReminderScheduler();

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`Smart Gym API & PWA running at http://localhost:${PORT} (GYM_MODE=${process.env.GYM_MODE})`);
});
