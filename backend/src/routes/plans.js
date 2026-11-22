import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const DAILY_AI_LIMIT = 5;

// Get the current month's workout plan
router.get('/current', async (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const [[row]] = await pool.query(
    'SELECT id, plan_month, goal, plan_json, created_at FROM monthly_plans WHERE user_id = ? AND plan_month = ?',
    [req.user.id, month]
  );
  res.json({ plan: row ? parseJson(row.plan_json, null) : null });
});

// Get workout plan history
router.get('/history', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, plan_month, goal, created_at FROM monthly_plans WHERE user_id = ? ORDER BY plan_month DESC LIMIT 12',
    [req.user.id]
  );
  res.json({ plans: rows });
});

// Generate a new monthly workout plan
router.post('/generate', async (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const [[usage]] = await pool.query(
    'SELECT calls_count FROM ai_usage WHERE user_id = ? AND usage_date = ?',
    [req.user.id, today]
  );
  const currentCalls = usage?.calls_count || 0;
  let planPayload = { ...req.body };

  if (process.env.ANTHROPIC_API_KEY && currentCalls < DAILY_AI_LIMIT) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const msg = await anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 180,
        messages: [{
          role: 'user',
          content: `Write a 2-sentence encouraging coaching overview for a 4-week workout plan with goal "${planPayload.goal || 'build_strength'}". Do not invent any exercise names and remind the user this is guidance, not medical care.`
        }]
      });
      const noteText = msg.content?.[0]?.text?.trim();
      if (noteText) planPayload.coachNote = noteText;

      await pool.query(
        'INSERT INTO ai_usage (user_id, usage_date, calls_count) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE calls_count = calls_count + 1',
        [req.user.id, today]
      );
    } catch {
      // Proceed without an AI note if the provider is unavailable.
    }
  }

  await pool.query(
    `INSERT INTO monthly_plans (user_id, plan_month, goal, plan_data, plan_json)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE goal = VALUES(goal), plan_data = VALUES(plan_data), plan_json = VALUES(plan_json)`,
    [req.user.id, month, planPayload.goal || 'build_strength', JSON.stringify(planPayload), JSON.stringify(planPayload)]
  );

  res.json({ ok: true, plan: planPayload });
});

export default router;

// Workout plan routes.
