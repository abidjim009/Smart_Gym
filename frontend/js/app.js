import { EXERCISES, EXERCISE_RULES } from './exercises.js';
import { store } from './store.js';
import { LiveCameraCoach } from './coach.js';
import { initFitWithAI, renderFitWithAI } from './fitwithai.js';
import { initLandingAndAuth } from './landing.js';

// Onboarding, PAR-Q+, Today, Coach, Prescription, Library, Plan, Progress & Profile UI.

let activeWorkout = null;
let restTimerInterval = null;
let restSecondsRemaining = 0;
let pendingCameraScanTarget = null;
let coach = null;
let toastTimeout = null;
let selectedPlanDay = ((new Date().getDay() + 6) % 7) + 1;
let todayReadiness = 'normal';
let expandedDemoIds = new Set();
let cachedLibraryExercises = [...EXERCISES];

const $ = (id) => document.getElementById(id);

function openModal(id) {
  $(id)?.classList.remove('hidden');
}

function closeModal(id) {
  $(id)?.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const toast = $('toast-banner');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initLandingAndAuth(() => {
    generateMonthlyPlan();
    initFitWithAI();
    renderAll();
    showToast(`Welcome, ${store.state.user.displayName}!`);
  });

  bindNavigation();
  bindWelcomeWizard();
  bindOnboarding();
  bindScreening();
  bindProfilePage();
  bindProfileActions();
  bindAuth();
  bindModalCloseButtons();
  initCoach();
  bindPrescriptionPage();
  bindLibraryFilters();
  initFitWithAI();
  renderAll();
  syncLibraryFromServer();

  if (store.state.isAuthenticated && !store.state.profile.onboarded && !store.state.profile.skippedSetup) {
    openWelcomeOverlay(0);
  }
});

// ============================================================================
// WELCOME & 4-STEP ONBOARDING WIZARD
// ============================================================================
const welcomeDraft = {
  goal: store.state.profile.goal || 'build_strength',
  experience: store.state.profile.experience || 'new',
  equipment: store.state.profile.equipment || 'none'
};

function openWelcomeOverlay(step = 0) {
  if (!$('onboarding-overlay')) return;
  welcomeDraft.goal = store.state.profile.goal || 'build_strength';
  welcomeDraft.experience = store.state.profile.experience || 'new';
  welcomeDraft.equipment = store.state.profile.equipment || 'none';

  if ($('wiz-name')) {
    $('wiz-name').value = store.state.user.displayName !== 'Athlete' ? store.state.user.displayName : '';
  }
  if ($('wiz-days')) $('wiz-days').value = String(store.state.profile.daysPerWeek || 3);
  if ($('wiz-minutes')) $('wiz-minutes').value = String(store.state.profile.minutesPerSession || 25);
  if ($('wiz-units')) $('wiz-units').value = store.state.user.units || 'kg';
  if ($('wiz-lang')) $('wiz-lang').value = store.state.user.language || 'en';
  if ($('wiz-timezone')) $('wiz-timezone').value = store.state.user.timeZone || 'UTC';

  syncWelcomeCards('wiz-goal-cards', welcomeDraft.goal);
  syncWelcomeCards('wiz-exp-cards', welcomeDraft.experience);
  syncWelcomeCards('wiz-equip-cards', welcomeDraft.equipment);
  showWelcomeStep(step);
  $('onboarding-overlay').classList.remove('hidden');
}

function closeWelcomeOverlay() {
  $('onboarding-overlay')?.classList.add('hidden');
}

function showWelcomeStep(step) {
  for (let index = 0; index <= 4; index += 1) {
    const element = $(index === 4 ? 'form-wizard-complete' : `wizard-step-${index}`);
    element?.classList.toggle('hidden', index !== step);
  }

  const progress = $('wizard-progress-header');
  if (step === 0) {
    progress?.classList.add('hidden');
  } else {
    progress?.classList.remove('hidden');
    if ($('wizard-step-label')) $('wizard-step-label').textContent = `Step ${step} of 4`;
    if ($('wizard-progress-bar')) $('wizard-progress-bar').style.width = `${step * 25}%`;
  }
}

function syncWelcomeCards(containerId, selectedValue) {
  document.querySelectorAll(`#${containerId} .choice-card`).forEach((card) => {
    card.classList.toggle('selected', card.dataset.value === selectedValue);
  });
}

function bindWelcomeCards(containerId, draftKey) {
  document.querySelectorAll(`#${containerId} .choice-card`).forEach((card) => {
    card.addEventListener('click', () => {
      welcomeDraft[draftKey] = card.dataset.value;
      syncWelcomeCards(containerId, welcomeDraft[draftKey]);
    });
  });
}

function skipWelcomeSetup() {
  store.state.profile.skippedSetup = true;
  store.save();
  if (!store.state.monthlyPlan) generateMonthlyPlan();
  closeWelcomeOverlay();
  renderAll();
}

function bindWelcomeWizard() {
  bindWelcomeCards('wiz-goal-cards', 'goal');
  bindWelcomeCards('wiz-exp-cards', 'experience');
  bindWelcomeCards('wiz-equip-cards', 'equipment');

  $('btn-welcome-start')?.addEventListener('click', () => showWelcomeStep(1));
  $('btn-welcome-skip')?.addEventListener('click', skipWelcomeSetup);
  $('btn-wizard-skip-top')?.addEventListener('click', skipWelcomeSetup);
  $('btn-reopen-welcome')?.addEventListener('click', () => openWelcomeOverlay(1));
  $('btn-edit-setup')?.addEventListener('click', () => openWelcomeOverlay(1));

  $('btn-welcome-signin')?.addEventListener('click', () => openModal('modal-auth'));
  $('btn-header-signin')?.addEventListener('click', () => openModal('modal-auth'));

  document.querySelectorAll('[data-wiz-next]').forEach((button) => {
    button.addEventListener('click', () => showWelcomeStep(Number(button.dataset.wizNext)));
  });
  document.querySelectorAll('[data-wiz-prev]').forEach((button) => {
    button.addEventListener('click', () => showWelcomeStep(Number(button.dataset.wizPrev)));
  });

  $('form-wizard-complete')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const riskFlagged = ['q_chest', 'q_dizzy', 'q_bone', 'q_meds'].some((key) => form.get(key) === 'yes');
    const limitations = form.getAll('limitations');

    const name = $('wiz-name')?.value.trim();
    if (name) store.state.user.displayName = name;
    if ($('wiz-units')) store.state.user.units = $('wiz-units').value;
    if ($('wiz-lang')) store.state.user.language = $('wiz-lang').value;
    if ($('wiz-timezone')) store.state.user.timeZone = $('wiz-timezone').value || 'UTC';

    store.state.profile = {
      ...store.state.profile,
      onboarded: true,
      skippedSetup: false,
      goal: riskFlagged ? 'recover' : welcomeDraft.goal,
      experience: welcomeDraft.experience,
      equipment: welcomeDraft.equipment,
      daysPerWeek: Number($('wiz-days')?.value || 3),
      minutesPerSession: Number($('wiz-minutes')?.value || 25)
    };
    store.state.screening = {
      completed: true,
      riskFlagged,
      answers: Object.fromEntries(form.entries()),
      completedAt: new Date().toISOString()
    };
    store.state.limitations = limitations;
    store.state.consents.healthData = true;
    store.save();

    await store.api('/me/profile', { method: 'PUT', body: JSON.stringify(store.state.profile) });
    await store.api('/screening', {
      method: 'POST',
      body: JSON.stringify({ answers: store.state.screening.answers, riskFlagged })
    });
    await store.api('/me/limitations', {
      method: 'PUT',
      body: JSON.stringify({ limitations })
    });

    generateMonthlyPlan();
    closeWelcomeOverlay();
    renderAll();
  });
}

function bindNavigation() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  $('btn-header-profile')?.addEventListener('click', () => {
    switchTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('btn-header-auth')?.addEventListener('click', () => {
    if (store.state.token) {
      store.logout();
      renderAll();
      showToast('Signed out. Switched to local offline mode.');
    } else {
      openModal('modal-auth');
    }
  });
}

function bindOnboarding() {
  $('form-onboarding')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);

    store.state.user.displayName = form.get('displayName') || 'Athlete';
    store.state.user.units = form.get('units') || 'kg';
    store.state.profile = {
      ...store.state.profile,
      onboarded: true,
      goal: form.get('goal'),
      experience: form.get('experience'),
      equipment: form.get('equipment'),
      daysPerWeek: Number(form.get('daysPerWeek')),
      minutesPerSession: Number(form.get('minutesPerSession'))
    };
    store.save();
    await store.api('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(store.state.profile)
    });

    closeModal('modal-onboarding');
    if (!store.state.screening.completed) openModal('modal-screening');
    else {
      generateMonthlyPlan();
      renderAll();
    }
  });
}

