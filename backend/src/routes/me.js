import { Router } from 'express';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const [[user]] = await pool.query(
    'SELECT id, email, display_name AS displayName, units, locale, time_zone AS timeZone, birth_year AS birthYear FROM users WHERE id = ?',
    [req.user.id]
  );
  const [[profile]] = await pool.query(
    'SELECT goal, experience, equipment, days_per_week AS daysPerWeek, minutes_per_session AS minutesPerSession FROM profiles WHERE user_id = ?',
    [req.user.id]
  );
  const [lims] = await pool.query('SELECT body_part FROM limitations WHERE user_id = ?', [req.user.id]);
  const [[screening]] = await pool.query(
    'SELECT risk_flagged AS riskFlagged, answers, completed_at AS completedAt FROM health_screenings WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    [req.user.id]
  );
  const [[reminders]] = await pool.query(
    'SELECT enabled, reminder_time AS time, quiet_start AS quietStart, quiet_end AS quietEnd, channel FROM reminder_settings WHERE user_id = ?',
    [req.user.id]
  );
  const [[subscription]] = await pool.query('SELECT plan, status FROM subscriptions WHERE user_id = ?', [req.user.id]);

  res.json({
    user,
    profile,
    limitations: lims.map((l) => l.body_part),
    screening: screening
      ? { completed: true, riskFlagged: Boolean(screening.riskFlagged), answers: parseJson(screening.answers, {}), completedAt: screening.completedAt }
      : { completed: false, riskFlagged: false },
    reminders: reminders ? { ...reminders, enabled: Boolean(reminders.enabled) } : null,
    subscription: subscription || { plan: 'free', status: 'active' }
  });
});

router.put('/', async (req, res) => {
  const { displayName, units, locale, timeZone } = req.body;
  await pool.query(
    `UPDATE users SET display_name = COALESCE(?, display_name), units = COALESCE(?, units),
     locale = COALESCE(?, locale), time_zone = COALESCE(?, time_zone) WHERE id = ?`,
    [displayName || null, units || null, locale || null, timeZone || null, req.user.id]
  );
  res.json({ ok: true });
});

router.put('/profile', async (req, res) => {
  const { goal, experience, equipment, daysPerWeek, minutesPerSession, displayName, units, locale, timeZone } = req.body;
  if (displayName || units || locale || timeZone) {
    await pool.query(
      `UPDATE users SET display_name = COALESCE(?, display_name), units = COALESCE(?, units),
       locale = COALESCE(?, locale), time_zone = COALESCE(?, time_zone) WHERE id = ?`,
      [displayName || null, units || null, locale || null, timeZone || null, req.user.id]
    );
  }
  await pool.query(
    `INSERT INTO profiles (user_id, goal, experience, equipment, days_per_week, minutes_per_session)
     VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
       goal=VALUES(goal), experience=VALUES(experience), equipment=VALUES(equipment),
       days_per_week=VALUES(days_per_week), minutes_per_session=VALUES(minutes_per_session)`,
    [req.user.id, goal || 'build_strength', experience || 'new', equipment || 'none', daysPerWeek || 3, minutesPerSession || 25]
  );
  await pool.query(
    'INSERT INTO health_screenings (user_id, answers, risk_flagged, completed_at) VALUES (?, ?, ?, NOW())',
    [req.user.id, JSON.stringify(req.body.answers || {}), req.body.riskFlagged ? 1 : 0]
  ).catch(() => {});
  res.json({ ok: true });
});

router.post('/screening', async (req, res) => {
  await pool.query(
    'INSERT INTO health_screenings (user_id, answers, risk_flagged, completed_at) VALUES (?, ?, ?, NOW())',
    [req.user.id, JSON.stringify(req.body.answers || {}), req.body.riskFlagged ? 1 : 0]
  );
  res.status(201).json({ screening: req.body });
});

router.put('/limitations', async (req, res) => {
  const list = Array.isArray(req.body.limitations) ? req.body.limitations : [];
  await pool.query('DELETE FROM limitations WHERE user_id = ?', [req.user.id]);
  for (const part of list) await pool.query('INSERT INTO limitations (user_id, body_part) VALUES (?, ?)', [req.user.id, String(part)]);
  res.json({ ok: true });
});

