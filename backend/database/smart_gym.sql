-- Smart Gym MySQL/XAMPP database schema and seed data.
CREATE DATABASE IF NOT EXISTS smart_gym CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_gym;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL DEFAULT 'Athlete',
  birth_year SMALLINT UNSIGNED NULL,
  units VARCHAR(10) NOT NULL DEFAULT 'kg',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  locale VARCHAR(16) NOT NULL DEFAULT 'en',
  time_zone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_token VARCHAR(64) NULL,
  reset_token VARCHAR(64) NULL,
  reset_expires DATETIME NULL,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_verify_token (verify_token),
  UNIQUE KEY uq_users_reset_token (reset_token)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  goal VARCHAR(50) NOT NULL DEFAULT 'build_strength',
  experience VARCHAR(50) NOT NULL DEFAULT 'new',
  equipment VARCHAR(50) NOT NULL DEFAULT 'none',
  days_per_week TINYINT UNSIGNED NOT NULL DEFAULT 3,
  minutes_per_session TINYINT UNSIGNED NOT NULL DEFAULT 25,
  onboarded TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_profiles_user (user_id),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reminder_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  reminder_time TIME NULL,
  quiet_start TIME NULL,
  quiet_end TIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reminder_user (user_id),
  CONSTRAINT fk_reminder_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_ref VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_user (user_id),
  CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  body TEXT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exercises (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  muscle_groups JSON NULL,
  equipment VARCHAR(50) NOT NULL DEFAULT 'none',
  difficulty VARCHAR(50) NOT NULL DEFAULT 'beginner',
  body_parts_loaded JSON NULL,
  steps JSON NULL,
  common_mistakes JSON NULL,
  youtube_id VARCHAR(30) NULL,
  has_live_coach TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercises_slug (slug)
) ENGINE=InnoDB;