function bindScreening() {
  $('form-screening')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const riskAnswers = ['q_chest', 'q_dizzy', 'q_bone', 'q_meds'].filter((key) => form.get(key) === 'yes');

    store.state.screening = {
      completed: true,
      riskFlagged: riskAnswers.length > 0,
      answers: Object.fromEntries(form.entries()),
      completedAt: new Date().toISOString()
    };
    store.state.limitations = form.getAll('limitations');
    store.state.consents.healthData = true;
    if (store.state.screening.riskFlagged) store.state.profile.goal = 'recover';
    store.save();

    await store.api('/screening', {
      method: 'POST',
      body: JSON.stringify({
        answers: store.state.screening.answers,
        riskFlagged: store.state.screening.riskFlagged
      })
    });
    await store.api('/me/limitations', {
      method: 'PUT',
      body: JSON.stringify({ limitations: store.state.limitations })
    });

    closeModal('modal-screening');
    generateMonthlyPlan();
    renderAll();
  });
}

function bindProfileActions() {
  $('btn-export-data')?.addEventListener('click', () => {
    const blob = new Blob([store.exportAllData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-gym-${(store.state.user.displayName || 'athlete').toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Personal data exported as JSON.');
  });

  $('btn-delete-account')?.addEventListener('click', async () => {
    if (!confirm('Delete all personal data, screening answers, logs, and account? This cannot be undone.')) return;
    await store.deleteAccount();
    location.reload();
  });
}

function bindAuth() {
  $('form-auth')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const error = $('auth-error');
    error?.classList.add('hidden');

    try {
      await store.loginOrRegister(form.get('authMode'), {
        email: form.get('email'),
        password: form.get('password'),
        displayName: form.get('displayName') || store.state.user.displayName,
        birthYear: Number(form.get('birthYear') || 2000)
      });
      closeModal('modal-auth');
      closeWelcomeOverlay();
      renderAll();
    } catch (caught) {
      if (error) {
        error.textContent = `${caught.message}. Start the backend on port 4000 or explore locally.`;
        error.classList.remove('hidden');
      }
    }
  });
}

// ============================================================================
// SAFE MONTHLY PLAN BUILDER
// ============================================================================
function getSafeExercises() {
  const { equipment } = store.state.profile;

  return EXERCISES.filter((exercise) => {
    if (equipment === 'none' && exercise.equipment !== 'none') return false;
    if (equipment === 'home_basics' && exercise.equipment === 'full_gym') return false;
    return !exercise.bodyPartsLoaded.some((part) => store.state.limitations.includes(part));
  });
}

function generateMonthlyPlan(reduceLoad = false) {
  const safePool = getSafeExercises();
  const pool = safePool.length >= 3
    ? safePool
    : EXERCISES.filter((exercise) => exercise.equipment === 'none');

  const daysPerWeek = store.state.profile.daysPerWeek || 3;
  const riskAdjusted = store.state.screening.riskFlagged || reduceLoad;
  const baseSets = riskAdjusted ? 2 : 3;
  const baseReps = store.state.profile.goal === 'build_strength' ? 8 : 12;

  const weeks = [1, 2, 3, 4].map((weekNumber) => {
    const deload = weekNumber === 4;
    const sets = deload ? Math.max(2, baseSets - 1) : baseSets + (weekNumber === 3 ? 1 : 0);
    const reps = deload ? Math.max(6, baseReps - 2) : baseReps + (weekNumber - 1);

    const days = [];
    for (let day = 1; day <= 7; day += 1) {
      if (day <= daysPerWeek) {
        const items = [];
        for (let i = 0; i < Math.min(4, pool.length); i += 1) {
          const exercise = pool[(day + weekNumber + i) % pool.length];
          items.push({
            exerciseId: exercise.id,
            name: exercise.name,
            sets,
            reps: exercise.slug === 'plank' ? '30s' : reps
          });
        }
        days.push({
          day,
          isRest: false,
          title: `Day ${day} Full-Body Session`,
          items
        });
      } else {
        days.push({
          day,
          isRest: true,
          title: 'Active Recovery / Rest',
          suggestion: '20-minute easy walk or gentle mobility stretch'
        });
      }
    }

    return {
      week: weekNumber,
      label: deload ? 'Week 4 (Lighter Deload)' : `Week ${weekNumber}`,
      days
    };
  });

  store.state.monthlyPlan = {
    createdAt: new Date().toISOString(),
    goal: store.state.profile.goal,
    weeks
  };
  store.save();
  store.api('/plans/generate', {
    method: 'POST',
    body: JSON.stringify(store.state.monthlyPlan)
  });
}

function getTodaysPlanDay(dayOverride = null) {
  if (!store.state.monthlyPlan) generateMonthlyPlan();
  const dayNum = dayOverride || selectedPlanDay || (((new Date().getDay() + 6) % 7) + 1);
  return store.state.monthlyPlan.weeks[0].days.find((day) => day.day === dayNum)
    || store.state.monthlyPlan.weeks[0].days[0];
}

// ============================================================================
// TODAY DASHBOARD & 4-BLOCK ACTIVE WORKOUT LOGGER
// ============================================================================
function resolveCoachSlug(exerciseSlug) {
  if (EXERCISE_RULES[exerciseSlug]) return exerciseSlug;
  if (['wall_sit', 'goblet_squat'].includes(exerciseSlug)) return 'squat';
  if (['wall_pushup', 'dumbbell_floor_press', 'barbell_bench'].includes(exerciseSlug)) return 'pushup';
  if (exerciseSlug === 'bird_dog') return 'plank';
  return 'squat';
}

function buildActiveItem(rawItem, lastWeight = 0) {
  const exObj = EXERCISES.find((e) => e.id === rawItem.exerciseId) || EXERCISES.find((e) => e.slug === rawItem.slug);
  const slug = exObj?.slug || rawItem.slug || 'squat';
  const isStatic = slug === 'plank' || slug === 'wall_sit' || String(rawItem.reps).toLowerCase().endsWith('s');
  const numericTarget = parseInt(String(rawItem.reps), 10) || (isStatic ? 30 : 10);
  let targetSets = rawItem.sets || 3;
  let adjustedTarget = numericTarget;

  if (todayReadiness === 'tired') {
    targetSets = Math.max(2, targetSets - 1);
    adjustedTarget = isStatic ? Math.max(15, numericTarget - 10) : Math.max(6, numericTarget - 2);
  } else if (todayReadiness === 'energized') {
    adjustedTarget = isStatic ? numericTarget + 5 : numericTarget + 2;
  }

  return {
    exerciseId: exObj?.id || rawItem.exerciseId || 1,
    slug,
    name: rawItem.name,
    targetSets,
    setsCompleted: 0,
    isStatic,
    targetReps: adjustedTarget,
    inputMode: 'manual',
    manualValue: lastWeight || 0,
    scanCode: '',
    lastScanScore: null
  };
}

window.selectTodayDay = (dayNum) => {
  selectedPlanDay = dayNum;
  renderToday();
};

window.setTodayReadiness = (level) => {
  todayReadiness = level;
  renderToday();
  const labels = {
    energized: 'Energized mode: +2 reps added to today’s targets!',
    normal: 'Balanced mode: Standard plan targets active.',
    tired: 'Recovery mode: Volume reduced for gentle movement.'
  };
  showToast(labels[level]);
};

window.addTodayWater = (ml) => {
  const habits = getDailyHabits();
  habits.waterMl = Math.min(4000, Math.max(0, (habits.waterMl || 0) + ml));
  saveDailyHabits(habits);
  renderToday();
};

window.toggleDailyHabit = (key) => {
  const habits = getDailyHabits();
  habits[key] = !habits[key];
  saveDailyHabits(habits);
  renderToday();
};

window.toggleInlineDemo = (exerciseId) => {
  if (expandedDemoIds.has(exerciseId)) expandedDemoIds.delete(exerciseId);
  else expandedDemoIds.add(exerciseId);
  renderToday();
};

window.loadFitWithAIDayIntoToday = () => {
  const fit = getFitWithAISnapshot();
  if (!fit?.generatedPlan?.days?.length) {
    switchTab('fitwithai');
    return;
  }
  const splitDay = fit.generatedPlan.days[fit.selectedDayIndex || 0] || fit.generatedPlan.days[0];
  activeWorkout = {
    id: Date.now(),
    startedAt: new Date().toISOString(),
    title: `fitwithAI: ${splitDay.dayTitle}`,
    items: splitDay.exercises.map((ex) =>
      buildActiveItem({
        exerciseId: EXERCISES.find((e) => e.slug === ex.slug)?.id || 1,
        slug: ex.slug,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps
      })
    ),
    loggedSets: []
  };
  renderToday();
  showToast(`Loaded "${splitDay.dayTitle}" from fitwithAI!`);
};

window.launchQuickCameraTest = () => {
  const selectEl = $('coach-exercise-select');
  if (selectEl) selectEl.value = 'squat';
  switchTab('coach');
};

window.startTodayWorkout = () => {
  const today = getTodaysPlanDay();
  const rawItems = today.isRest
    ? [{ exerciseId: 4, name: 'Glute Bridge', sets: 2, reps: 10 }, { exerciseId: 11, name: 'Bird-Dog Core Stability', sets: 2, reps: 8 }]
    : today.items;
  activeWorkout = {
    id: Date.now(),
    startedAt: new Date().toISOString(),
    title: today.isRest ? 'Gentle Recovery Session' : today.title,
    items: rawItems.map((item) => buildActiveItem(item, 0)),
    loggedSets: []
  };
  renderToday();
};

window.repeatLastWorkout = () => {
  const last = store.state.workoutLogs[0];
  if (!last) return alert('No previous workout logged yet.');
  const grouped = {};
  last.sets.forEach((set) => {
    if (!grouped[set.exerciseId]) {
      grouped[set.exerciseId] = {
        exerciseId: set.exerciseId,
        name: set.exerciseName,
        sets: 0,
        reps: set.reps,
        lastWeight: set.weight || 0
      };
    }
    grouped[set.exerciseId].sets += 1;
  });
  activeWorkout = {
    id: Date.now(),
    startedAt: new Date().toISOString(),
    title: `Repeat: ${last.title}`,
    items: Object.values(grouped).map((item) => buildActiveItem(item, item.lastWeight)),
    loggedSets: []
  };
  renderToday();
};

window.resetExerciseSets = (index) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  item.setsCompleted = 0;
  activeWorkout.loggedSets = activeWorkout.loggedSets.filter((set) => set.exerciseId !== item.exerciseId);
  renderToday();
  showToast(`${item.name}: Set counter restarted to 0.`);
};