router.post('/consents', async (req, res) => {
  const { consentType, granted, version = '1.0' } = req.body;
  if (!consentType) return res.status(400).json({ error: 'consentType required.' });
  await pool.query(
    `INSERT INTO consents (user_id, consent_type, granted, version) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE granted=VALUES(granted), version=VALUES(version)`,
    [req.user.id, consentType, granted ? 1 : 0, version]
  );
  res.json({ ok: true });
});

router.get('/reminders', async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM reminder_settings WHERE user_id = ?', [req.user.id]);
  res.json({ reminders: row || null });
});

router.put('/reminders', async (req, res) => {
  const { enabled = true, time = '18:00', quietStart = '22:00', quietEnd = '07:00', channel = 'push' } = req.body;
  await pool.query(
    `INSERT INTO reminder_settings (user_id, enabled, reminder_time, quiet_start, quiet_end, channel)
     VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE
     enabled=VALUES(enabled), reminder_time=VALUES(reminder_time), quiet_start=VALUES(quiet_start),
     quiet_end=VALUES(quiet_end), channel=VALUES(channel)`,
    [req.user.id, enabled ? 1 : 0, time, quietStart, quietEnd, channel]
  );
  res.json({ ok: true });
});

router.post('/push-token', async (req, res) => {
  const { token, platform = 'web' } = req.body;
  if (!token) return res.status(400).json({ error: 'token required.' });
  await pool.query('INSERT INTO push_tokens (user_id, token, platform) VALUES (?, ?, ?)', [req.user.id, token, platform]);
  res.status(201).json({ ok: true });
});

router.post('/body-metrics', async (req, res) => {
  const { weight, waist, recordedAt } = req.body;
  const date = recordedAt || new Date().toISOString().slice(0, 10);
  await pool.query('INSERT INTO body_metrics (user_id, weight, waist, recorded_at) VALUES (?, ?, ?, ?)',
    [req.user.id, weight ?? null, waist ?? null, date]);
  res.status(201).json({ ok: true });
});

router.get('/notifications', async (req, res) => {
  const [rows] = await pool.query('SELECT id, title, body, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({ notifications: rows });
});

router.post('/notifications/read', async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
});

router.post('/export', async (req, res) => {
  const [[user]] = await pool.query('SELECT id, email, display_name, units, locale, time_zone, birth_year, created_at FROM users WHERE id = ?', [req.user.id]);
  const [[profile]] = await pool.query('SELECT * FROM profiles WHERE user_id = ?', [req.user.id]);
  const [screenings] = await pool.query('SELECT * FROM health_screenings WHERE user_id = ?', [req.user.id]);
  const [limitations] = await pool.query('SELECT * FROM limitations WHERE user_id = ?', [req.user.id]);
  const [workouts] = await pool.query('SELECT * FROM workout_sessions WHERE user_id = ?', [req.user.id]);
  const [liveSessions] = await pool.query('SELECT * FROM live_sessions WHERE user_id = ?', [req.user.id]);
  const [bodyMetrics] = await pool.query('SELECT * FROM body_metrics WHERE user_id = ?', [req.user.id]);
  const [prescriptions] = await pool.query('SELECT * FROM prescriptions WHERE user_id = ?', [req.user.id]);
  await pool.query('INSERT INTO data_requests (user_id, request_type, status) VALUES (?, "export", "completed")', [req.user.id]);
  res.json({ exportedAt: new Date().toISOString(), user, profile, screenings, limitations, workouts, liveSessions, bodyMetrics, prescriptions });
});

router.delete('/', async (req, res) => {
  await pool.query('INSERT INTO data_requests (request_type, status) VALUES ("delete", "completed")');
  await pool.query('INSERT INTO audit (action) VALUES (?)', ['ACCOUNT_DELETED_ANONYMIZED']);
  await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]);
  res.json({ ok: true });
});

export default router;
