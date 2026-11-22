import { Router } from 'express';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/billing', async (req, res) => {
  const [[sub]] = await pool.query('SELECT plan, status, provider_ref FROM subscriptions WHERE user_id = ?', [req.user.id]);
  res.json({ subscription: sub || { plan: 'free', status: 'active' } });
});

router.post('/billing/checkout', async (req, res) => {
  const plan = req.body?.plan === 'paid' ? 'paid' : 'free';
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, provider_ref)
     VALUES (?, ?, "active", ?)
     ON DUPLICATE KEY UPDATE plan = VALUES(plan), status = "active", provider_ref = VALUES(provider_ref)`,
    [req.user.id, plan, `demo_${Date.now()}`]
  );
  res.json({ ok: true, plan });
});

router.get('/admin/exercises', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, slug, name, equipment, difficulty, has_live_coach FROM exercises ORDER BY id ASC');
  res.json({ exercises: rows });
});

router.put('/admin/rules/:exercise', async (req, res) => {
  const ruleJson = JSON.stringify(req.body || {});
  await pool.query(
    `INSERT INTO exercise_rules (exercise_slug, rule_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE rule_json = VALUES(rule_json)`,
    [req.params.exercise, ruleJson]
  );
  const [[updated]] = await pool.query('SELECT * FROM exercise_rules WHERE exercise_slug = ?', [req.params.exercise]);
  res.json({ rule: parseJson(updated.rule_json, {}) });
});

router.get('/admin/usage', async (_req, res) => {
  const [rows] = await pool.query('SELECT * FROM ai_usage ORDER BY usage_date DESC LIMIT 30');
  res.json({ usage: rows });
});

export default router;