window.toggleExerciseStatic = (index) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  item.isStatic = !item.isStatic;
  renderToday();
};

window.updateExerciseReps = (index, val) => {
  const item = activeWorkout?.items?.[index];
  if (item) item.targetReps = Math.max(1, Number(val) || 1);
};

window.setBlock3Mode = (index, mode) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  item.inputMode = mode;
  renderToday();
};

window.updateBlock3Value = (index, val) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  if (item.inputMode === 'scan') item.scanCode = val;
  else item.manualValue = Number(val) || 0;
};

window.swapExercise = (index) => {
  const current = activeWorkout.items[index];
  const ex = EXERCISES.find((item) => item.id === current.exerciseId);
  const alt = EXERCISES.find((item) => item.id === (ex?.alternatives?.[0] || 4)) || EXERCISES[0];
  activeWorkout.items[index] = buildActiveItem(
    { exerciseId: alt.id, name: `${alt.name} (Swapped)`, sets: current.targetSets, reps: current.targetReps },
    0
  );
  renderToday();
};

window.logSet = (index) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  item.setsCompleted += 1;
  activeWorkout.loggedSets.push({
    exerciseId: item.exerciseId,
    exerciseName: item.name,
    setNumber: item.setsCompleted,
    reps: item.targetReps,
    isStatic: item.isStatic,
    weight: item.inputMode === 'manual' ? Number(item.manualValue || 0) : 0,
    scanCode: item.inputMode === 'scan' ? item.scanCode : null,
    scanScore: item.lastScanScore,
    effort: item.lastScanScore ? `scan:${item.lastScanScore}%` : 'moderate'
  });
  startRestTimer(60);
  renderToday();
  showToast(`Logged Set #${item.setsCompleted} for ${item.name}`);
};

window.redirectToCameraScan = async (index) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  const ruleSlug = resolveCoachSlug(item.slug);
  pendingCameraScanTarget = { index, exerciseId: item.exerciseId, exerciseName: item.name, ruleSlug };
  const select = $('coach-exercise-select');
  if (select) {
    select.value = ruleSlug;
    const rule = EXERCISE_RULES[ruleSlug];
    if (rule && $('coach-setup-guide')) {
      $('coach-setup-guide').textContent = `Camera setup for ${item.name}: ${rule.cameraPosition}`;
    }
  }
  switchTab('coach');
  $('btn-mode-live')?.click();
  const consent = $('coach-consent-check');
  if (consent) consent.checked = true;
  store.state.consents.cameraOnDevice = true;
  store.save();
  coach.setExercise(ruleSlug, store.state.limitations);
  $('coach-report-box')?.classList.add('hidden');
  $('coach-start-controls')?.classList.add('hidden');
  $('coach-active-controls')?.classList.remove('hidden');
  try {
    await coach.startCamera(false);
    showToast(`Camera opened to scan ${item.name}. Check your position, then begin the set.`);
  } catch (error) {
    $('coach-active-controls')?.classList.add('hidden');
    $('coach-start-controls')?.classList.remove('hidden');
    alert(`Camera could not start: ${error?.message || 'Camera permission or device access failed.'}`);
  }
};

window.returnScannedSetToToday = () => {
  pendingCameraScanTarget = null;
  switchTab('today');
};

window.adjustRestTimer = (delta) => {
  restSecondsRemaining = Math.max(5, restSecondsRemaining + delta);
  if ($('rest-timer-val')) $('rest-timer-val').textContent = `${restSecondsRemaining}s`;
};

window.skipRestTimer = () => {
  clearInterval(restTimerInterval);
  restSecondsRemaining = 0;
  $('rest-timer-box')?.classList.add('hidden');
};

function startRestTimer(seconds) {
  clearInterval(restTimerInterval);
  restSecondsRemaining = seconds;
  const box = $('rest-timer-box');
  if (!box) return;
  box.classList.remove('hidden');
  if ($('rest-timer-val')) $('rest-timer-val').textContent = `${restSecondsRemaining}s`;
  restTimerInterval = setInterval(() => {
    restSecondsRemaining -= 1;
    if (restSecondsRemaining <= 0) {
      clearInterval(restTimerInterval);
      box.classList.add('hidden');
    } else if ($('rest-timer-val')) {
      $('rest-timer-val').textContent = `${restSecondsRemaining}s`;
    }
  }, 1000);
}

window.stopWorkoutEmergency = () => {
  clearInterval(restTimerInterval);
  activeWorkout = null;
  pendingCameraScanTarget = null;
  alert('Workout stopped. Rest, hydrate, and seek medical help if pain or symptoms persist.');
  renderToday();
};

window.finishWorkout = async () => {
  if (!activeWorkout) return;
  const painReported = $('workout-pain-check')?.checked || false;
  const completed = {
    id: activeWorkout.id,
    date: new Date().toISOString().slice(0, 10),
    title: activeWorkout.title,
    durationMin: Math.max(5, Math.round((Date.now() - new Date(activeWorkout.startedAt)) / 60000)),
    sets: activeWorkout.loggedSets,
    painReported
  };
  store.state.workoutLogs.unshift(completed);
  if (painReported) generateMonthlyPlan(true);
  store.save();
  await store.api('/workouts', { method: 'POST', body: JSON.stringify(completed) });
  activeWorkout = null;
  pendingCameraScanTarget = null;
  clearInterval(restTimerInterval);
  renderAll();
  showToast('Workout saved to your history!');
};