INSERT IGNORE INTO exercises
(id, slug, name, muscle_groups, equipment, difficulty, body_parts_loaded, steps, common_mistakes, youtube_id, has_live_coach)
VALUES
(1, 'squat', 'Bodyweight Squat', '["Quads","Glutes","Core"]', 'none', 'beginner', '["knee","lower_back","ankle"]', '["Stand with feet shoulder-width apart and toes slightly turned out.","Push your hips back and bend your knees as if sitting into a chair.","Keep your chest proud and heels flat on the floor, then push back up."]', '["Knees caving inward","Heels lifting off the ground","Rounding the lower back"]', 'aclHkVaku9U', 1),
(2, 'pushup', 'Push-up (Standard or Knee)', '["Chest","Triceps","Shoulders"]', 'none', 'beginner', '["shoulder","wrist","elbow"]', '["Place hands slightly wider than shoulders with arms straight.","Lower your chest toward the floor while keeping elbows at a 45 degree angle.","Press firmly through your palms to return to the start."]', '["Hips sagging toward the floor","Flaring elbows out to 90 degrees"]', 'IODxDxX7oi4', 1),
(3, 'plank', 'Forearm Plank', '["Core","Shoulders"]', 'none', 'beginner', '["shoulder","lower_back"]', '["Rest on your forearms with elbows directly beneath your shoulders.","Extend your legs behind you and brace your core and glutes.","Hold a straight line from head to heels without holding your breath."]', '["Letting hips drop","Piking hips too high"]', 'pSHjTRCQxIw', 1),
(4, 'glute_bridge', 'Glute Bridge', '["Glutes","Hamstrings"]', 'none', 'beginner', '["lower_back","hip"]', '["Lie on your back with knees bent and feet flat hip-width apart.","Drive through your heels to lift your hips until knees, hips, and shoulders align.","Pause for 1 second at the top and lower slowly."]', '["Overarching the lower back at the top","Pushing through toes instead of heels"]', 'wPM8icPu6H8', 1),
(5, 'dumbbell_row', 'Single-Arm Dumbbell Row', '["Upper Back","Lats","Biceps"]', 'home_basics', 'beginner', '["shoulder","lower_back"]', '["Support one hand and knee on a sturdy bench or chair.","Pull the dumbbell toward your hip, squeezing your shoulder blade back.","Lower the weight with control."]', '["Twisting the torso","Shrugging the shoulder toward the ear"]', 'pYcpY20QaE8', 0),
(6, 'goblet_squat', 'Dumbbell Goblet Squat', '["Quads","Glutes","Core"]', 'home_basics', 'intermediate', '["knee","lower_back","wrist"]', '["Hold a dumbbell vertically against your chest with both hands.","Squat down between your knees while keeping elbows tucked.","Drive back up to standing."]', '["Letting the weight pull your chest forward"]', 'MeIiIdhvXT4', 0),
(7, 'barbell_bench', 'Barbell Bench Press', '["Chest","Triceps","Front Delts"]', 'gym', 'intermediate', '["shoulder","wrist","elbow"]', '["Set the bar above your shoulders with feet planted and shoulder blades retracted.","Lower the bar to mid-chest with control.","Press the bar back over your shoulders."]', '["Bouncing the bar off the chest","Excessive back arch"]', 'rT7DgCr-3pg', 0),
(8, 'wall_sit', 'Wall Sit', '["Quads","Glutes"]', 'none', 'beginner', '["knee","lower_back"]', '["Lean against a wall and walk your feet forward.","Slide down until knees are near 90 degrees.","Hold with neutral spine and active knees."]', '["Letting knees cave inward","Forcing depth too early"]', 'c2XwYFzKJ4I', 0),
(9, 'wall_pushup', 'Wall Push-up', '["Chest","Triceps","Shoulders"]', 'none', 'beginner', '["shoulder","wrist","elbow"]', '["Place palms on a wall at shoulder height and step back.","Lower your chest toward the wall with elbows close.","Push back to the start."]', '["Elbows flaring sharply","Hips drifting away from the wall"]', 'x4l8F1M7Q7Y', 0),
(10, 'dumbbell_floor_press', 'Dumbbell Floor Press', '["Chest","Triceps","Shoulders"]', 'home_basics', 'beginner', '["shoulder","wrist","elbow"]', '["Lie on the floor with a dumbbell in each hand.","Press the weights straight up.","Lower until your upper arms gently reach the floor."]', '["Letting wrists bend backward","Using momentum"]', '5o1pJrYJ8gk', 0),
(11, 'bird_dog', 'Bird-Dog', '["Core","Glutes","Back"]', 'none', 'beginner', '["lower_back","shoulder","knee"]', '["Start on hands and knees with a neutral spine.","Extend opposite arm and leg while keeping hips level.","Pause and return, then switch sides."]', '["Rotating the hips","Arching the lower back"]', 'wiFZCxkIc0U', 0),
(12, 'band_row', 'Resistance Band Row', '["Upper Back","Lats","Biceps"]', 'home_basics', 'beginner', '["shoulder","wrist","elbow"]', '["Anchor a resistance band securely at chest height.","Pull handles toward your ribs while keeping elbows near your body.","Return slowly to the start."]', '["Leaning back with the pull","Shrugging shoulders"]', 'TgWgI7XfGZk', 0);

