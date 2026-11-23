# Smart Gym (Individual-First Edition)

A full-stack personal workout planner, daily set logger, and on-device camera form tracker built for individual athletes training at home, outdoors, or in a gym. Tell Smart Gym your goal, body metrics, equipment, and joint limitations to get a safe 4-week routine, a 4-block **Today** workout logger, a **FitWithAI** split builder, a **Prescription Analyzer**, and a **Form Coach** that evaluates your posture locally in the browser without uploading video.

> **Disclaimer:** Smart Gym provides general fitness guidance and workout tracking. **It is not medical software** and does not diagnose, treat, or prevent any medical condition. Always consult a qualified doctor or physiotherapist before starting a new exercise program.

---

## Table of Contents
1. [Key Features](#key-features)
2. [UI & Color System](#ui--color-system)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Getting Started (XAMPP + VS Code)](#getting-started-xampp--vs-code)
6. [Database Schema (`smart_gym`)](#database-schema-smart_gym)
7. [API Overview](#api-overview)
8. [Privacy & Safety Guardrails](#privacy--safety-guardrails)
9. [Development Journal & Git](#development-journal--git)

---

## Key Features

### 1. Landing Page & Athlete Onboarding
- **Public Landing Page:** Introduces the platform with a sample full-body routine preview, privacy guarantees, and quick **Log In** / **Register** entry points.
- **Athlete Registration & Login:** Captures name, email, password, age (16+ check), gender (`Male` / `Female`), height (`cm` / `ft`), weight (`kg` / `lb`), primary goal, and equipment access—calculating live **BMI** and baseline **daily calorie burn (`kcal/day`)** in real time.
- **Offline Guest Mode & 4-Step Setup Wizard:** Users can explore immediately in browser storage or complete the PAR-Q+ health screening and joint limitation picker (`Knee`, `Lower Back`, `Shoulder`, `Wrist`) at any time.

### 2. Today Dashboard & 4-Block Active Workout Logger
- **Personalized Physiology Header:** Displays your active goal, BMI, daily energy burn, weekly session progress, latest form score, and protected joint badges.
- **Interactive 7-Day Schedule & Readiness Selector:** Preview any day (`Mon–Sun`) and adjust daily training volume based on how you feel (`Energized`, `Ready`, or `Sore / Light`).
- **Connected Intelligence Cards:** One-tap integration with your **FitWithAI Split**, **Doctor Prescription Matches**, and **Daily Readiness** (hydration tracker + warmup/cooldown checklist).
- **4-Block Active Set Logger:**
  1. **Sets Done (`↺ 0`):** Starts at `0`, increments on every logged set, and can be reset to `0` at any time.
  2. **Reps / Static Hold:** Pre-fills target reps or static hold seconds with a 1-click toggle between dynamic reps and static holds.
  3. **Manual / Scan Input:** Switch between manual weight/value input and camera scan codes/scores.
  4. **Log Set & Camera Scan (`+ Log Set` | `📷 Scan`):** Log a set with an interactive rest timer (`-15s`, `+15s`, `Skip`), or tap **`📷 Scan`** to launch the camera coach, evaluate your form, and return the scanned reps and score back to your active workout.

### 3. FitWithAI Split Planner
- Multi-step body and training assessment (gender, height, weight + BMI gauge, age, workout frequency, 12-week strength projection chart, smart reminders, equipment, and target muscle focus areas).
- Includes a dedicated **`GO!`** workout player with per-set logging and rest countdowns.

### 4. Dual-Mode Form Coach (100% On-Device)
- Powered by **MediaPipe Pose Landmarker** running locally in the browser:
  1. **Live Camera Mode:** Runs a full-body setup check (framing, lighting, single person), draws a real-time skeleton overlay, counts reps via joint-angle state machines, and speaks posture tips aloud.
  2. **Manual Video Upload Mode:** Analyzes local MP4, WebM, or MOV workout recordings frame-by-frame at `1.0x` or `0.75x` speed.
- **Privacy Guarantee:** Video frames never leave the user's device; only numeric rep counts, confidence scores, and per-rep tips are saved to the database.

### 5. Prescription & Physio Note Analyzer
- Consent-gated upload (Image, PDF, or TXT) or pasted clinical notes.
- Automatically detects mentioned joint precautions (`knee`, `lower_back`, `shoulder`, `wrist`) and matches doctor-recommended or safe beginner library exercises with embedded YouTube tutorials, direct YouTube links, written instructions, and 1-tap addition to Today's workout.

### 6. Monthly Plan, Library, Progress & Athlete Safety
- **4-Week Adaptive Plan:** Generates safe weekly routines with rest days and a lighter Week 4 deload; automatically reduces load if joint discomfort is reported.
- **Curated Exercise Library:** Searchable and filterable by equipment (`No Equipment`, `Home Basics`, `Full Gym`) with embedded video demos, direct YouTube links, written steps, and joint-load warnings.
- **Progress Tracking:** Tracks completed workouts, active streaks, average form scores, and workout history.
- **Athlete & Safety Hub:** Edit preferences, retake PAR-Q+ screening, toggle injury guardrails, configure reminder times & quiet hours, manage consents, export personal data as JSON, or permanently delete your account.

---

## UI & Color System

The interface follows a clean **60-30-10 color balance** designed for high readability and low eye strain:
- **60% Main — Midnight Black (`#0B0D12` / `#121622`):** Primary page canvas, navigation header, and card containers.
- **30% Secondary — Electric Blue (`#1E5EFF` / `#3B82F6`):** Secondary buttons (`Log In`, `Scan`, `Sync`), card borders, and biomechanical skeleton lines.
- **10% Accent — Sunset Orange (`#FF7A1A`, RGB `255, 122, 26`):** Primary Call-To-Action buttons (`Register`, `Start Workout`, `+ Log Set`), active tabs, progress bars, and key highlights.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Tailwind CSS, Vanilla JavaScript (ES Modules), Progressive Web App (`manifest.json`, `sw.js`) |
| **On-Device Vision** | MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`), Web Speech Synthesis |
| **Backend** | Node.js 18+, Express (`type: "module"`), `node-cron`, `multer` |
| **Database** | MySQL / MariaDB (XAMPP + phpMyAdmin) via `mysql2/promise` |
| **Security & Auth** | JWT (`jsonwebtoken`), `bcrypt`, `helmet`, `cors`, `express-rate-limit`, `zod` validation |
| **Optional AI Text** | Anthropic Claude API (`@anthropic-ai/sdk`) with daily quota tracking (`ai_usage`) |

---

## Project Structure

```text
smart-gym/
├── JOURNAL.md                         # Day-by-day development log
├── README.md                          # Project documentation
├── frontend/
│   ├── index.html                     # Landing page, Auth gateway & Main SPA shell
│   ├── manifest.json                  # PWA install manifest
│   ├── sw.js                          # Offline service worker cache
│   └── js/
│       ├── app.js                     # Main UI controller (Today, Coach, Prescription, Library, Plan, Profile)
│       ├── landing.js                 # Landing page & Athlete registration/login logic
│       ├── fitwithai.js               # Multi-step body assessment, split generator & GO! player
│       ├── coach.js                   # MediaPipe live webcam & uploaded video pose analyzer
│       ├── exercises.js               # Curated exercise library & JSON form rule definitions
│       └── store.js                   # LocalStorage state & Backend REST API sync client
└── backend/
    ├── .env                           # Environment configuration (DB, JWT, PORT, GYM_MODE)
    ├── package.json                   # Node.js dependencies & scripts
    ├── database/
    │   └── smart_gym.sql              # Complete MySQL database schema & seed data
    ├── uploads/
    │   └── prescriptions/             # Uploaded prescription files (gitignored)
    └── src/
        ├── db.js                      # MySQL connection pool & JSON parser helper
        ├── server.js                  # Express app, security middleware, static hosting & cron boot
        ├── jobs/
        │   └── reminders.js           # Scheduled daily movement reminder job (node-cron)
        ├── middleware/
        │   └── auth.js                # JWT Bearer authentication middleware
        └── routes/
            ├── auth.js                # Register, login, lockout, verify, forgot/reset password
            ├── me.js                  # Profile, limitations, consents, reminders, export & deletion
            ├── workouts.js            # Exercise library, Today session, workout/set logs & progress
            ├── plans.js               # 4-week monthly plan persistence & daily AI usage cap
            ├── live.js                # Numeric live/uploaded coach session & rep storage
            ├── prescriptions.js       # Consent-gated prescription upload & exercise matcher
            ├── fitwithai.js           # FitWithAI assessment & split state persistence
            └── admin.js               # Internal rules, AI usage & subscription endpoints
```

---

## Getting Started (XAMPP + VS Code)

### 1. Start XAMPP & Import the Database
1. Open the **XAMPP Control Panel** and click **Start** on **Apache** and **MySQL**.
2. Open **`http://localhost/phpmyadmin`** in your browser.
3. Click the **Import** tab, choose `smart-gym/backend/database/smart_gym.sql`, and click **Import** (this automatically creates and selects the `smart_gym` database and seeds the starter exercises).
4. If you imported an earlier version of the SQL file, run this query in the phpMyAdmin **SQL** tab to ensure the body metric and FitWithAI tables exist:
   ```sql
   USE smart_gym;
   ALTER TABLE profiles
     ADD COLUMN IF NOT EXISTS gender ENUM('male','female') DEFAULT 'male' AFTER user_id,
     ADD COLUMN IF NOT EXISTS height_cm DECIMAL(5,1) DEFAULT 175.0 AFTER gender,
     ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(5,1) DEFAULT 70.0 AFTER height_cm;

   CREATE TABLE IF NOT EXISTS fitwithai_profiles (
     user_id INT PRIMARY KEY,
     state_json JSON NOT NULL,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   );
   ```

### 2. Configure Environment Variables
Ensure `smart-gym/backend/.env` contains:
```env
PORT=4000
JWT_SECRET=smart_gym_super_secret_key_change_in_production_2026
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=smart_gym
GYM_MODE=false
ANTHROPIC_API_KEY=
```

### 3. Install Dependencies & Start the Server
Open a terminal in VS Code (`Ctrl + ~`) and run:
```bash
cd smart-gym/backend
npm install
npm start
```
You should see:
```text
Smart Gym API & PWA running at http://localhost:4000 (GYM_MODE=false)
```

### 4. Open & Verify
- **Main Application:** Open **`http://localhost:4000`** in Chrome or Edge.
- **API & MySQL Health Check:** Open **`http://localhost:4000/api/health`** (returns `{"status":"ok","database":"smart_gym","gymMode":false}`).
- **Mobile Camera Testing (Optional):** Mobile browsers require HTTPS for webcam access. Open a second terminal and run:
  ```bash
  npx localtunnel --port 4000
  ```

---

## Database Schema (`smart_gym`)

- **Core & Safety:** `users`, `profiles`, `health_screenings`, `limitations`, `consents`, `data_requests`, `prescriptions`
- **Training & Library:** `exercises`, `exercise_alternatives`, `monthly_plans`, `workout_sessions`, `set_logs`, `fitwithai_profiles`
- **Form Coach (Numeric Only):** `exercise_rules`, `live_sessions`, `live_reps`
- **Engagement & Billing:** `body_metrics`, `reminder_settings`, `push_tokens`, `notifications` (`is_read`), `subscriptions`, `ai_usage`, `audit`
- **Future Gym Mode (Reserved):** `organizations` (kept empty while `GYM_MODE=false`)

---

## API Overview

All protected routes require `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/verify`, `POST /api/auth/forgot`, `POST /api/auth/reset` |
| **Profile & Privacy** | `GET/PUT /api/me`, `PUT /api/me/profile`, `PUT /api/me/limitations`, `POST /api/me/consents`, `POST /api/me/export`, `DELETE /api/me` |
| **Screening** | `GET /api/screening`, `POST /api/screening` |
| **Library & Today** | `GET /api/exercises`, `GET /api/exercises/:id`, `GET /api/exercises/:id/alternatives`, `GET /api/today` |
| **Workouts & Progress** | `POST /api/workouts`, `POST /api/workouts/:id/sets`, `POST /api/workouts/:id/finish`, `POST /api/workouts/repeat-last`, `GET /api/me/progress`, `POST /api/me/body-metrics` |
| **Plans & FitWithAI** | `GET /api/plans/current`, `GET /api/plans/history`, `POST /api/plans/generate`, `GET/POST /api/fitwithai` |
| **Form Coach** | `GET /api/live/exercises`, `GET /api/live/rules/:exercise`, `GET/POST /api/live/sessions` |
| **Prescriptions** | `GET /api/prescriptions`, `POST /api/prescriptions/analyze` |
| **Reminders & Billing** | `GET/PUT /api/me/reminders`, `GET /api/me/notifications`, `POST /api/me/notifications/read`, `GET /api/billing`, `POST /api/billing/checkout` |

---

## Privacy & Safety Guardrails

- **Zero Video Upload:** Camera streams and uploaded video files are analyzed locally in the browser via MediaPipe; only numeric rep counts and form scores reach the backend.
- **Injury-Aware Filtering:** Flagged body parts exclude high-load exercises from generated plans and reduce target depth angles in the Form Coach.
- **GDPR Data Controls:** Users can export all stored profile, screening, prescription, and workout records as JSON or permanently delete their account and associated rows via `ON DELETE CASCADE`.

---

## Development Journal & Git

See [`JOURNAL.md`](./JOURNAL.md) for the day-by-day engineering log. To commit changes in VS Code:
```bash
git add README.md JOURNAL.md
git commit -m "docs: add complete project README and development journal"
```