function renderActiveWorkout(riskBanner) {
  const totalTarget = activeWorkout.items.reduce((sum, item) => sum + item.targetSets, 0);
  const totalDone = activeWorkout.items.reduce((sum, item) => sum + item.setsCompleted, 0);
  const progress = totalTarget ? Math.min(100, Math.round((totalDone / totalTarget) * 100)) : 0;

  $('today-content').innerHTML = `
    ${riskBanner}
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5">
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div><span class="text-xs uppercase tracking-wider text-emerald-400 font-bold">Active Session</span><h2 class="text-2xl font-extrabold mt-0.5">${escapeHtml(activeWorkout.title)}</h2></div>
          <button onclick="stopWorkoutEmergency()" class="min-h-[46px] px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm">STOP</button>
        </div>
        <div class="flex justify-between text-xs text-slate-400 mb-1.5"><span>${totalDone} of ${totalTarget} sets</span><strong class="text-emerald-400">${progress}%</strong></div>
        <div class="h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-emerald-500 to-sky-400" style="width:${progress}%"></div></div>
      </div>

      <div id="rest-timer-box" class="${restSecondsRemaining > 0 ? '' : 'hidden'} p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500 flex flex-wrap items-center justify-between gap-3">
        <div><span class="text-xs font-bold uppercase text-emerald-300">Rest Timer</span><div id="rest-timer-val" class="text-3xl font-black">${restSecondsRemaining}s</div></div>
        <div class="flex gap-2"><button onclick="adjustRestTimer(-15)" class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs">-15s</button><button onclick="adjustRestTimer(15)" class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs">+15s</button><button onclick="skipRestTimer()" class="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-xs font-bold">Skip</button></div>
      </div>

      <div class="space-y-4">
        ${activeWorkout.items.map((item, idx) => {
          const ex = EXERCISES.find((e) => e.id === item.exerciseId);
          const demoOpen = expandedDemoIds.has(item.exerciseId);
          return `<div class="p-4 sm:p-5 rounded-2xl bg-slate-800/70 border border-slate-700 space-y-3">
            <div class="flex flex-wrap justify-between items-center gap-2"><div><h3 class="font-extrabold text-lg">${escapeHtml(item.name)}</h3><p class="text-xs text-slate-400">Target: ${item.targetSets} × ${item.targetReps}${item.isStatic ? 's (Static)' : ' reps'} • Logged: <strong class="text-emerald-400">${item.setsCompleted} sets</strong></p></div><div class="flex gap-2">${ex ? `<button onclick="toggleInlineDemo(${item.exerciseId})" class="min-h-[36px] px-3 rounded-xl bg-slate-900 text-sky-300 border border-slate-700 text-xs">${demoOpen ? 'Hide Guide' : '▶ Demo & Steps'}</button>` : ''}<button onclick="swapExercise(${idx})" class="min-h-[36px] px-3 rounded-xl bg-slate-900 border border-slate-600 text-xs">Swap</button></div></div>
            ${demoOpen && ex ? `<div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 grid md:grid-cols-2 gap-3"><div class="aspect-video rounded-lg overflow-hidden"><iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${ex.youtubeId}?rel=0" title="${escapeHtml(ex.name)}" loading="lazy" allowfullscreen></iframe></div><div><p class="font-bold text-emerald-400 text-xs mb-1">Form Steps:</p><ol class="list-decimal pl-4 text-xs text-slate-300 space-y-1">${ex.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol></div></div>` : ''}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>1. Sets Done</span><button onclick="resetExerciseSets(${idx})" class="px-1.5 rounded bg-slate-800 border border-slate-700 font-bold">↺ 0</button></div><div class="flex justify-between"><strong class="text-xl text-emerald-400">${item.setsCompleted}</strong><span class="text-[11px] text-slate-500">of ${item.targetSets} sets</span></div></div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>${item.isStatic ? '2. Static (Sec)' : '2. Reps'}</span><button onclick="toggleExerciseStatic(${idx})" class="px-1.5 rounded bg-slate-800 text-sky-300 border border-slate-700 text-[9px]">${item.isStatic ? 'Switch Reps' : 'Switch Static'}</button></div><input type="number" min="1" value="${item.targetReps}" onchange="updateExerciseReps(${idx},this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-bold"></div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>3. ${item.inputMode === 'scan' ? 'Scan' : 'Manual (' + store.state.user.units + ')'}</span><div class="inline-flex bg-slate-800 p-0.5 rounded"><button onclick="setBlock3Mode(${idx},'manual')" class="px-1.5 text-[9px] ${item.inputMode === 'manual' ? 'bg-emerald-600 rounded text-white' : 'text-slate-400'}">Manual</button><button onclick="setBlock3Mode(${idx},'scan')" class="px-1.5 text-[9px] ${item.inputMode === 'scan' ? 'bg-sky-600 rounded text-white' : 'text-slate-400'}">Scan</button></div></div>${item.inputMode === 'scan' ? `<input type="text" value="${escapeHtml(item.scanCode || '')}" onchange="updateBlock3Value(${idx},this.value)" class="w-full bg-slate-800 border border-sky-600/50 rounded-lg px-2.5 py-1 text-xs text-sky-300" placeholder="Scan code or score...">` : `<input type="number" step="0.5" value="${item.manualValue}" onchange="updateBlock3Value(${idx},this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-bold">`}</div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><span class="text-[10px] uppercase text-slate-400 block mb-1">4. Log &amp; Evaluate</span><div class="flex gap-1.5"><button onclick="logSet(${idx})" class="flex-1 min-h-[38px] px-2.5 rounded-lg bg-emerald-600 font-bold text-xs whitespace-nowrap">+ Log Set</button><button onclick="redirectToCameraScan(${idx})" class="min-h-[38px] px-2.5 rounded-lg bg-sky-600 font-bold text-xs whitespace-nowrap">📷 Scan</button></div></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="mt-5 pt-4 border-t border-slate-800 flex flex-wrap justify-between gap-3"><label class="flex items-center gap-2 text-sm text-slate-300"><input id="workout-pain-check" type="checkbox" class="accent-emerald-500">Report joint/muscle discomfort</label><button onclick="finishWorkout()" class="min-h-[48px] px-6 rounded-xl bg-emerald-600 font-bold">Finish Workout</button></div>
    </div>
  `;
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyHabits() {
  try {
    return JSON.parse(localStorage.getItem(`smart_gym_habits_${getTodayDateKey()}`))
      || { waterMl: 750, waterGoal: 2500, warmup: false, stretch: false };
  } catch {
    return { waterMl: 750, waterGoal: 2500, warmup: false, stretch: false };
  }
}

function saveDailyHabits(habits) {
  localStorage.setItem(`smart_gym_habits_${getTodayDateKey()}`, JSON.stringify(habits));
}

function getFitWithAISnapshot() {
  try {
    return JSON.parse(localStorage.getItem('smart_gym_fitwithai_v1'));
  } catch {
    return null;
  }
}

function getAthleteStatsSummary() {
  const u = store.state.user || {};
  const p = store.state.profile || {};
  const heightCm = Number(p.heightCm || 178);
  const weightKg = Number(p.weightKg || 70);
  const age = Number(u.age || (u.birthYear ? new Date().getFullYear() - u.birthYear : 23));
  const gender = p.gender || 'male';
  const bmi = Number((weightKg / (Math.max(1.2, heightCm / 100) ** 2)).toFixed(1));
  const bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy Zone' : bmi < 30 ? 'Overweight' : 'High BMI';
  const s = gender === 'female' ? -161 : 5;
  const dailyKcal = Math.round((10 * weightKg + 6.25 * heightCm - 5 * age + s) * 1.2);
  const goalLabels = {
    build_strength: 'Build Muscle & Strength',
    lose_weight: 'Lose Weight & Burn Fat',
    move_more: 'Move More & Build Habit',
    stay_mobile: 'Stay Mobile & Flexible',
    recover: 'Gentle Injury Recovery'
  };
  return {
    name: u.displayName || 'Athlete',
    age,
    heightCm,
    weightKg,
    bmi,
    bmiLabel,
    dailyKcal,
    goalTitle: goalLabels[p.goal] || 'Build Muscle & Strength',
    equipment: (p.equipment || 'none').replace('_', ' '),
    daysPerWeek: p.daysPerWeek || 4,
    minutesPerSession: p.minutesPerSession || 30
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function renderToday() {
  const container = $('today-content');
  if (!container) return;
  const stats = getAthleteStatsSummary();
  const fit = getFitWithAISnapshot();
  const habits = getDailyHabits();
  const latestRx = (store.state.prescriptionHistory || [])[0] || null;
  const logs = store.state.workoutLogs || [];
  const liveSessions = store.state.liveSessions || [];

  if (activeWorkout) {
    renderActiveWorkout(
      store.state.screening.riskFlagged
        ? '<div class="p-3.5 mb-4 rounded-2xl bg-amber-950/80 border border-amber-500 text-amber-200 text-sm"><strong>Health Screening Notice:</strong> Check with your doctor before starting.</div>'
        : ''
    );
    return;
  }

  const selectedDay = getTodaysPlanDay(selectedPlanDay);
  const todayNum = ((new Date().getDay() + 6) % 7) + 1;
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const waterPct = Math.min(100, Math.round(((habits.waterMl || 0) / (habits.waterGoal || 2500)) * 100));
  const latestScore = liveSessions[0]?.score ?? null;
  const limitations = store.state.limitations?.length
    ? store.state.limitations.map((l) => `<span class="text-[11px] px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/40">🛡 ${escapeHtml(l.replace('_', ' '))}</span>`).join('')
    : '<span class="text-[11px] px-2.5 py-1 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-600/40">✓ Full Joint Mobility</span>';

  container.innerHTML = `
    <div class="space-y-5">
      ${store.state.screening.riskFlagged ? '<div class="p-3.5 rounded-2xl bg-amber-950/80 border border-amber-500 text-amber-200 text-sm"><strong>Health Screening Notice:</strong> Check with your doctor before starting.</div>' : ''}

      <div class="rounded-3xl bg-gradient-to-br from-slate-900 to-emerald-950/50 border border-slate-800 p-5 sm:p-6 shadow-2xl">
        <div class="flex flex-wrap justify-between gap-3">
          <div><p class="text-xs font-bold uppercase tracking-wider text-emerald-400">${getGreeting()}, ${escapeHtml(stats.name)}</p><h1 class="text-2xl sm:text-3xl font-black mt-1">Goal: <span class="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-sky-400">${escapeHtml(stats.goalTitle)}</span></h1><div class="flex flex-wrap gap-2 mt-3">${limitations}<span class="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">🏋️ ${escapeHtml(stats.equipment)}</span></div></div>
          <button type="button" onclick="switchTab('profile')" class="min-h-[38px] px-3.5 rounded-xl bg-slate-800 text-xs font-semibold border border-slate-700">Edit Goal &amp; Metrics</button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800">
          <div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800"><span class="text-[11px] text-slate-400 block">Body Mass Index</span><strong class="text-xl">${stats.bmi}</strong> <span class="text-xs text-emerald-400">${stats.bmiLabel}</span><p class="text-[10px] text-slate-500">${stats.heightCm} cm • ${stats.weightKg} kg • ${stats.age}y</p></div>
          <div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800"><span class="text-[11px] text-slate-400 block">Daily Energy Burn</span><strong class="text-xl text-sky-400">${stats.dailyKcal.toLocaleString()}</strong> <span class="text-xs text-slate-400">kcal</span></div>
          <div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800"><span class="text-[11px] text-slate-400 block">Weekly Target</span><strong class="text-xl">${Math.min(logs.length, stats.daysPerWeek)} / ${stats.daysPerWeek}</strong><p class="text-[10px] text-slate-500">${stats.minutesPerSession} min/session</p></div>
          <div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800"><span class="text-[11px] text-slate-400 block">AI Form Score</span><strong class="text-xl text-amber-300">${latestScore !== null ? latestScore + '%' : 'Ready'}</strong><p class="text-[10px] text-slate-500">${liveSessions.length} scans</p></div>
        </div>
      </div>

      <div class="grid lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div class="flex justify-between mb-2"><span class="text-xs font-bold uppercase tracking-wider text-slate-400">Weekly Schedule</span><span class="text-[11px] text-emerald-400">Tap to preview</span></div>
          <div class="grid grid-cols-7 gap-1.5">
            ${dayNames.map((label, i) => {
              const d = i + 1;
              const selected = d === selectedPlanDay;
              const workout = d <= stats.daysPerWeek;
              return `<button type="button" onclick="selectTodayDay(${d})" class="py-2.5 px-1 rounded-xl border text-center ${selected ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-300'}"><span class="text-[11px] font-bold block">${label}</span><span class="block w-2 h-2 mx-auto my-1 rounded-full ${workout ? 'bg-emerald-400' : 'bg-slate-600'}"></span><span class="text-[9px]">${d === todayNum ? 'Today' : workout ? 'Train' : 'Rest'}</span></button>`;
            }).join('')}
          </div>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">How Do You Feel?</span>
          <div class="grid grid-cols-3 gap-1.5 mt-2">
            ${[['energized', '⚡', 'Energized'], ['normal', '💪', 'Ready'], ['tired', '🌿', 'Sore / Light']].map(([key, icon, label]) => `<button type="button" onclick="setTodayReadiness('${key}')" class="py-2 rounded-xl border ${todayReadiness === key ? 'border-emerald-400 bg-emerald-950/60 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-400'}"><span class="block">${icon}</span><span class="text-[11px]">${label}</span></button>`).join('')}
          </div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
        <div class="flex flex-wrap justify-between items-center gap-3 mb-4"><div><span class="text-xs uppercase tracking-wider text-emerald-400 font-bold">${selectedPlanDay === todayNum ? "Today's Scheduled Session" : `Previewing ${dayNames[selectedPlanDay - 1]} Session`}</span><h2 class="text-2xl font-extrabold">${escapeHtml(selectedDay.title)}</h2></div><div class="flex gap-2">${logs.length ? '<button onclick="repeatLastWorkout()" class="min-h-[48px] px-4 rounded-xl bg-slate-800 border border-slate-700">↻ Repeat Last</button>' : ''}<button onclick="startTodayWorkout()" class="min-h-[48px] px-6 rounded-xl bg-emerald-500 text-slate-950 font-extrabold">${selectedDay.isRest ? 'Start Gentle Stretch →' : 'Start Workout →'}</button></div></div>
        ${selectedDay.isRest ? '' : `<div class="grid sm:grid-cols-2 gap-3">${selectedDay.items.map((it) => {
          const ex = EXERCISES.find((e) => e.id === it.exerciseId);
          const open = expandedDemoIds.has(it.exerciseId);
          return `<div class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700"><div class="flex justify-between gap-2"><div><b>${escapeHtml(it.name)}</b><p class="text-xs text-slate-400">${it.sets} sets × ${it.reps}</p></div><button onclick="toggleInlineDemo(${it.exerciseId})" class="text-[11px] px-2.5 rounded-lg bg-slate-900 text-sky-300 border border-slate-700">${open ? 'Hide' : '▶ Demo'}</button></div>${open && ex ? `<div class="mt-3 aspect-video rounded-xl overflow-hidden bg-black"><iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${ex.youtubeId}?rel=0" title="${escapeHtml(ex.name)}" loading="lazy" allowfullscreen></iframe></div><p class="text-xs text-slate-300 mt-2">${escapeHtml(ex.steps[0])}</p>` : ''}</div>`;
        }).join('')}</div>`}
      </div>

      <div class="grid md:grid-cols-3 gap-4">
        <div class="p-5 rounded-3xl bg-gradient-to-b from-sky-950/50 to-slate-900 border border-sky-800/50 space-y-4"><div><span class="text-xs font-extrabold uppercase tracking-wider text-sky-400">✨ fitwithAI Split</span>${fit?.generatedPlan ? `<h3 class="font-bold mt-2">${escapeHtml(fit.generatedPlan.programName)}</h3><p class="text-xs text-slate-300 mt-1">${escapeHtml(fit.generatedPlan.days[fit.selectedDayIndex || 0]?.dayTitle || 'Custom Split')} • ${escapeHtml(fit.generatedPlan.strengthGain)} projected gain</p><button onclick="loadFitWithAIDayIntoToday()" class="w-full mt-3 min-h-[40px] rounded-xl bg-sky-500 text-slate-950 font-bold">Load into Today</button>` : '<p class="text-xs text-slate-400 mt-2">Create a personalized strength split.</p>'}</div><button onclick="switchTab('fitwithai')" class="w-full min-h-[40px] rounded-xl bg-slate-800 text-sky-300 border border-slate-700">${fit?.generatedPlan ? 'Open fitwithAI' : 'Build AI Plan →'}</button></div>
        <div class="p-5 rounded-3xl bg-gradient-to-b from-amber-950/35 to-slate-900 border border-amber-700/40 space-y-4"><div><span class="text-xs font-extrabold uppercase tracking-wider text-amber-400">🩺 Prescription Guidance</span>${latestRx ? `<h3 class="font-bold mt-2">Latest Clinical Match</h3><p class="text-xs text-slate-300 mt-1">${escapeHtml(latestRx.summaryNote || 'Prescription exercises analyzed.')}</p>` : '<h3 class="font-bold mt-2">Have a Doctor\'s Note?</h3><p class="text-xs text-slate-400 mt-1">Analyze a prescription for safe exercise matches.</p>'}</div><button onclick="switchTab('prescription')" class="w-full min-h-[40px] rounded-xl bg-slate-800 text-amber-300 border border-slate-700">${latestRx ? 'View Prescription Details →' : 'Analyze Prescription →'}</button></div>
        <div class="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3"><div class="flex justify-between"><span class="text-xs font-extrabold uppercase tracking-wider text-emerald-400">💧 Daily Readiness</span><b class="text-xs">${habits.waterMl} / ${habits.waterGoal} ml</b></div><div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-sky-400" style="width:${waterPct}%"></div></div><div class="flex gap-2"><button onclick="addTodayWater(250)" class="flex-1 py-2 rounded-xl bg-sky-950/70 text-sky-300 border border-sky-700/50 text-xs font-bold">+250 ml</button><button onclick="addTodayWater(500)" class="flex-1 py-2 rounded-xl bg-sky-950/70 text-sky-300 border border-sky-700/50 text-xs font-bold">+500 ml</button></div><label class="flex gap-2 text-xs text-slate-300"><input type="checkbox" ${habits.warmup ? 'checked' : ''} onchange="toggleDailyHabit('warmup')" class="accent-emerald-500">5-min mobility warmup</label><label class="flex gap-2 text-xs text-slate-300"><input type="checkbox" ${habits.stretch ? 'checked' : ''} onchange="toggleDailyHabit('stretch')" class="accent-emerald-500">Cooldown stretch</label><button onclick="launchQuickCameraTest()" class="w-full min-h-[40px] rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">📷 Quick Camera Form Check</button></div>
      </div>
    </div>
  `;
}

