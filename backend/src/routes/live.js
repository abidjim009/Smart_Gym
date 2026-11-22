import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const DAILY_AI_LIMIT = 5;

router.get('/exercises', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, slug, name FROM exercises WHERE has_live_coach = 1');
  res.json({ exercises: rows });
});

router.get('/rules/:exercise', async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM exercise_rules WHERE exercise_slug = ?', [req.params.exercise]);
  if (!row) return res.status(404).json({ error: 'Rule file not found.' });
  res.json({ rule: parseJson(row.rule_json, {}) });
});

router.get('/sessions', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM live_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  res.json({ sessions: rows });
});

router.post('/sessions', async (req, res) => {
  const { exerciseSlug = 'squat', sourceMode = 'live', reps = 0, score = null, confidence = 0, repDetails = [] } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  let summary = null;

  if (process.env.ANTHROPIC_API_KEY && reps > 0) {
    try {
      const [[usage]] = await pool.query(
        'SELECT calls_count FROM ai_usage WHERE user_id = ? AND usage_date = ?',
        [req.user.id, today]
      );
      if ((usage?.calls_count || 0) < DAILY_AI_LIMIT) {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropic.messages.create({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 120,
          messages: [{
            role: 'user',
            content: `Give a 1-sentence supportive coaching tip (never say "wrong") for ${exerciseSlug}: ${reps} reps completed, form score ${score ?? 'N/A'}/100, confidence ${confidence}%.`
          }]
        });
        summary = msg.content?.[0]?.text?.trim() || null;
        await pool.query(
          'INSERT INTO ai_usage (user_id, usage_date, calls_count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE calls_count = calls_count + 1',
          [req.user.id, today]
        );
      }
    } catch {
      // Fall back cleanly if AI summarization fails.
    }
  }

  const [result] = await pool.query(
    'INSERT INTO live_sessions (user_id, exercise_slug, source_mode, rep_count, score, confidence, summary) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, exerciseSlug, sourceMode === 'upload' ? 'upload' : 'live', reps, score, confidence, summary]
  );
  const liveId = result.insertId;

  for (const r of repDetails) {
    await pool.query(
      'INSERT INTO live_reps (live_session_id, rep_number, score, duration_ms, tip) VALUES (?, ?, ?, ?, ?)',
      [liveId, r.rep || 1, r.score || 0, r.durationMs || 0, r.tip || null]
    );
  }

  res.status(201).json({ id: liveId, summary });
});

router.post('/sessions/:id/reps', async (req, res) => {
  const { repNumber = 1, score = 0, durationMs = 0, tip = null } = req.body;
  await pool.query(
    'INSERT INTO live_reps (live_session_id, rep_number, score, duration_ms, tip) VALUES (?, ?, ?, ?, ?)',
    [req.params.id, repNumber, score, durationMs, tip]
  );
  res.status(201).json({ ok: true });
});

router.post('/sessions/:id/finish', async (req, res) => {
  const { reps = 0, score = null, confidence = 0, summary = null } = req.body;
  await pool.query(
    'UPDATE live_sessions SET rep_count = ?, score = ?, confidence = ?, summary = ? WHERE id = ? AND user_id = ?',
    [reps, score, confidence, summary, req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

export default router;
