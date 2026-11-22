// MediaPipe Pose Landmarker live camera coach.

import { FilesetResolver, PoseLandmarker, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
import { EXERCISE_RULES } from './exercises.js';

export class LiveCameraCoach {
  constructor({ videoEl, canvasEl, onStatus, onCue, onRep, onFinish }) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.onStatus = onStatus;
    this.onCue = onCue;
    this.onRep = onRep;
    this.onFinish = onFinish;

    this.landmarker = null;
    this.stream = null;
    this.objectUrl = null;
    this.mode = 'live';
    this.rafId = null;
    this.running = false;
    this.phase = 'idle';
    this.rule = EXERCISE_RULES.squat;
    this.limitations = [];
    this.voiceEnabled = true;

    this.repState = 'up';
    this.repCount = 0;
    this.repScores = [];
    this.repStartTime = 0;
    this.minAngleInRep = 180;
    this.maxAngleInRep = 0;
    this.lastSpokenAt = 0;
    this.holdMs = 0;
    this.lastFrameTs = 0;
    this.confidenceSamples = [];

    this.video.addEventListener('ended', () => {
      if (this.running && this.mode === 'upload') this.stopCamera(true);
    });
  }

  async initModel() {
    if (this.landmarker) return;
    this.onStatus('Loading on-device pose model...');

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );

    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numPoses: 2,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55
    });
  }

  setExercise(slug, limitations = []) {
    this.rule = EXERCISE_RULES[slug] || EXERCISE_RULES.squat;
    this.limitations = limitations;
    this.resetMetrics();
  }

  resetMetrics() {
    this.repState = 'up';
    this.repCount = 0;
    this.repScores = [];
    this.repStartTime = performance.now();
    this.minAngleInRep = 180;
    this.maxAngleInRep = 0;
    this.holdMs = 0;
    this.confidenceSamples = [];
  }

  async startCamera(beginImmediately = false) {
    this.stopCamera(false);
    this.mode = 'live';
    await this.initModel();

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    this.video.removeAttribute('src');
    this.video.controls = false;
    this.video.srcObject = this.stream;
    await this.video.play();

    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;

    this.running = true;
    this.phase = beginImmediately ? 'active' : 'setup_check';
    this.resetMetrics();
    this.lastFrameTs = performance.now();
    this.loop();
  }

  async startVideoFile(file, playbackRate = 1.0) {
    this.stopCamera(false);
    this.mode = 'upload';
    await this.initModel();

    this.objectUrl = URL.createObjectURL(file);
    this.video.srcObject = null;
    this.video.src = this.objectUrl;
    this.video.controls = true;
    this.video.playbackRate = playbackRate;

    await new Promise((resolve, reject) => {
      this.video.onloadedmetadata = () => resolve();
      this.video.onerror = () => reject(new Error('Could not decode this video file. Try MP4 or WebM.'));
    });

    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;

    this.running = true;
    this.phase = 'active';
    this.resetMetrics();
    this.lastFrameTs = performance.now();
    this.onCue(`Analyzing ${file.name}...`);
    await this.video.play();
    this.loop();
  }

  stopCamera(emitReport = false) {
    const wasRunning = this.running;
    const finishedMode = this.mode;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.video.pause();
    this.video.srcObject = null;
    this.video.removeAttribute('src');
    this.video.controls = false;

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (emitReport && wasRunning) {
      const avgConfidence = this.confidenceSamples.length
        ? Math.round((this.confidenceSamples.reduce((sum, value) => sum + value, 0) / this.confidenceSamples.length) * 100)
        : 0;
      const setScore = this.repScores.length
        ? Math.round(this.repScores.reduce((sum, value) => sum + value.score, 0) / this.repScores.length)
        : 0;

      this.onFinish({
        sourceMode: finishedMode,
        exerciseSlug: this.rule.id,
        exerciseName: this.rule.name,
        reps: this.rule.repType === 'hold' ? Math.round(this.holdMs / 1000) : this.repCount,
        repType: this.rule.repType,
        score: avgConfidence < 50 ? null : setScore,
        confidence: avgConfidence,
        repDetails: this.repScores
      });
    }

    this.phase = 'idle';
  }

  speak(text) {
    this.onCue(text);
    if (!this.voiceEnabled || this.mode === 'upload' || !('speechSynthesis' in window)) return;

    const now = performance.now();
    if (now - this.lastSpokenAt < 3200) return;

    this.lastSpokenAt = now;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    window.speechSynthesis.speak(utter);
  }

  calcAngle(a, b, c) {
    const radians = Math.atan2(c.y - b.y, c.x - b.x)
      - Math.atan2(a.y - b.y, a.x - b.x);

    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
  }

  checkSetup(landmarksList) {
    if (!landmarksList || landmarksList.length === 0) {
      return { ok: false, reason: 'Step into view so your whole body is visible.' };
    }

    if (landmarksList.length > 1) {
      return { ok: false, reason: 'Multiple people detected. Ensure only one person is in frame.' };
    }

    const lm = landmarksList[0];
    const keyIndices = [11, 12, 23, 24, 25, 26, 27, 28];
    const visibleCount = keyIndices.filter((i) => (lm[i]?.visibility || 0) > 0.55).length;
    const inBounds = keyIndices.every((i) => (
      lm[i].x > 0.03
      && lm[i].x < 0.97
      && lm[i].y > 0.03
      && lm[i].y < 0.98
    ));

    if (visibleCount < 6 || !inBounds) {
      return {
        ok: false,
        reason: 'Move back slightly and brighten the room until head-to-ankle joints turn green.'
      };
    }

    return { ok: true, reason: 'Setup check passed! Full body clear.' };
  }

  processExercise(lm, dtMs) {
    const { a, b, c } = this.rule.joints;
    const angle = this.calcAngle(lm[a], lm[b], lm[c]);
    const vis = ((lm[a].visibility || 0)
      + (lm[b].visibility || 0)
      + (lm[c].visibility || 0)) / 3;

    this.confidenceSamples.push(vis);

    if (vis < 0.5) {
      this.onCue('Low visibility — adjust lighting or angle');
      return false;
    }

    if (this.rule.repType === 'hold') {
      const aligned = angle >= 162 && angle <= 192;

      if (aligned) {
        this.holdMs += dtMs;
        const sec = Math.floor(this.holdMs / 1000);
        this.repScores.push({ rep: sec, score: 92 });
        this.onRep(sec, 92, true);

        if (sec > 0 && sec % 10 === 0) {
          this.speak(`${sec} seconds held. Keep breathing.`);
        }
      } else {
        this.speak('Keep shoulders, hips, and ankles in a straight line.');
      }

      return aligned;
    }

    let targetDown = this.rule.downAngle;

    if (this.rule.injuryAdjustedDownAngle) {
      for (const injury of this.limitations) {
        if (this.rule.injuryAdjustedDownAngle[injury]) {
          targetDown = this.rule.injuryAdjustedDownAngle[injury];
        }
      }
    }

    if (!this.rule.inverted) {
      if (this.repState === 'up' && angle < targetDown + 15) {
        this.repState = 'down';
        this.repStartTime = performance.now();
        this.minAngleInRep = angle;
      } else if (this.repState === 'down') {
        this.minAngleInRep = Math.min(this.minAngleInRep, angle);

        if (angle > this.rule.upAngle) {
          this.repState = 'up';
          const durationMs = performance.now() - this.repStartTime;
          this.scoreDynamicRep(this.minAngleInRep <= targetDown, durationMs);
        }
      }
    } else {
      if (this.repState === 'up' && angle > targetDown + 15) {
        this.repState = 'down';
        this.repStartTime = performance.now();
        this.maxAngleInRep = angle;
      } else if (this.repState === 'down') {
        this.maxAngleInRep = Math.max(this.maxAngleInRep, angle);

        if (angle < this.rule.downAngle) {
          this.repState = 'up';
          const durationMs = performance.now() - this.repStartTime;
          this.scoreDynamicRep(
            this.maxAngleInRep >= this.rule.upAngle - 5,
            durationMs
          );
        }
      }
    }

    return true;
  }

  scoreDynamicRep(depthOk, durationMs) {
    this.repCount += 1;
    let score = 100;
    let tip = 'Smooth rep! Nice control.';

    if (!depthOk) {
      score -= 22;
      tip = this.rule.checks[0]?.cue || 'Try slightly fuller range of motion';
    } else if (durationMs < 950) {
      score -= 15;
      tip = 'Slow down slightly for better control';
    }

    if (this.repCount > 8 && !depthOk) score -= 5;
    score = Math.max(40, score);

    this.repScores.push({
      rep: this.repCount,
      score,
      durationMs: Math.round(durationMs),
      tip
    });

    this.onRep(this.repCount, score, depthOk);
    this.speak(depthOk ? `Rep ${this.repCount}. ${tip}` : tip);
  }

  beginActiveSet() {
    if (!this.running) return false;
    this.resetMetrics();
    this.phase = 'active';
    this.onStatus('Set active — follow the live coaching cues.', true);
    this.onCue('Set started. Follow the form cues.');
    return true;
  }

  loop() {
    if (!this.running) return;

    const now = performance.now();
    const dtMs = now - this.lastFrameTs;
    this.lastFrameTs = now;

    if (!this.video.paused && !this.video.ended && this.video.readyState >= 2 && this.landmarker) {
      const results = this.landmarker.detectForVideo(this.video, now);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      const setup = this.checkSetup(results.landmarks);

      if (this.phase === 'setup_check') {
        this.onStatus(setup.reason, setup.ok);
      }

      if (results.landmarks && results.landmarks[0]) {
        const lm = results.landmarks[0];
        let formGood = setup.ok;

        if (this.phase === 'active') {
          formGood = this.processExercise(lm, dtMs);
        }

        const drawer = new DrawingUtils(this.ctx);
        drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
          color: formGood ? '#10b981' : '#f59e0b',
          lineWidth: 3
        });
        drawer.drawLandmarks(lm, {
          color: formGood ? '#34d399' : '#ef4444',
          radius: 4
        });
      }
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }
}
