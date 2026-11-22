// Exercise library and camera rule definitions.

export const EXERCISE_RULES = {
  squat: {
    id: 'squat',
    name: 'Bodyweight Squat',
    version: 1,
    cameraPosition: 'Side or 45° angle, 2 meters away, full body visible',
    repType: 'reps',
    joints: { a: 23, b: 25, c: 27 },
    upAngle: 160,
    downAngle: 95,
    injuryAdjustedDownAngle: { knee: 115, lower_back: 110 },
    checks: [
      { id: 'depth', label: 'Squat depth', minAngle: 105, weight: 0.45, cue: 'Go a little lower if comfortable' },
      { id: 'torso', label: 'Chest upright', maxLean: 45, weight: 0.30, cue: 'Keep your chest up' },
      { id: 'tempo', label: 'Controlled speed', minMs: 1100, weight: 0.25, cue: 'Slow down on the way down' }
    ]
  },
  pushup: {
    id: 'pushup',
    name: 'Push-up (Floor / Knee / Wall)',
    version: 1,
    cameraPosition: 'Side view, camera low near floor or bench height',
    repType: 'reps',
    joints: { a: 11, b: 13, c: 15 },
    upAngle: 155,
    downAngle: 95,
    injuryAdjustedDownAngle: { shoulder: 115, wrist: 115 },
    checks: [
      { id: 'depth', label: 'Elbow bend', minAngle: 100, weight: 0.50, cue: 'Lower your chest closer to the floor' },
      { id: 'alignment', label: 'Straight body line', maxHipSag: 25, weight: 0.30, cue: 'Brace your core; keep hips level' },
      { id: 'tempo', label: 'Controlled tempo', minMs: 1000, weight: 0.20, cue: 'Control the lowering phase' }
    ]
  },
  plank: {
    id: 'plank',
    name: 'Forearm Plank',
    version: 1,
    cameraPosition: 'Side view, full body from head to heels in frame',
    repType: 'hold',
    targetSeconds: 30,
    joints: { a: 11, b: 23, c: 27 },
    checks: [
      { id: 'line', label: 'Straight body line', minAngle: 162, maxAngle: 192, weight: 0.70, cue: 'Keep shoulders, hips, and ankles in one line' },
      { id: 'stability', label: 'Minimal hip sag', weight: 0.30, cue: 'Tighten glutes and abs' }
    ]
  },
  glute_bridge: {
    id: 'glute_bridge',
    name: 'Glute Bridge',
    version: 1,
    cameraPosition: 'Side view on mat, knees bent, full body visible',
    repType: 'reps',
    joints: { a: 11, b: 23, c: 25 },
    upAngle: 168,
    downAngle: 125,
    inverted: true,
    injuryAdjustedDownAngle: { lower_back: 160 },
    checks: [
      { id: 'extension', label: 'Full hip extension', minTopAngle: 165, weight: 0.60, cue: 'Squeeze glutes and lift hips higher' },
      { id: 'overarch', label: 'No lower-back hyperextension', maxTopAngle: 188, weight: 0.40, cue: 'Stop when hips align with knees and shoulders' }
    ]
  }
};

