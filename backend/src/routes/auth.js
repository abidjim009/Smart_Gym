import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(1).max(100),
  age: z.number().int().min(16).max(100).optional(),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear() - 16).optional(),
  gender: z.enum(['male', 'female']).optional(),
  heightCm: z.number().min(100).max(250).optional(),
  weightKg: z.number().min(30).max(300).optional(),
  goal: z.enum(['build_strength', 'lose_weight', 'move_more', 'stay_mobile', 'recover']).optional(),
  equipment: z.enum(['none', 'home_basics', 'full_gym']).optional(),
  units: z.enum(['kg', 'lb']).optional(),
  timeZone: z.string().max(64).optional(),
  locale: z.string().max(16).optional()
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please check your details. Athletes must be at least 16 years old.' });

  const currentYear = new Date().getFullYear();
  const {
    email, password, displayName, age, birthYear,
    gender = 'male', heightCm = 175, weightKg = 70,
    goal = 'build_strength', equipment = 'none', units = 'kg',
    timeZone = 'UTC', locale = 'en'
  } = parsed.data;
  const resolvedBirthYear = birthYear || (age ? currentYear - age : currentYear - 23);

  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ error: 'This email is already registered. Please sign in.' });

    const hash = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const [result] = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, birth_year, units, time_zone, locale, verify_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [email, hash, displayName, resolvedBirthYear, units, timeZone, locale, verifyToken]
    );
    const userId = result.insertId;

    await pool.query(
      `INSERT INTO profiles (user_id, gender, height_cm, weight_kg, goal, experience, equipment, days_per_week, minutes_per_session)
       VALUES (?, ?, ?, ?, ?, 'new', ?, 4, 30)`,
      [userId, gender, heightCm, weightKg, goal, equipment]
    );
    await pool.query('INSERT INTO body_metrics (user_id, weight, recorded_at) VALUES (?, ?, CURDATE())', [userId, weightKg]);
    await pool.query('INSERT INTO reminder_settings (user_id) VALUES (?)', [userId]);
    await pool.query('INSERT INTO subscriptions (user_id, plan, status) VALUES (?, "free", "active")', [userId]);
    await pool.query('INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)', [userId, 'Welcome to Smart Gym', 'Your athlete profile is ready. Check your Today plan or test the AI Camera Coach.']);
    await pool.query('INSERT INTO audit (user_id, action) VALUES (?, ?)', [userId, 'ATHLETE_REGISTERED']);

    const token = jwt.sign({ id: userId, email, role: 'member' }, process.env.JWT_SECRET, { expiresIn: '14d' });
    res.status(201).json({
      token,
      user: { id: userId, email, displayName, units, timeZone, locale, birthYear: resolvedBirthYear, age: currentYear - resolvedBirthYear },
      profile: { onboarded: true, gender, heightCm, weightKg, goal, equipment, experience: 'new', daysPerWeek: 4, minutesPerSession: 30 }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Account temporarily locked after failed logins. Try again in 15 minutes.' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const attempts = (user.failed_attempts || 0) + 1;
      const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60000) : null;
      await pool.query('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?', [attempts, lockUntil, user.id]);
      await pool.query('INSERT INTO audit (user_id, action) VALUES (?, ?)', [user.id, 'LOGIN_FAILED']);
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    await pool.query('INSERT INTO audit (user_id, action) VALUES (?, ?)', [user.id, 'LOGIN_SUCCESS']);

    const [[profile]] = await pool.query(
      'SELECT gender, height_cm AS heightCm, weight_kg AS weightKg, goal, experience, equipment, days_per_week AS daysPerWeek, minutes_per_session AS minutesPerSession FROM profiles WHERE user_id = ?',
      [user.id]
    );

    const currentYear = new Date().getFullYear();
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '14d' });
    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name, units: user.units, timeZone: user.time_zone, locale: user.locale, birthYear: user.birth_year, age: currentYear - user.birth_year },
      profile: profile || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token required.' });
  const [result] = await pool.query('UPDATE users SET email_verified = 1, verify_token = NULL WHERE verify_token = ?', [String(token)]);
  if (!result.affectedRows) return res.status(400).json({ error: 'Invalid or already used token.' });
  res.json({ ok: true, message: 'Email verified.' });
});

router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required.' });
  const resetToken = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60000);
  await pool.query('UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?', [resetToken, expires, email]);
  res.json({ ok: true, message: 'If that email exists, a reset token has been generated.' });
});

router.post('/reset', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Valid token and password (min 6 chars) required.' });
  const [rows] = await pool.query('SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()', [token]);
  if (!rows.length) return res.status(400).json({ error: 'Invalid or expired reset token.' });
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [hash, rows[0].id]);
  res.json({ ok: true });
});

export default router;