// ============================================================================
// NAVIGATION & COACH (LIVE CAMERA + MANUAL VIDEO UPLOAD)
// ============================================================================
function switchTab(target) {
  if (target !== 'coach' && coach?.running) coach.stopCamera(false);
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  $(`tab-${target}`)?.classList.remove('hidden');
  document.querySelectorAll('[data-tab]').forEach((item) => {
    item.classList.remove('bg-emerald-600', 'text-white');
    item.classList.add('text-slate-300');
  });
  document.querySelectorAll(`[data-tab="${target}"]`).forEach((item) => {
    item.classList.add('bg-emerald-600', 'text-white');
    item.classList.remove('text-slate-300');
  });
  renderAll();
}

window.switchTab = switchTab;

function initCoach() {
  if (!$('coach-video') || typeof LiveCameraCoach !== 'function') return;

  const selectEl = $('coach-exercise-select');
  if (selectEl && selectEl.options.length === 0) {
    Object.values(EXERCISE_RULES).forEach((rule) => {
      const opt = document.createElement('option');
      opt.value = rule.id;
      opt.textContent = rule.name;
      selectEl.appendChild(opt);
    });
    selectEl.addEventListener('change', () => {
      const rule = EXERCISE_RULES[selectEl.value];
      if (rule && $('coach-setup-guide')) {
        $('coach-setup-guide').textContent = `Camera setup: ${rule.cameraPosition}`;
      }
    });
  }

  coach = new LiveCameraCoach({
    videoEl: $('coach-video'),
    canvasEl: $('coach-canvas'),
    onStatus: (message, passed = false) => {
      const status = $('coach-setup-status');
      if (status) status.textContent = message;
      const begin = $('btn-coach-begin-set');
      if (begin) begin.disabled = !passed;
    },
    onCue: (cue) => {
      if ($('coach-live-cue')) $('coach-live-cue').textContent = cue;
    },
    onRep: (count, score) => {
      if ($('coach-rep-count')) $('coach-rep-count').textContent = count;
      if ($('coach-last-score')) $('coach-last-score').textContent = `${score}/100`;
    },
    onFinish: async (report) => {
      $('coach-active-controls')?.classList.add('hidden');
      $('coach-start-controls')?.classList.remove('hidden');
      $('btn-upload-finish')?.classList.add('hidden');
      $('btn-upload-stop')?.classList.add('hidden');

      const session = { id: Date.now(), date: new Date().toISOString().slice(0, 10), ...report };
      store.state.liveSessions.unshift(session);
      store.save();
      await store.api('/live/sessions', { method: 'POST', body: JSON.stringify(session) });

      let returnButton = '';
      if (pendingCameraScanTarget && activeWorkout?.items?.[pendingCameraScanTarget.index]) {
        const target = activeWorkout.items[pendingCameraScanTarget.index];
        if (report.reps > 0) {
          target.targetReps = report.reps;
          target.isStatic = report.repType === 'hold';
        }
        target.inputMode = 'scan';
        target.lastScanScore = report.score ?? report.confidence;
        const resultLabel = report.repType === 'hold' ? `${report.reps}s` : `${report.reps}R`;
        target.scanCode = `SCAN-${resultLabel}-${report.score ?? report.confidence}%`;
        returnButton =
          '<div class="mt-3 pt-3 border-t border-slate-700"><button type="button" onclick="returnScannedSetToToday()" class="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">✓ Apply Scanned Evaluation & Return to Today Workout →</button></div>';
      }

      const sourceBadge =
        report.sourceMode === 'upload'
          ? '<span class="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 ml-2">Uploaded Video</span>'
          : '<span class="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 ml-2">Live Camera</span>';
      const box = $('coach-report-box');
      box?.classList.remove('hidden');
      if (box) {
        box.innerHTML = `<h4 class="font-bold text-emerald-400 text-lg">Analysis Report — ${escapeHtml(report.exerciseName)}${sourceBadge}</h4><p class="text-sm">Detected: <strong>${report.reps} ${report.repType === 'hold' ? 'seconds' : 'reps'}</strong> · Confidence: <strong>${report.confidence}%</strong></p><p class="text-sm mt-1">Overall Form Score: <strong>${report.score === null ? 'Low confidence — ensure full body is visible' : `${report.score}/100`}</strong></p>${returnButton}<p class="text-xs text-slate-400 mt-2">Coaching is informational only. Stop if you feel pain.</p>`;
      }
      renderProgress();
      showToast('Analysis report saved!');
    }
  });

  // Option 1 vs Option 2 Mode Switcher
  $('btn-mode-live')?.addEventListener('click', () => {
    if (coach?.running) coach.stopCamera(false);
    $('panel-coach-live')?.classList.remove('hidden');
    $('panel-coach-upload')?.classList.add('hidden');
    if ($('btn-mode-live')) $('btn-mode-live').className = 'min-h-[64px] p-3.5 rounded-2xl bg-emerald-600/15 border-2 border-emerald-500 text-left transition';
    if ($('btn-mode-upload')) $('btn-mode-upload').className = 'min-h-[64px] p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700 hover:border-slate-600 text-left transition';
  });

  $('btn-mode-upload')?.addEventListener('click', () => {
    if (coach?.running) coach.stopCamera(false);
    $('panel-coach-live')?.classList.add('hidden');
    $('panel-coach-upload')?.classList.remove('hidden');
    if ($('btn-mode-upload')) $('btn-mode-upload').className = 'min-h-[64px] p-3.5 rounded-2xl bg-sky-600/15 border-2 border-sky-500 text-left transition';
    if ($('btn-mode-live')) $('btn-mode-live').className = 'min-h-[64px] p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700 hover:border-slate-600 text-left transition';
  });

  // Live Camera Controls
  $('btn-coach-check')?.addEventListener('click', async () => {
    if (!$('coach-consent-check')?.checked) return alert('Please confirm camera consent first.');
    store.state.consents.cameraOnDevice = true;
    store.save();
    if (selectEl) coach.setExercise(selectEl.value, store.state.limitations);
    $('coach-report-box')?.classList.add('hidden');
    $('coach-start-controls')?.classList.add('hidden');
    $('coach-active-controls')?.classList.remove('hidden');
    try {
      await coach.startCamera(false);
    } catch (err) {
      $('coach-active-controls')?.classList.add('hidden');
      $('coach-start-controls')?.classList.remove('hidden');
      alert(`Camera error: ${err.message}`);
    }
  });

  $('btn-coach-begin-set')?.addEventListener('click', () => coach.beginActiveSet());
  $('btn-coach-finish')?.addEventListener('click', () => coach.stopCamera(true));
  $('btn-coach-stop')?.addEventListener('click', () => {
    coach.stopCamera(false);
    $('coach-active-controls')?.classList.add('hidden');
    $('coach-start-controls')?.classList.remove('hidden');
  });

  // Manual Video Upload Controls
  $('btn-upload-analyze')?.addEventListener('click', async () => {
    const file = $('coach-video-file')?.files?.[0];
    if (!file) return alert('Please choose a video file (MP4, WebM, or MOV) first.');
    const speed = Number($('coach-upload-speed')?.value || 1.0);
    if (selectEl) coach.setExercise(selectEl.value, store.state.limitations);
    $('coach-report-box')?.classList.add('hidden');
    $('btn-upload-finish')?.classList.remove('hidden');
    $('btn-upload-stop')?.classList.remove('hidden');
    try {
      await coach.startVideoFile(file, speed);
    } catch (err) {
      alert(err.message);
    }
  });

  $('btn-upload-finish')?.addEventListener('click', () => coach.stopCamera(true));
  $('btn-upload-stop')?.addEventListener('click', () => {
    coach.stopCamera(false);
    $('btn-upload-finish')?.classList.add('hidden');
    $('btn-upload-stop')?.classList.add('hidden');
  });
}