export const EXERCISES = [
  {
    id: 1,
    slug: 'squat',
    name: 'Bodyweight Squat',
    muscles: ['Quads', 'Glutes', 'Core'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['knee', 'lower_back', 'ankle'],
    youtubeId: 'aclHkVaku9U',
    hasLiveCoach: true,
    steps: [
      'Stand with feet shoulder-width apart and toes slightly turned out.',
      'Push your hips back and bend your knees as if sitting into a chair.',
      'Keep your chest proud and heels flat on the floor, then push back up.'
    ],
    mistakes: ['Knees caving inward', 'Heels lifting off the ground', 'Rounding the lower back'],
    alternatives: [8, 4]
  },
  {
    id: 2,
    slug: 'pushup',
    name: 'Push-up (Standard or Knee)',
    muscles: ['Chest', 'Triceps', 'Shoulders'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['shoulder', 'wrist', 'elbow'],
    youtubeId: 'IODxDxX7oi4',
    hasLiveCoach: true,
    steps: [
      'Place hands slightly wider than shoulders with arms straight.',
      'Lower your chest toward the floor while keeping elbows at a 45° angle.',
      'Press firmly through your palms to return to the start.'
    ],
    mistakes: ['Hips sagging toward the floor', 'Flaring elbows out to 90°'],
    alternatives: [9, 10]
  },
  {
    id: 3,
    slug: 'plank',
    name: 'Forearm Plank',
    muscles: ['Core', 'Shoulders'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['shoulder', 'lower_back'],
    youtubeId: 'pSHjTRCQxIw',
    hasLiveCoach: true,
    steps: [
      'Rest on your forearms with elbows directly beneath your shoulders.',
      'Extend your legs behind you and brace your core and glutes.',
      'Hold a straight line from head to heels without holding your breath.'
    ],
    mistakes: ['Letting hips drop', 'Piking hips too high'],
    alternatives: [11]
  },
  {
    id: 4,
    slug: 'glute_bridge',
    name: 'Glute Bridge',
    muscles: ['Glutes', 'Hamstrings'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['lower_back', 'hip'],
    youtubeId: 'wPM8icPu6H8',
    hasLiveCoach: true,
    steps: [
      'Lie on your back with knees bent and feet flat hip-width apart.',
      'Drive through your heels to lift your hips until knees, hips, and shoulders align.',
      'Pause for 1 second at the top and lower slowly.'
    ],
    mistakes: ['Overarching the lower back at the top', 'Pushing through toes instead of heels'],
    alternatives: [1]
  },
  {
    id: 5,
    slug: 'dumbbell_row',
    name: 'Single-Arm Dumbbell Row',
    muscles: ['Upper Back', 'Lats', 'Biceps'],
    equipment: 'home_basics',
    difficulty: 'beginner',
    bodyPartsLoaded: ['shoulder', 'lower_back'],
    youtubeId: 'pYcpY20QaE8',
    hasLiveCoach: false,
    steps: [
      'Support one hand and knee on a sturdy bench or chair.',
      'Pull the dumbbell toward your hip, squeezing your shoulder blade back.',
      'Lower the weight with control.'
    ],
    mistakes: ['Twisting the torso', 'Shrugging the shoulder toward the ear'],
    alternatives: [12]
  },
  {
    id: 6,
    slug: 'goblet_squat',
    name: 'Dumbbell Goblet Squat',
    muscles: ['Quads', 'Glutes', 'Core'],
    equipment: 'home_basics',
    difficulty: 'intermediate',
    bodyPartsLoaded: ['knee', 'lower_back', 'wrist'],
    youtubeId: 'MeIiIdhvXT4',
    hasLiveCoach: false,
    steps: [
      'Hold a dumbbell vertically against your chest with both hands.',
      'Squat down between your knees while keeping elbows tucked.',
      'Drive back up to standing.'
    ],
    mistakes: ['Letting the weight pull your chest forward'],
    alternatives: [1, 4]
  },
  {
    id: 7,
    slug: 'barbell_bench',
    name: 'Barbell Bench Press',
    muscles: ['Chest', 'Triceps', 'Front Delts'],
    equipment: 'full_gym',
    difficulty: 'intermediate',
    bodyPartsLoaded: ['shoulder', 'wrist', 'elbow'],
    youtubeId: 'rT7DgCr-3pg',
    hasLiveCoach: false,
    steps: [
      'Lie flat on the bench with eyes under the bar and feet planted.',
      'Lower the bar with control to mid-chest.',
      'Press up until arms are extended.'
    ],
    mistakes: ['Bouncing the bar off the chest', 'Lifting hips off the bench'],
    alternatives: [2, 10]
  },
  {
    id: 8,
    slug: 'wall_sit',
    name: 'Isometric Wall Sit',
    muscles: ['Quads', 'Glutes'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['knee'],
    youtubeId: 'y-wV4Venusw',
    hasLiveCoach: false,
    steps: [
      'Slide your back down a wall until knees are at a comfortable 90° to 110° angle.',
      'Keep ankles directly under knees and hold steady.'
    ],
    mistakes: ['Knees pushing far past toes'],
    alternatives: [4]
  },
  {
    id: 9,
    slug: 'wall_pushup',
    name: 'Incline / Wall Push-up',
    muscles: ['Chest', 'Shoulders', 'Triceps'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['shoulder'],
    youtubeId: 'a6YHbXD2XlU',
    hasLiveCoach: false,
    steps: [
      'Place hands on a wall or counter at chest height.',
      'Bend elbows to bring chest toward the wall, then push back.'
    ],
    mistakes: ['Sagging lower back'],
    alternatives: [2]
  },
  {
    id: 10,
    slug: 'dumbbell_floor_press',
    name: 'Dumbbell Floor Press',
    muscles: ['Chest', 'Triceps'],
    equipment: 'home_basics',
    difficulty: 'beginner',
    bodyPartsLoaded: ['shoulder', 'wrist'],
    youtubeId: 'uUGDRwge4F8',
    hasLiveCoach: false,
    steps: [
      'Lie on the floor holding dumbbells with upper arms resting on the mat.',
      'Press weights straight up and lower until triceps gently touch the floor.'
    ],
    mistakes: ['Dropping elbows rapidly onto the floor'],
    alternatives: [9]
  },
  {
    id: 11,
    slug: 'bird_dog',
    name: 'Bird-Dog Core Stability',
    muscles: ['Core', 'Lower Back', 'Glutes'],
    equipment: 'none',
    difficulty: 'beginner',
    bodyPartsLoaded: ['wrist'],
    youtubeId: 'wiFNA3sqjCA',
    hasLiveCoach: false,
    steps: [
      'Start on hands and knees with a neutral spine.',
      'Extend opposite arm and leg slowly without tilting your hips.',
      'Return and switch sides.'
    ],
    mistakes: ['Arching the lower back when kicking the leg up'],
    alternatives: [3]
  },
  {
    id: 12,
    slug: 'band_row',
    name: 'Seated Resistance Band Row',
    muscles: ['Upper Back', 'Biceps'],
    equipment: 'home_basics',
    difficulty: 'beginner',
    bodyPartsLoaded: ['elbow'],
    youtubeId: 'GZbfZ033f74',
    hasLiveCoach: false,
    steps: [
      'Sit tall with legs extended and loop a resistance band around your feet.',
      'Pull handles toward your ribs and squeeze shoulder blades together.'
    ],
    mistakes: ['Rounding shoulders forward'],
    alternatives: [5]
  }
];
