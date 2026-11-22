import { Router } from 'express';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const [[row]] = await pool.query('SELECT state_json FROM fitwithai_profiles WHERE user_id = ?', [req.user.id]);
  res.json({ fitwithai: row ? parseJson(row.state_json, null) : null });
});

router.post('/', async (req, res) => {
  await pool.query(
    `INSERT INTO fitwithai_profiles (user_id, state_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
    [req.user.id, JSON.stringify(req.body || {})]
  );
  res.json({ ok: true });
});

export default router;