// ============================================================================
// EXERCISE LIBRARY (WITH YOUTUBE EMBEDS + DIRECT YOUTUBE LINKS)
// ============================================================================
async function syncLibraryFromServer() {
  try {
    const res = await fetch('http://localhost:4000/api/exercises');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.exercises) && data.exercises.length > 0) {
        cachedLibraryExercises = data.exercises;
        renderLibrary();
      }
    }
  } catch {
    // Keep local EXERCISES fallback if offline
  }
}

function bindLibraryFilters() {
  ($('library-equip-filter') || document.querySelector('#tab-library select'))?.addEventListener('change', renderLibrary);
  ($('library-search') || document.querySelector('#tab-library input'))?.addEventListener('input', renderLibrary);
}

function renderLibrary() {
  const grid = $('library-grid');
  if (!grid) return;

  const filterEl = $('library-equip-filter') || document.querySelector('#tab-library select');
  const searchEl = $('library-search') || document.querySelector('#tab-library input');
  const filter = filterEl?.value || 'all';
  const search = (searchEl?.value || '').toLowerCase().trim();

  const list = cachedLibraryExercises.filter((ex) => {
    if (filter !== 'all' && ex.equipment !== filter) return false;
    if (search) {
      const hay = `${ex.name} ${(ex.muscles || []).join(' ')}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  if (list.length === 0) {
    grid.innerHTML = `<p class="text-sm text-slate-400 col-span-2">No exercises match "${escapeHtml(search)}".</p>`;
    return;
  }

  grid.innerHTML = list
    .map((ex) => {
      const flagged = (ex.bodyPartsLoaded || []).some((p) => store.state.limitations.includes(p));
      const ytUrl = `https://www.youtube.com/watch?v=${ex.youtubeId}`;
      const thumbUrl = `https://img.youtube.com/vi/${ex.youtubeId}/hqdefault.jpg`;

      return `
      <div class="p-4 rounded-2xl bg-slate-900 border ${flagged ? 'border-amber-500/60' : 'border-slate-800'} flex flex-col justify-between space-y-3">
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <span class="text-xs px-2.5 py-0.5 rounded-lg bg-slate-800 text-emerald-400 uppercase">${escapeHtml((ex.equipment || 'none').replace('_', ' '))}</span>
            ${ex.hasLiveCoach ? '<span class="text-xs px-2.5 py-0.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-600/40">Live Camera</span>' : ''}
          </div>
          <h3 class="font-bold text-white text-lg">${escapeHtml(ex.name)}</h3>
          <p class="text-xs text-slate-400 mb-3">Muscles: ${escapeHtml((ex.muscles || []).join(', '))}</p>
          ${flagged ? '<p class="text-xs text-amber-300 mb-2">⚠ Loads a body part flagged in your limitations.</p>' : ''}

          <div class="relative aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 mb-2">
            <img src="${thumbUrl}" alt="${escapeHtml(ex.name)}" class="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none" />
            <iframe
              class="relative z-10 w-full h-full"
              src="https://www.youtube-nocookie.com/embed/${ex.youtubeId}?rel=0"
              title="${escapeHtml(ex.name)}"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
            ></iframe>
          </div>

          <a href="${ytUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 underline mb-2">
            ▶ Watch Video on YouTube ↗
          </a>

          <ul class="text-xs text-slate-300 list-disc pl-4 space-y-1">
            ${(ex.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
          </ul>
        </div>
      </div>`;
    })
    .join('');
}

// ============================================================================
// MONTHLY PLAN & PROGRESS RENDERERS
// ============================================================================
function renderPlan() {
  const el = $('plan-content');
  if (!el) return;
  if (!store.state.monthlyPlan) generateMonthlyPlan();

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 class="text-xl font-bold text-white">4-Week Adaptive Plan</h2>
        <p class="text-xs text-slate-400">Built exclusively from safe library exercises. Guidance only—does not replace your doctor.</p>
      </div>
      <button id="btn-rebuild-plan" class="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold">
        Rebuild Plan
      </button>
    </div>
    <div class="grid md:grid-cols-2 gap-4">
      ${store.state.monthlyPlan.weeks
        .map(
          (w) => `
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 class="font-bold text-emerald-400 mb-2">${escapeHtml(w.label)}</h3>
          <div class="space-y-2 text-sm">
            ${w.days
              .map(
                (d) => `
              <div class="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800 flex justify-between">
                <span class="font-medium text-slate-200">Day ${d.day}: ${escapeHtml(d.title)}</span>
                <span class="text-xs text-slate-400">${d.isRest ? 'Rest' : `${d.items.length} exercises`}</span>
              </div>`
              )
              .join('')}
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;

  $('btn-rebuild-plan')?.addEventListener('click', () => {
    generateMonthlyPlan();
    renderPlan();
    showToast('4-week plan rebuilt!');
  });
}

function renderProgress() {
  const logs = store.state.workoutLogs || [];
  const live = store.state.liveSessions || [];

  if ($('stat-workouts')) $('stat-workouts').textContent = logs.length;
  if ($('stat-streak')) $('stat-streak').textContent = `${Math.min(logs.length, 7)} days`;

  const validScores = live.filter((s) => s.score !== null && s.score !== undefined);
  const avgForm = validScores.length
    ? `${Math.round(validScores.reduce((a, b) => a + b.score, 0) / validScores.length)}%`
    : '—';
  if ($('stat-form-score')) $('stat-form-score').textContent = avgForm;

  const historyEl = $('progress-history');
  if (!historyEl) return;

  historyEl.innerHTML =
    logs.length === 0
      ? '<p class="text-sm text-slate-400">Complete a workout on the Today tab to see your history here.</p>'
      : logs
          .map(
            (l) => `
          <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center text-sm">
            <div>
              <p class="font-semibold text-white">${escapeHtml(l.title)}</p>
              <p class="text-xs text-slate-400">${escapeHtml(l.date)} • ${l.sets?.length || 0} sets logged</p>
            </div>
            <span class="text-emerald-400 font-medium">${l.durationMin} min</span>
          </div>`
          )
          .join('');
}

// ============================================================================
// PRESCRIPTION ANALYZER & LIBRARY MATCHER
// ============================================================================
const EXERCISE_KEYWORDS = {
  squat: ['squat', 'squats', 'bodyweight squat', 'chair squat'],
  pushup: ['pushup', 'push-up', 'push up', 'pushups', 'knee pushup'],
  plank: ['plank', 'forearm plank', 'core hold', 'abdominal plank'],
  glute_bridge: ['glute bridge', 'bridge', 'hip bridge', 'bridging'],
  dumbbell_row: ['dumbbell row', 'one arm row', 'single arm row', 'bent over row'],
  goblet_squat: ['goblet squat', 'weighted squat'],
  barbell_bench: ['bench press', 'barbell bench', 'chest press'],
  wall_sit: ['wall sit', 'wall squat', 'isometric squat', 'static wall'],
  wall_pushup: ['wall pushup', 'wall push-up', 'incline pushup', 'incline push-up'],
  dumbbell_floor_press: ['floor press', 'dumbbell press'],
  bird_dog: ['bird dog', 'bird-dog', 'quadruped', 'opposite arm leg'],
  band_row: ['band row', 'resistance band row', 'seated row', 'row']
};

const CONDITION_KEYWORDS = {
  knee: ['knee', 'patella', 'meniscus', 'acl', 'mcl'],
  lower_back: ['lower back', 'lumbar', 'sciatica', 'spine', 'disc', 'back pain', 'back stiffness'],
  shoulder: ['shoulder', 'rotator cuff', 'deltoid', 'impingement'],
  wrist: ['wrist', 'carpal', 'hand strain']
};

function analyzePrescriptionLocally(text) {
  const lower = (text || '').toLowerCase();
  const detectedLimitations = Object.entries(CONDITION_KEYWORDS)
    .filter(([, terms]) => terms.some((t) => lower.includes(t)))
    .map(([part]) => part);

  const prescribedExercises = EXERCISES.filter((ex) => {
    const aliases = EXERCISE_KEYWORDS[ex.slug] || [ex.name.toLowerCase()];
    return aliases.some((alias) => lower.includes(alias));
  });

  const prescribedIds = new Set(prescribedExercises.map((e) => e.id));
  const suggestedExercises = EXERCISES.filter((ex) => {
    if (prescribedIds.has(ex.id)) return false;
    const loadsFlaggedPart = ex.bodyPartsLoaded.some((p) => detectedLimitations.includes(p));
    return !loadsFlaggedPart && ex.difficulty === 'beginner' && ex.equipment !== 'full_gym';
  }).slice(0, 4);

  return {
    detectedLimitations,
    prescribedExercises,
    suggestedExercises,
    summaryNote:
      prescribedExercises.length > 0
        ? `Matched ${prescribedExercises.length} doctor-recommended exercise(s) with step-by-step instructions and video demos.`
        : `Suggested ${suggestedExercises.length} safe, low-impact library exercises based on your precautions.`
  };
}

function bindPrescriptionPage() {
  document.querySelectorAll('[data-rx-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if ($('rx-text-input')) $('rx-text-input').value = btn.dataset.rxSample;
      if ($('rx-consent-check')) $('rx-consent-check').checked = true;
    });
  });

  $('rx-file-input')?.addEventListener('change', () => {
    const file = $('rx-file-input').files?.[0];
    if (file && file.type.startsWith('image/') && $('rx-image-preview')) {
      $('rx-image-preview').src = URL.createObjectURL(file);
      $('rx-image-preview-wrap')?.classList.remove('hidden');
    } else {
      $('rx-image-preview-wrap')?.classList.add('hidden');
    }
    if (file && file.type === 'text/plain' && $('rx-text-input')) {
      file.text().then((txt) => {
        $('rx-text-input').value = txt;
      });
    }
  });

  $('btn-rx-clear')?.addEventListener('click', () => {
    if ($('rx-file-input')) $('rx-file-input').value = '';
    if ($('rx-text-input')) $('rx-text-input').value = '';
    $('rx-image-preview-wrap')?.classList.add('hidden');
    $('rx-results-container')?.classList.add('hidden');
  });

  $('form-prescription-analyze')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!$('rx-consent-check')?.checked) return alert('Please check explicit consent first.');
    const file = $('rx-file-input')?.files?.[0];
    const notesText = ($('rx-text-input')?.value || '').trim();
    if (!file && !notesText) return alert('Please upload a prescription file or enter prescription notes.');

    const submitBtn = $('btn-rx-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Analyzing...';
    }

    try {
      let analysis = analyzePrescriptionLocally(`${file ? file.name : ''} ${notesText}`);

      if (store.state.token) {
        const formData = new FormData();
        formData.append('notes', notesText);
        formData.append('consent', 'true');
        if (file) formData.append('prescriptionFile', file);

        try {
          const res = await fetch('http://localhost:4000/api/prescriptions/analyze', {
            method: 'POST',
            headers: { Authorization: `Bearer ${store.state.token}` },
            body: formData
          });
          if (res.ok) {
            const serverData = await res.json();
            if (serverData.analysis) analysis = serverData.analysis;
          }
        } catch {
          // Keep offline analysis if server unreachable
        }
      }

      const record = {
        id: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        notes: notesText || `(Uploaded file: ${file?.name})`,
        ...analysis
      };

      store.state.prescriptionHistory.unshift(record);
      store.save();
      renderPrescriptionResults(record);
      renderPrescriptionHistory();
      showToast('Prescription analyzed!');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Analyze Prescription & Match Exercises';
      }
    }
  });
}

function renderExercisePrescriptionCard(ex, badgeText, badgeClass) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${ex.youtubeId}`;
  return `
    <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3">
      <div>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <span class="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full ${badgeClass}">${badgeText}</span>
          <span class="text-xs text-slate-400 capitalize">${escapeHtml((ex.equipment || 'none').replace('_', ' '))}</span>
        </div>
        <h4 class="text-lg font-bold text-white">${escapeHtml(ex.name)}</h4>
        <p class="text-xs text-slate-400 mb-3">Muscles: ${escapeHtml((ex.muscles || []).join(', '))}</p>
        <div class="aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 mb-2">
          <iframe class="w-full h-full" src="https://www.youtube-nocookie.com/embed/${ex.youtubeId}?rel=0" title="${escapeHtml(ex.name)}" loading="lazy" allowfullscreen></iframe>
        </div>
        <a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 underline mb-3">
          ▶ Watch Video Tutorial on YouTube ↗
        </a>
        <div class="p-3 rounded-xl bg-slate-800/70 border border-slate-700/70 space-y-1.5">
          <p class="text-xs font-bold text-emerald-300">Written Instructions:</p>
          <ol class="text-xs text-slate-200 list-decimal pl-4 space-y-1">
            ${(ex.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
          </ol>
        </div>
      </div>
      <button type="button" onclick="addPrescribedExerciseToToday(${ex.id})" class="w-full min-h-[42px] rounded-xl bg-slate-800 hover:bg-emerald-600 text-white font-semibold text-xs border border-slate-700 transition">
        + Add "${escapeHtml(ex.name)}" to Today's Plan
      </button>
    </div>
  `;
}

function renderPrescriptionResults(record) {
  const container = $('rx-results-container');
  if (!container) return;
  container.classList.remove('hidden');

  const prescribedSection = record.prescribedExercises?.length
    ? `<div><h3 class="text-lg font-bold text-emerald-400 mb-3">Doctor-Recommended Exercises (${record.prescribedExercises.length})</h3><div class="grid md:grid-cols-2 gap-4">${record.prescribedExercises.map((ex) => renderExercisePrescriptionCard(ex, 'Doctor Prescribed', 'bg-emerald-950 text-emerald-300 border border-emerald-500/40')).join('')}</div></div>`
    : '';

  const suggestedSection = record.suggestedExercises?.length
    ? `<div><h3 class="text-lg font-bold text-sky-400 mb-3">Suggested Safe Library Exercises (${record.suggestedExercises.length})</h3><div class="grid md:grid-cols-2 gap-4">${record.suggestedExercises.map((ex) => renderExercisePrescriptionCard(ex, 'Safe Suggestion', 'bg-sky-950 text-sky-300 border border-sky-500/40')).join('')}</div></div>`
    : '';

  container.innerHTML = `
    <div class="p-5 rounded-2xl bg-slate-900 border border-emerald-600/50">
      <h3 class="text-lg font-bold text-white">Analysis Summary</h3>
      <p class="text-sm text-slate-300 mt-1">${escapeHtml(record.summaryNote)}</p>
    </div>
    ${prescribedSection}
    ${suggestedSection}
  `;
}

function renderPrescriptionHistory() {
  const listEl = $('rx-history-list');
  if (!listEl) return;
  const items = store.state.prescriptionHistory || [];
  if (!items.length) {
    listEl.innerHTML = '<p class="text-xs text-slate-400">No prescriptions analyzed yet.</p>';
    return;
  }
  listEl.innerHTML = items
    .map(
      (item, idx) => `
      <div class="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold text-white text-xs sm:text-sm">${escapeHtml(item.notes.slice(0, 90))}</p>
          <p class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(item.date)}</p>
        </div>
        <button type="button" onclick="viewSavedPrescription(${idx})" class="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-emerald-300 font-semibold">View Details</button>
      </div>`
    )
    .join('');
}

window.viewSavedPrescription = (index) => {
  const rec = store.state.prescriptionHistory[index];
  if (rec) renderPrescriptionResults(rec);
};

window.addPrescribedExerciseToToday = (exerciseId) => {
  const ex = EXERCISES.find((e) => e.id === exerciseId);
  if (!ex) return;
  if (!store.state.monthlyPlan) generateMonthlyPlan();
  const today = getTodaysPlanDay();
  if (today.isRest) {
    today.isRest = false;
    today.title = 'Doctor-Guided Recovery Session';
    today.items = [];
  }
  if (!today.items.some((i) => i.exerciseId === ex.id)) {
    today.items.push({ exerciseId: ex.id, name: ex.name, sets: 2, reps: ex.slug === 'plank' ? '30s' : 10 });
  }
  store.save();
  switchTab('today');
  showToast(`Added "${ex.name}" to Today's workout!`);
};

// ============================================================================
// ATHLETE & SAFETY PROFILE PAGE
// ============================================================================
function bindProfilePage() {
  $('form-profile-prefs')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('prof-name')) store.state.user.displayName = $('prof-name').value.trim() || 'Athlete';
    if ($('prof-goal')) store.state.profile.goal = $('prof-goal').value;
    if ($('prof-height')) store.state.profile.heightCm = Number($('prof-height').value || 178);
    if ($('prof-weight')) store.state.profile.weightKg = Number($('prof-weight').value || 70);
    if ($('prof-equip')) store.state.profile.equipment = $('prof-equip').value;
    store.state.profile.onboarded = true;
    store.save();
    store.syncToFitWithAI?.();
    await store.api('/me/profile', { method: 'PUT', body: JSON.stringify(store.state.profile) });
    generateMonthlyPlan();
    renderAll();
    showToast('Athlete preferences saved & plan updated!');
  });

  document.querySelectorAll('.prof-lim-check').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const selected = Array.from(document.querySelectorAll('.prof-lim-check:checked')).map((c) => c.value);
      store.state.limitations = selected;
      store.save();
      await store.api('/me/limitations', { method: 'PUT', body: JSON.stringify({ limitations: selected }) });
      generateMonthlyPlan();
      renderAll();
      showToast('Joint guardrails updated!');
    });
  });
}

