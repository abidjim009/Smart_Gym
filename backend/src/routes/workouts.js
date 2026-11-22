import { Router } from 'express';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function formatExercise(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    muscles: parseJson(row.muscle_groups, []),
    equipment: row.equipment,
    difficulty: row.difficulty,
    steps: parseJson(row.steps, []),
    mistakes: parseJson(row.common_mistakes, []),
    bodyPartsLoaded: parseJson(row.body_parts_loaded, []),
    youtubeId: row.youtube_id,
    hasLiveCoach: Boolean(row.has_live_coach)
  };
}

router.get('/exercises', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM exercises ORDER BY id ASC');
  res.json({ exercises: rows.map(formatExercise) });
});

router.get('/exercises/:id', async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM exercises WHERE id = ? OR slug = ?', [req.params.id, req.params.id]);
  if (!row) return res.status(404).json({ error: 'Exercise not found.' });
  res.json({ exercise: formatExercise(row) });
});

router.get('/exercises/:id/alternatives', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.* FROM exercises e JOIN exercise_alternatives ea ON ea.alternative_id=e.id WHERE ea.exercise_id=?`,
    [req.params.id]
  );
  res.json({ alternatives: rows.map(formatExercise) });
});

router.get('/today', requireAuth, async (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const [[planRow]] = await pool.query('SELECT plan_json FROM monthly_plans WHERE user_id=? AND plan_month=?', [req.user.id, month]);
  const plan = planRow ? parseJson(planRow.plan_json, null) : null;
  const dayOfWeek = ((new Date().getDay() + 6) % 7) + 1;
  const today = plan?.weeks?.[0]?.days?.find((d) => d.day === dayOfWeek) || null;
  res.json({ today, hasActivePlan: Boolean(plan) });
});

router.post('/workouts', requireAuth, async (req, res) => {
  const { title, durationMin = 20, painReported = false, sets = [] } = req.body;
  const status = sets.length > 0 ? 'completed' : 'in_progress';
  const [result] = await pool.query(
    'INSERT INTO workout_sessions (user_id, title, duration_min, pain_reported, status) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, title || 'Workout Session', durationMin, painReported ? 1 : 0, status]
  );
  const sessionId = result.insertId;
  for (const s of sets) {
    await pool.query(
      'INSERT INTO set_logs (session_id, exercise_id, exercise_name, set_number, reps, weight, effort) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sessionId, s.exerciseId, s.exerciseName, s.setNumber || 1, s.reps || 10, s.weight || 0, s.effort || 'moderate']
    );
  }
  res.status(201).json({ id: sessionId, status });
});

router.post('/workouts/:id/sets', requireAuth, async (req, res) => {
  const { exerciseId, exerciseName, setNumber = 1, reps = 10, weight = 0, effort = 'moderate' } = req.body;
  await pool.query(
    'INSERT INTO set_logs (session_id, exercise_id, exercise_name, set_number, reps, weight, effort) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.params.id, exerciseId, exerciseName, setNumber, reps, weight, effort]
  );
  res.status(201).json({ ok: true });
});

router.post('/workouts/:id/finish', requireAuth, async (req, res) => {
  const { durationMin = 20, painReported = false } = req.body || {};
  await pool.query(
    'UPDATE workout_sessions SET status="completed", duration_min=?, pain_reported=?, completed_at=NOW() WHERE id=? AND user_id=?',
    [durationMin, painReported ? 1 : 0, req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

router.post('/workouts/repeat-last', requireAuth, async (req, res) => {
  const [[lastSession]] = await pool.query(
    'SELECT * FROM workout_sessions WHERE user_id=? AND status="completed" ORDER BY completed_at DESC LIMIT 1',
    [req.user.id]
  );
  if (!lastSession) return res.status(404).json({ error: 'No previous workout found.' });
  const [sets] = await pool.query('SELECT * FROM set_logs WHERE session_id=? ORDER BY id ASC', [lastSession.id]);
  res.json({ session: lastSession, sets });
});

router.get('/me/progress', requireAuth, async (req, res) => {
  const [workouts] = await pool.query('SELECT * FROM workout_sessions WHERE user_id=? ORDER BY completed_at DESC LIMIT 40', [req.user.id]);
  const [liveSessions] = await pool.query('SELECT * FROM live_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 40', [req.user.id]);
  const [bodyMetrics] = await pool.query('SELECT * FROM body_metrics WHERE user_id=? ORDER BY recorded_at ASC LIMIT 60', [req.user.id]);
  res.json({ workouts, liveSessions, bodyMetrics });
});

export default router;
