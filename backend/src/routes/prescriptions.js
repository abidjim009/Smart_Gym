import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { pool, parseJson } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const uploadDir = path.resolve('uploads/prescriptions');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `rx_u${req.user.id}_${Date.now()}${safeExt}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

const ALIAS_MAP = {
  squat: ['squat', 'squats', 'bodyweight squat', 'chair squat'],
  pushup: ['pushup', 'push-up', 'push up', 'knee pushup'],
  plank: ['plank', 'forearm plank', 'core hold'],
  glute_bridge: ['glute bridge', 'bridge', 'hip bridge', 'bridging'],
  dumbbell_row: ['dumbbell row', 'one arm row', 'single arm row'],
  goblet_squat: ['goblet squat', 'weighted squat'],
  barbell_bench: ['bench press', 'barbell bench', 'chest press'],
  wall_sit: ['wall sit', 'wall squat', 'isometric squat'],
  wall_pushup: ['wall pushup', 'wall push-up', 'incline pushup'],
  dumbbell_floor_press: ['floor press', 'dumbbell press'],
  bird_dog: ['bird dog', 'bird-dog', 'quadruped', 'opposite arm leg'],
  band_row: ['band row', 'resistance band row', 'seated row']
};

const LIMITATION_MAP = {
  knee: ['knee', 'patella', 'meniscus', 'acl', 'mcl'],
  lower_back: ['lower back', 'lumbar', 'sciatica', 'spine', 'disc', 'back pain', 'back stiffness'],
  shoulder: ['shoulder', 'rotator cuff', 'impingement'],
  wrist: ['wrist', 'carpal']
};

router.get('/', requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, raw_notes, detected_limitations, prescribed_slugs, suggested_slugs, summary_note, created_at FROM prescriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json({ prescriptions: rows });
});

router.post('/analyze', requireAuth, upload.single('prescriptionFile'), async (req, res) => {
  if (req.body.consent !== 'true') {
    return res.status(400).json({ error: 'Explicit consent is required before analyzing a prescription.' });
  }

  const rawNotes = (req.body.notes || '').trim();
  const filePath = req.file ? req.file.path : null;
  const combined = `${req.file?.originalname || ''} ${rawNotes}`.toLowerCase();

  const [allExercises] = await pool.query('SELECT * FROM exercises ORDER BY id ASC');
  const detectedLimitations = Object.entries(LIMITATION_MAP)
    .filter(([, terms]) => terms.some((term) => combined.includes(term)))
    .map(([part]) => part);

  const prescribedExercises = allExercises.filter((exercise) => {
    const aliases = ALIAS_MAP[exercise.slug] || [exercise.name.toLowerCase()];
    return aliases.some((alias) => combined.includes(alias));
  });

  const prescribedIds = new Set(prescribedExercises.map((exercise) => exercise.id));
  const suggestedExercises = allExercises
    .filter((exercise) => {
      if (prescribedIds.has(exercise.id)) return false;
      const loaded = parseJson(exercise.body_parts_loaded, []);
      return !loaded.some((part) => detectedLimitations.includes(part)) && exercise.difficulty === 'beginner';
    })
    .slice(0, 4);

  const summaryNote = prescribedExercises.length > 0
    ? `Matched ${prescribedExercises.length} doctor-recommended exercise(s) from your prescription.`
    : `Suggested ${suggestedExercises.length} safe library exercise(s) filtered around your precautions.`;

  await pool.query(
    `INSERT INTO prescriptions
      (user_id, consent_given, file_path, raw_notes, detected_limitations, prescribed_slugs, suggested_slugs, summary_note)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.id,
      filePath,
      rawNotes,
      JSON.stringify(detectedLimitations),
      JSON.stringify(prescribedExercises.map((exercise) => exercise.slug)),
      JSON.stringify(suggestedExercises.map((exercise) => exercise.slug)),
      summaryNote
    ]
  );

  const formatRow = (exercise) => ({
    id: exercise.id,
    slug: exercise.slug,
    name: exercise.name,
    muscles: parseJson(exercise.muscle_groups, []),
    equipment: exercise.equipment,
    difficulty: exercise.difficulty,
    steps: parseJson(exercise.steps, []),
    mistakes: parseJson(exercise.common_mistakes, []),
    youtubeId: exercise.youtube_id
  });

  res.status(201).json({
    analysis: {
      detectedLimitations,
      prescribedExercises: prescribedExercises.map(formatRow),
      suggestedExercises: suggestedExercises.map(formatRow),
      summaryNote
    }
  });
});

export default router;