function renderProfile() {
  const name = store.state.user.displayName || 'Athlete';
  const isSynced = Boolean(store.state.token);

  if ($('prof-hero-avatar')) $('prof-hero-avatar').textContent = name.charAt(0).toUpperCase();
  if ($('prof-hero-name')) $('prof-hero-name').textContent = name;
  if ($('prof-hero-meta')) {
    $('prof-hero-meta').textContent = `${store.state.user.email} • ${store.state.profile.heightCm || 178} cm • ${store.state.profile.weightKg || 70} kg`;
  }
  if ($('prof-hero-status')) {
    $('prof-hero-status').textContent = isSynced ? 'Synced with MySQL' : 'Guest Mode';
  }

  if ($('prof-name')) $('prof-name').value = name;
  if ($('prof-goal')) $('prof-goal').value = store.state.profile.goal || 'build_strength';
  if ($('prof-height')) $('prof-height').value = store.state.profile.heightCm || 178;
  if ($('prof-weight')) $('prof-weight').value = store.state.profile.weightKg || 70;
  if ($('prof-equip')) $('prof-equip').value = store.state.profile.equipment || 'none';

  document.querySelectorAll('.prof-lim-check').forEach((chk) => {
    chk.checked = store.state.limitations.includes(chk.value);
  });
}

// ============================================================================
// MASTER RENDER & MODALS
// ============================================================================
function renderAll() {
  const name = store.state.user.displayName || 'Athlete';
  const initial = name.charAt(0).toUpperCase();
  const isSynced = Boolean(store.state.token);

  if ($('header-user-name')) $('header-user-name').textContent = name;
  if ($('header-user-avatar')) $('header-user-avatar').textContent = initial;
  if ($('header-sync-badge')) {
    $('header-sync-badge').textContent = isSynced ? 'Synced' : 'Guest';
  }

  renderToday();
  renderFitWithAI();
  renderLibrary();
  renderPlan();
  renderProgress();
  renderPrescriptionHistory();
  renderProfile();
}

function bindModalCloseButtons() {
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => $(button.dataset.closeModal)?.classList.add('hidden'));
  });
}