CREATE TABLE IF NOT EXISTS monthly_plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  plan_data JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_monthly_plans_user (user_id),
  CONSTRAINT fk_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workout_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NULL,
  exercise_slug VARCHAR(100) NULL,
  session_data JSON NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_workout_logs_user (user_id),
  CONSTRAINT fk_workout_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_workout_logs_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS live_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  exercise_slug VARCHAR(100) NULL,
  session_data JSON NULL,
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live_sessions_user (user_id),
  CONSTRAINT fk_live_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS prescriptions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  consent_given TINYINT(1) NOT NULL DEFAULT 0,
  file_path VARCHAR(500) NULL,
  raw_notes TEXT NULL,
  detected_limitations JSON NULL,
  prescribed_slugs JSON NULL,
  suggested_slugs JSON NULL,
  summary_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prescriptions_user (user_id),
  CONSTRAINT fk_prescriptions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS limitations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  body_part VARCHAR(50) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_limitation (user_id, body_part),
  CONSTRAINT fk_limitations_new_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS health_screenings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  answers JSON NULL,
  risk_flagged TINYINT(1) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  screening_version VARCHAR(30) NOT NULL DEFAULT 'parq-v1',
  PRIMARY KEY (id),
  KEY idx_health_screenings_user (user_id),
  CONSTRAINT fk_health_screenings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE reminder_settings ADD COLUMN IF NOT EXISTS channel VARCHAR(20) NOT NULL DEFAULT 'push';

CREATE TABLE IF NOT EXISTS consents (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  consent_type VARCHAR(100) NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 0,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_consent (user_id, consent_type),
  CONSTRAINT fk_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS push_tokens (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token VARCHAR(500) NOT NULL,
  platform VARCHAR(30) NOT NULL DEFAULT 'web',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_push_tokens_user (user_id),
  CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS body_metrics (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  weight DECIMAL(6,2) NULL,
  waist DECIMAL(6,2) NULL,
  recorded_at DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_body_metrics_user (user_id),
  CONSTRAINT fk_body_metrics_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL DEFAULT 'Workout Session',
  duration_min SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  pain_reported TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_workout_sessions_user (user_id),
  CONSTRAINT fk_workout_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS set_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NULL,
  exercise_name VARCHAR(150) NULL,
  set_number TINYINT UNSIGNED NOT NULL DEFAULT 1,
  reps TINYINT UNSIGNED NOT NULL DEFAULT 10,
  weight DECIMAL(6,2) NOT NULL DEFAULT 0,
  effort VARCHAR(30) NOT NULL DEFAULT 'moderate',
  logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_set_logs_session (session_id),
  CONSTRAINT fk_set_logs_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_set_logs_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exercise_alternatives (
  exercise_id INT UNSIGNED NOT NULL,
  alternative_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (exercise_id, alternative_id),
  CONSTRAINT fk_alt_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  CONSTRAINT fk_alt_alternative FOREIGN KEY (alternative_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS data_requests (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  request_type VARCHAR(20) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_data_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS plan_month VARCHAR(7) NULL,
  ADD COLUMN IF NOT EXISTS goal VARCHAR(50) NOT NULL DEFAULT 'build_strength',
  ADD COLUMN IF NOT EXISTS plan_json JSON NULL;

ALTER TABLE monthly_plans ADD UNIQUE INDEX IF NOT EXISTS uq_monthly_plan_user_month (user_id, plan_month);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  usage_date DATE NOT NULL,
  calls_count INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_usage_user_date (user_id, usage_date),
  CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exercise_rules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_slug VARCHAR(100) NOT NULL,
  rule_json JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercise_rule_slug (exercise_slug),
  CONSTRAINT fk_exercise_rule_slug FOREIGN KEY (exercise_slug) REFERENCES exercises(slug) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE live_sessions
  ADD COLUMN IF NOT EXISTS source_mode VARCHAR(20) NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS rep_count INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score DECIMAL(5,2) NULL,
  ADD COLUMN IF NOT EXISTS confidence DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary TEXT NULL;

CREATE TABLE IF NOT EXISTS live_reps (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  live_session_id INT UNSIGNED NOT NULL,
  rep_number INT UNSIGNED NOT NULL DEFAULT 1,
  score DECIMAL(5,2) NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  tip VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_live_reps_session (live_session_id),
  CONSTRAINT fk_live_reps_session FOREIGN KEY (live_session_id) REFERENCES live_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fitwithai_profiles (
  user_id INT UNSIGNED PRIMARY KEY,
  state_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fitwithai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
