import { EXERCISES, EXERCISE_RULES } from './exercises.js';
import { store } from './store.js';
import { LiveCameraCoach } from './coach.js';
import { initFitWithAI, renderFitWithAI } from './fitwithai.js';
import { initLandingAndAuth } from './landing.js';

// Onboarding, PAR-Q+, Today, Plan, and Progress UI.

let activeWorkout = null;
let restTimer = null;
let restSeconds = 0;
let restTimerInterval = null;
let restSecondsRemaining = 0;
let pendingCameraScanTarget = null;
let coach = null;
let toastTimeout = null;
let selectedPlanDay = ((new Date().getDay() + 6) % 7) + 1;
let todayReadiness = 'normal';
let expandedDemoIds = new Set();

const $ = (id) => document.getElementById(id);

function openModal(id) {
  $(id)?.classList.remove('hidden');
}

function closeModal(id) {
  $(id)?.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  initLandingAndAuth(() => {
    generateMonthlyPlan();
    initFitWithAI();
    renderAll();
  });

  bindNavigation();
  bindWelcomeWizard();
  bindOnboarding();
  bindScreening();
  bindProfileActions();
  bindAuth();
  bindModalCloseButtons();
  initCoach();
  bindPrescriptionPage();
  renderAll();
  bindProfilePage();
  renderPrescriptionHistory();

  if (!store.state.profile.onboarded && !store.state.profile.skippedSetup) {
    openWelcomeOverlay(0);
  }
});

const welcomeDraft = {
  goal: store.state.profile.goal || 'build_strength',
  experience: store.state.profile.experience || 'new',
  equipment: store.state.profile.equipment || 'none'
};

function openWelcomeOverlay(step = 0) {
  welcomeDraft.goal = store.state.profile.goal || 'build_strength';
  welcomeDraft.experience = store.state.profile.experience || 'new';
  welcomeDraft.equipment = store.state.profile.equipment || 'none';

  document.getElementById('wiz-name').value =
    store.state.user.displayName !== 'Athlete' ? store.state.user.displayName : '';
  document.getElementById('wiz-days').value = String(store.state.profile.daysPerWeek || 3);
  document.getElementById('wiz-minutes').value = String(store.state.profile.minutesPerSession || 25);
  document.getElementById('wiz-units').value = store.state.user.units || 'kg';
  document.getElementById('wiz-lang').value = store.state.user.language || 'en';
  document.getElementById('wiz-timezone').value = store.state.user.timeZone || 'UTC';

  syncWelcomeCards('wiz-goal-cards', welcomeDraft.goal);
  syncWelcomeCards('wiz-exp-cards', welcomeDraft.experience);
  syncWelcomeCards('wiz-equip-cards', welcomeDraft.equipment);
  showWelcomeStep(step);
  document.getElementById('onboarding-overlay').classList.remove('hidden');
}

function closeWelcomeOverlay() {
  document.getElementById('onboarding-overlay')?.classList.add('hidden');
}

function showWelcomeStep(step) {
  for (let index = 0; index <= 4; index += 1) {
    const element = document.getElementById(index === 4
      ? 'form-wizard-complete'
      : `wizard-step-${index}`);
    element?.classList.toggle('hidden', index !== step);
  }

  const progress = document.getElementById('wizard-progress-header');
  if (step === 0) {
    progress?.classList.add('hidden');
  } else {
    progress?.classList.remove('hidden');
    document.getElementById('wizard-step-label').textContent = `Step ${step} of 4`;
    document.getElementById('wizard-progress-bar').style.width = `${step * 25}%`;
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

  document.getElementById('btn-welcome-start')?.addEventListener('click', () => showWelcomeStep(1));
  document.getElementById('btn-welcome-skip')?.addEventListener('click', skipWelcomeSetup);
  document.getElementById('btn-wizard-skip-top')?.addEventListener('click', skipWelcomeSetup);
  document.getElementById('btn-reopen-welcome')?.addEventListener('click', () => openWelcomeOverlay(1));
  document.getElementById('btn-edit-setup')?.addEventListener('click', () => openWelcomeOverlay(1));

  document.getElementById('btn-welcome-signin')?.addEventListener('click', () => {
    document.getElementById('modal-auth')?.classList.remove('hidden');
  });
  document.getElementById('btn-header-signin')?.addEventListener('click', () => {
    document.getElementById('modal-auth')?.classList.remove('hidden');
  });

  document.querySelectorAll('[data-wiz-next]').forEach((button) => {
    button.addEventListener('click', () => showWelcomeStep(Number(button.dataset.wizNext)));
  });
  document.querySelectorAll('[data-wiz-prev]').forEach((button) => {
    button.addEventListener('click', () => showWelcomeStep(Number(button.dataset.wizPrev)));
  });

  document.getElementById('form-wizard-complete')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const riskFlagged = ['q_chest', 'q_dizzy', 'q_bone', 'q_meds']
      .some((key) => form.get(key) === 'yes');
    const limitations = form.getAll('limitations');

    const name = document.getElementById('wiz-name').value.trim();
    if (name) store.state.user.displayName = name;
    store.state.user.units = document.getElementById('wiz-units').value;
    store.state.user.language = document.getElementById('wiz-lang').value;
    store.state.user.timeZone = document.getElementById('wiz-timezone').value || 'UTC';

    store.state.profile = {
      onboarded: true,
      skippedSetup: false,
      goal: riskFlagged ? 'recover' : welcomeDraft.goal,
      experience: welcomeDraft.experience,
      equipment: welcomeDraft.equipment,
      daysPerWeek: Number(document.getElementById('wiz-days').value),
      minutesPerSession: Number(document.getElementById('wiz-minutes').value)
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
      $('modal-auth')?.classList.remove('hidden');
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
    const riskAnswers = ['q_chest', 'q_dizzy', 'q_bone', 'q_meds']
      .filter((key) => form.get(key) === 'yes');

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
        error.textContent = `${caught.message}. Start the backend on port 4000 or use Skip to explore locally.`;
        error.classList.remove('hidden');
      }
    }
  });
}

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
    const sets = deload
      ? Math.max(2, baseSets - 1)
      : baseSets + (weekNumber === 3 ? 1 : 0);
    const reps = deload
      ? Math.max(6, baseReps - 2)
      : baseReps + (weekNumber - 1);

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

function resolveCoachSlug(exerciseSlug) {
  if (EXERCISE_RULES[exerciseSlug]) return exerciseSlug;
  if (['wall_sit', 'goblet_squat'].includes(exerciseSlug)) return 'squat';
  if (['wall_pushup', 'dumbbell_floor_press', 'barbell_bench'].includes(exerciseSlug)) return 'pushup';
  if (exerciseSlug === 'bird_dog') return 'plank';
  return 'squat';
}

function buildActiveItem(rawItem, lastWeight = 0) {
  const exObj = EXERCISES.find((e) => e.id === rawItem.exerciseId);
  const slug = exObj?.slug || 'squat';
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
  return { exerciseId:rawItem.exerciseId, slug, name:rawItem.name, targetSets, setsCompleted:0,
    isStatic, targetReps:adjustedTarget, inputMode:'manual', manualValue:lastWeight || 0, scanCode:'', lastScanScore:null };
}

window.startTodayWorkout = () => {
  const today = getTodaysPlanDay();
  const rawItems = today.isRest
    ? [{exerciseId:4,name:'Glute Bridge',sets:2,reps:10},{exerciseId:11,name:'Bird-Dog Core Stability',sets:2,reps:8}]
    : today.items;
  activeWorkout={id:Date.now(),startedAt:new Date().toISOString(),title:today.isRest?'Gentle Recovery Session':today.title,
    items:rawItems.map((item)=>buildActiveItem(item,0)),loggedSets:[]};
  renderToday();
};

window.repeatLastWorkout = () => {
  const last=store.state.workoutLogs[0];if(!last)return alert('No previous workout logged yet.');
  const grouped={};last.sets.forEach((set)=>{if(!grouped[set.exerciseId])grouped[set.exerciseId]={exerciseId:set.exerciseId,name:set.exerciseName,sets:0,reps:set.reps,lastWeight:set.weight||0};grouped[set.exerciseId].sets+=1});
  activeWorkout={id:Date.now(),startedAt:new Date().toISOString(),title:`Repeat: ${last.title}`,items:Object.values(grouped).map((item)=>buildActiveItem(item,item.lastWeight)),loggedSets:[]};renderToday();
};

window.resetExerciseSets=(index)=>{const item=activeWorkout?.items?.[index];if(!item)return;item.setsCompleted=0;activeWorkout.loggedSets=activeWorkout.loggedSets.filter((set)=>set.exerciseId!==item.exerciseId);renderToday();showToast(`${item.name}: Set counter restarted to 0.`)};
window.toggleExerciseStatic=(index)=>{const item=activeWorkout?.items?.[index];if(!item)return;item.isStatic=!item.isStatic;renderToday()};
window.updateExerciseReps=(index,val)=>{const item=activeWorkout?.items?.[index];if(item)item.targetReps=Math.max(1,Number(val)||1)};
window.setBlock3Mode=(index,mode)=>{const item=activeWorkout?.items?.[index];if(!item)return;item.inputMode=mode;renderToday()};
window.updateBlock3Value=(index,val)=>{const item=activeWorkout?.items?.[index];if(!item)return;if(item.inputMode==='scan')item.scanCode=val;else item.manualValue=Number(val)||0};

window.swapExercise=(index)=>{const current=activeWorkout.items[index];const ex=EXERCISES.find((item)=>item.id===current.exerciseId);const alt=EXERCISES.find((item)=>item.id==(ex?.alternatives?.[0]||4))||EXERCISES[0];activeWorkout.items[index]=buildActiveItem({exerciseId:alt.id,name:`${alt.name} (Swapped)`,sets:current.targetSets,reps:current.targetReps},0);renderToday()};

window.logSet=(index)=>{const item=activeWorkout?.items?.[index];if(!item)return;item.setsCompleted+=1;activeWorkout.loggedSets.push({exerciseId:item.exerciseId,exerciseName:item.name,setNumber:item.setsCompleted,reps:item.targetReps,isStatic:item.isStatic,weight:item.inputMode==='manual'?Number(item.manualValue||0):0,scanCode:item.inputMode==='scan'?item.scanCode:null,scanScore:item.lastScanScore,effort:item.lastScanScore?`scan:${item.lastScanScore}%`:'moderate'});startRestTimer(60);renderToday();showToast(`Logged Set #${item.setsCompleted} for ${item.name}`)};
window.redirectToCameraScan = async (index) => {
  const item = activeWorkout?.items?.[index];
  if (!item) return;
  const ruleSlug = resolveCoachSlug(item.slug);
  pendingCameraScanTarget = { index, exerciseId:item.exerciseId, exerciseName:item.name, ruleSlug };
  const select = document.getElementById('coach-exercise-select');
  if (select) {
    select.value = ruleSlug;
    const rule = EXERCISE_RULES[ruleSlug];
    if (rule) document.getElementById('coach-setup-guide').textContent = `Camera setup for ${item.name}: ${rule.cameraPosition}`;
  }
  switchTab('coach');
  document.getElementById('btn-mode-live')?.click();
  const consent = document.getElementById('coach-consent-check');
  if (consent) consent.checked = true;
  store.state.consents.cameraOnDevice = true;
  store.save();
  coach.setExercise(ruleSlug, store.state.limitations);
  document.getElementById('coach-report-box')?.classList.add('hidden');
  document.getElementById('coach-start-controls')?.classList.add('hidden');
  document.getElementById('coach-active-controls')?.classList.remove('hidden');
  try {
    await coach.startCamera(false);
    showToast(`Camera opened to scan ${item.name}. Check your position, then begin the set.`);
  } catch (error) {
    document.getElementById('coach-active-controls')?.classList.add('hidden');
    document.getElementById('coach-start-controls')?.classList.remove('hidden');
    alert(`Camera could not start: ${error?.message || 'Camera permission or device access failed.'}`);
  }
};

window.returnScannedSetToToday = () => {
  pendingCameraScanTarget = null;
  switchTab('today');
};

function renderActiveWorkout(riskBanner) {
  const totalTarget = activeWorkout.items.reduce((sum, item) => sum + item.targetSets, 0);
  const totalDone = activeWorkout.items.reduce((sum, item) => sum + item.setsCompleted, 0);
  const progress = totalTarget ? Math.min(100, Math.round(totalDone / totalTarget * 100)) : 0;

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
            <div class="flex flex-wrap justify-between items-center gap-2"><div><h3 class="font-extrabold text-lg">${escapeHtml(item.name)}</h3><p class="text-xs text-slate-400">Target: ${item.targetSets} × ${item.targetReps}${item.isStatic?'s (Static)':' reps'} • Logged: <strong class="text-emerald-400">${item.setsCompleted} sets</strong></p></div><div class="flex gap-2">${ex?`<button onclick="toggleInlineDemo(${item.exerciseId})" class="min-h-[36px] px-3 rounded-xl bg-slate-900 text-sky-300 border border-slate-700 text-xs">${demoOpen?'Hide Guide':'▶ Demo & Steps'}</button>`:''}<button onclick="swapExercise(${idx})" class="min-h-[36px] px-3 rounded-xl bg-slate-900 border border-slate-600 text-xs">Swap</button></div></div>
            ${demoOpen&&ex?`<div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 grid md:grid-cols-2 gap-3"><div class="aspect-video rounded-lg overflow-hidden"><iframe class="w-full h-full" src="https://www.youtube.com/embed/${ex.youtubeId}" title="${escapeHtml(ex.name)}" loading="lazy" allowfullscreen></iframe></div><div><p class="font-bold text-emerald-400 text-xs mb-1">Form Steps:</p><ol class="list-decimal pl-4 text-xs text-slate-300 space-y-1">${ex.steps.map((step)=>`<li>${escapeHtml(step)}</li>`).join('')}</ol></div></div>`:''}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>1. Sets Done</span><button onclick="resetExerciseSets(${idx})" class="px-1.5 rounded bg-slate-800 border border-slate-700 font-bold">↺ 0</button></div><div class="flex justify-between"><strong class="text-xl text-emerald-400">${item.setsCompleted}</strong><span class="text-[11px] text-slate-500">of ${item.targetSets} sets</span></div></div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>${item.isStatic?'2. Static (Sec)':'2. Reps'}</span><button onclick="toggleExerciseStatic(${idx})" class="px-1.5 rounded bg-slate-800 text-sky-300 border border-slate-700 text-[9px]">${item.isStatic?'Switch Reps':'Switch Static'}</button></div><input type="number" min="1" value="${item.targetReps}" onchange="updateExerciseReps(${idx},this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-bold"></div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><div class="flex justify-between text-[10px] uppercase text-slate-400 mb-1"><span>3. ${item.inputMode==='scan'?'Scan':'Manual ('+store.state.user.units+')'}</span><div class="inline-flex bg-slate-800 p-0.5 rounded"><button onclick="setBlock3Mode(${idx},'manual')" class="px-1.5 text-[9px] ${item.inputMode==='manual'?'bg-emerald-600 rounded text-white':'text-slate-400'}">Manual</button><button onclick="setBlock3Mode(${idx},'scan')" class="px-1.5 text-[9px] ${item.inputMode==='scan'?'bg-sky-600 rounded text-white':'text-slate-400'}">Scan</button></div></div>${item.inputMode==='scan'?`<input type="text" value="${escapeHtml(item.scanCode||'')}" onchange="updateBlock3Value(${idx},this.value)" class="w-full bg-slate-800 border border-sky-600/50 rounded-lg px-2.5 py-1 text-xs text-sky-300" placeholder="Scan code or score...">`:`<input type="number" step="0.5" value="${item.manualValue}" onchange="updateBlock3Value(${idx},this.value)" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-sm font-bold">`}</div>
              <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-700"><span class="text-[10px] uppercase text-slate-400 block mb-1">4. Log &amp; Evaluate</span><div class="flex gap-1.5"><button onclick="logSet(${idx})" class="flex-1 min-h-[38px] px-2.5 rounded-lg bg-emerald-600 font-bold text-xs whitespace-nowrap">+ Log Set</button><button onclick="redirectToCameraScan(${idx})" class="min-h-[38px] px-2.5 rounded-lg bg-sky-600 font-bold text-xs whitespace-nowrap">📷 Scan</button></div></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="mt-5 pt-4 border-t border-slate-800 flex flex-wrap justify-between gap-3"><label class="flex items-center gap-2 text-sm text-slate-300"><input id="workout-pain-check" type="checkbox" class="accent-emerald-500">Report joint/muscle discomfort</label><button onclick="finishWorkout()" class="min-h-[48px] px-6 rounded-xl bg-emerald-600 font-bold">Finish Workout</button></div>
    </div>
  `;
}

function startRestTimer(seconds) {
  clearInterval(restTimerInterval);
  restSecondsRemaining = seconds;
  const box = document.getElementById('rest-timer-box');
  if (!box) return;
  box.classList.remove('hidden');
  document.getElementById('rest-timer-val').textContent = `${restSecondsRemaining}s`;
  restTimerInterval = setInterval(() => {
    restSecondsRemaining -= 1;
    if (restSecondsRemaining <= 0) {
      clearInterval(restTimerInterval);
      box.classList.add('hidden');
    } else if (document.getElementById('rest-timer-val')) {
      document.getElementById('rest-timer-val').textContent = `${restSecondsRemaining}s`;
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
  const painReported = document.getElementById('workout-pain-check')?.checked || false;
  const completed = {
    id: activeWorkout.id,
    date: new Date().toISOString().slice(0, 10),
    title: activeWorkout.title,
    durationMin: Math.max(5, Math.round((Date.now() - new Date(activeWorkout.startedAt)) / 60000)),
    sets: activeWorkout.loggedSets,
    painReported
  };
  store.state.workoutLogs.unshift(completed);
  store.save();
  await store.api('/workouts', { method: 'POST', body: JSON.stringify(completed) });
  activeWorkout = null;
  pendingCameraScanTarget = null;
  clearInterval(restTimerInterval);
  renderAll();
  showToast('Workout saved to your history!');
};

function switchTab(target) {
  if (target !== 'coach' && coach?.running) coach.stopCamera(false);
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(`tab-${target}`)?.classList.remove('hidden');
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
  if (!document.getElementById('coach-video') || typeof LiveCameraCoach !== 'function') return;
  coach = new LiveCameraCoach({
    videoEl: document.getElementById('coach-video'),
    canvasEl: document.getElementById('coach-canvas'),
    onStatus: (message, passed = false) => {
      const status = document.getElementById('coach-setup-status');
      if (status) status.textContent = message;
      const begin = document.getElementById('btn-coach-begin-set');
      if (begin) begin.disabled = !passed;
    },
    onCue: (cue) => { document.getElementById('coach-live-cue').textContent = cue; },
    onRep: (count, score) => {
      document.getElementById('coach-rep-count').textContent = count;
      document.getElementById('coach-last-score').textContent = `${score}/100`;
    },
    onFinish: async (report) => {
      document.getElementById('coach-active-controls')?.classList.add('hidden');
      document.getElementById('coach-start-controls')?.classList.remove('hidden');
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
        returnButton = '<div class="mt-3 pt-3 border-t border-slate-700"><button type="button" onclick="returnScannedSetToToday()" class="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">✓ Apply Scanned Evaluation & Return to Today Workout →</button></div>';
      }

      const sourceBadge = report.sourceMode === 'upload'
        ? '<span class="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-300 ml-2">Uploaded Video</span>'
        : '<span class="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 ml-2">Live Camera</span>';
      const box = document.getElementById('coach-report-box');
      box?.classList.remove('hidden');
      if (box) box.innerHTML = `<h4 class="font-bold text-emerald-400 text-lg">Analysis Report — ${escapeHtml(report.exerciseName)}${sourceBadge}</h4><p class="text-sm">Detected: <strong>${report.reps} ${report.repType === 'hold' ? 'seconds' : 'reps'}</strong> · Confidence: <strong>${report.confidence}%</strong></p><p class="text-sm mt-1">Overall Form Score: <strong>${report.score === null ? 'Low confidence — ensure full body is visible' : `${report.score}/100`}</strong></p>${returnButton}<p class="text-xs text-slate-400 mt-2">Coaching is informational only. Stop if you feel pain.</p>`;
      showToast('Analysis report saved!');
    }
  });

  document.getElementById('btn-mode-live')?.addEventListener('click', () => {
    document.getElementById('panel-coach-live')?.classList.remove('hidden');
    document.getElementById('panel-coach-upload')?.classList.add('hidden');
  });
  document.getElementById('btn-mode-upload')?.addEventListener('click', () => {
    document.getElementById('panel-coach-live')?.classList.add('hidden');
    document.getElementById('panel-coach-upload')?.classList.remove('hidden');
  });
  document.getElementById('btn-coach-check')?.addEventListener('click', async () => {
    if (!document.getElementById('coach-consent-check')?.checked) return alert('Please confirm camera consent first.');
    const select = document.getElementById('coach-exercise-select');
    if (select) coach.setExercise(select.value, store.state.limitations);
    await coach.startCamera(false);
  });
  document.getElementById('btn-coach-begin-set')?.addEventListener('click', () => coach.beginActiveSet());
  document.getElementById('btn-coach-finish')?.addEventListener('click', () => coach.stopCamera(true));
  document.getElementById('btn-coach-stop')?.addEventListener('click', () => coach.stopCamera(false));
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyHabits() {
  try {
    return JSON.parse(localStorage.getItem(`smart_gym_habits_${getTodayDateKey()}`))
      || { waterMl:750, waterGoal:2500, warmup:false, stretch:false };
  } catch {
    return { waterMl:750, waterGoal:2500, warmup:false, stretch:false };
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
  const bmi = Number((weightKg / ((Math.max(1.2, heightCm / 100) ** 2))).toFixed(1));
  const bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy Zone' : bmi < 30 ? 'Overweight' : 'High BMI';
  const s = gender === 'female' ? -161 : 5;
  const dailyKcal = Math.round((10 * weightKg + 6.25 * heightCm - 5 * age + s) * 1.2);
  const goalLabels = { build_strength:'Build Muscle & Strength', lose_weight:'Lose Weight & Burn Fat', move_more:'Move More & Build Habit', stay_mobile:'Stay Mobile & Flexible', recover:'Gentle Injury Recovery' };
  return { name:u.displayName || 'Athlete', age, heightCm, weightKg, bmi, bmiLabel, dailyKcal,
    goalTitle:goalLabels[p.goal] || 'Build Muscle & Strength', equipment:(p.equipment || 'none').replace('_',' '),
    daysPerWeek:p.daysPerWeek || 4, minutesPerSession:p.minutesPerSession || 30 };
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
    renderActiveWorkout(store.state.screening.riskFlagged
      ? '<div class="p-3.5 mb-4 rounded-2xl bg-amber-950/80 border border-amber-500 text-amber-200 text-sm"><strong>Health Screening Notice:</strong> Check with your doctor before starting.</div>'
      : '');
    return;
  }

  const selectedDay = getTodaysPlanDay(selectedPlanDay);
  const todayNum = ((new Date().getDay() + 6) % 7) + 1;
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const waterPct = Math.min(100, Math.round(((habits.waterMl || 0) / (habits.waterGoal || 2500)) * 100));
  const latestScore = liveSessions[0]?.score ?? null;
  const limitations = store.state.limitations?.length
    ? store.state.limitations.map((l) => `<span class="text-[11px] px-2.5 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/40">🛡 ${escapeHtml(l.replace('_',' '))}</span>`).join('')
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
          <div class="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800"><span class="text-[11px] text-slate-400 block">AI Form Score</span><strong class="text-xl text-amber-300">${latestScore !== null ? latestScore+'%' : 'Ready'}</strong><p class="text-[10px] text-slate-500">${liveSessions.length} scans</p></div>
        </div>
      </div>

      <div class="grid lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div class="flex justify-between mb-2"><span class="text-xs font-bold uppercase tracking-wider text-slate-400">Weekly Schedule</span><span class="text-[11px] text-emerald-400">Tap to preview</span></div>
          <div class="grid grid-cols-7 gap-1.5">
            ${dayNames.map((label,i) => { const d=i+1; const selected=d===selectedPlanDay; const workout=d<=stats.daysPerWeek; return `<button type="button" onclick="selectTodayDay(${d})" class="py-2.5 px-1 rounded-xl border text-center ${selected?'bg-emerald-600 border-emerald-400 text-white':'bg-slate-950 border-slate-800 text-slate-300'}"><span class="text-[11px] font-bold block">${label}</span><span class="block w-2 h-2 mx-auto my-1 rounded-full ${workout?'bg-emerald-400':'bg-slate-600'}"></span><span class="text-[9px]">${d===todayNum?'Today':workout?'Train':'Rest'}</span></button>`; }).join('')}
          </div>
        </div>
        <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">How Do You Feel?</span>
          <div class="grid grid-cols-3 gap-1.5 mt-2">
            ${[['energized','⚡','Energized'],['normal','💪','Ready'],['tired','🌿','Sore / Light']].map(([key,icon,label]) => `<button type="button" onclick="setTodayReadiness('${key}')" class="py-2 rounded-xl border ${todayReadiness===key?'border-emerald-400 bg-emerald-950/60 text-emerald-200':'border-slate-800 bg-slate-950 text-slate-400'}"><span class="block">${icon}</span><span class="text-[11px]">${label}</span></button>`).join('')}
          </div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6">
        <div class="flex flex-wrap justify-between items-center gap-3 mb-4"><div><span class="text-xs uppercase tracking-wider text-emerald-400 font-bold">${selectedPlanDay===todayNum?"Today's Scheduled Session":`Previewing ${dayNames[selectedPlanDay-1]} Session`}</span><h2 class="text-2xl font-extrabold">${escapeHtml(selectedDay.title)}</h2></div><div class="flex gap-2">${logs.length?'<button onclick="repeatLastWorkout()" class="min-h-[48px] px-4 rounded-xl bg-slate-800 border border-slate-700">↻ Repeat Last</button>':''}<button onclick="startTodayWorkout()" class="min-h-[48px] px-6 rounded-xl bg-emerald-500 text-slate-950 font-extrabold">${selectedDay.isRest?'Start Gentle Stretch →':'Start Workout →'}</button></div></div>
        ${selectedDay.isRest?'':`<div class="grid sm:grid-cols-2 gap-3">${selectedDay.items.map((it) => { const ex=EXERCISES.find((e)=>e.id===it.exerciseId); const open=expandedDemoIds.has(it.exerciseId); return `<div class="p-4 rounded-2xl bg-slate-800/60 border border-slate-700"><div class="flex justify-between gap-2"><div><b>${escapeHtml(it.name)}</b><p class="text-xs text-slate-400">${it.sets} sets × ${it.reps}</p></div><button onclick="toggleInlineDemo(${it.exerciseId})" class="text-[11px] px-2.5 rounded-lg bg-slate-900 text-sky-300 border border-slate-700">${open?'Hide':'▶ Demo'}</button></div>${open&&ex?`<div class="mt-3 aspect-video rounded-xl overflow-hidden bg-black"><iframe class="w-full h-full" src="https://www.youtube.com/embed/${ex.youtubeId}" title="${escapeHtml(ex.name)}" loading="lazy" allowfullscreen></iframe></div><p class="text-xs text-slate-300 mt-2">${escapeHtml(ex.steps[0])}</p>`:''}</div>`; }).join('')}</div>`}
      </div>

      <div class="grid md:grid-cols-3 gap-4">
        <div class="p-5 rounded-3xl bg-gradient-to-b from-sky-950/50 to-slate-900 border border-sky-800/50 space-y-4"><div><span class="text-xs font-extrabold uppercase tracking-wider text-sky-400">✨ fitwithAI Split</span>${fit?.generatedPlan?`<h3 class="font-bold mt-2">${escapeHtml(fit.generatedPlan.programName)}</h3><p class="text-xs text-slate-300 mt-1">${escapeHtml(fit.generatedPlan.days[fit.selectedDayIndex||0]?.dayTitle||'Custom Split')} • ${escapeHtml(fit.generatedPlan.strengthGain)} projected gain</p><button onclick="loadFitWithAIDayIntoToday()" class="w-full mt-3 min-h-[40px] rounded-xl bg-sky-500 text-slate-950 font-bold">Load into Today</button>`:`<p class="text-xs text-slate-400 mt-2">Create a personalized strength split.</p>`}</div><button onclick="switchTab('fitwithai')" class="w-full min-h-[40px] rounded-xl bg-slate-800 text-sky-300 border border-slate-700">${fit?.generatedPlan?'Open fitwithAI':'Build AI Plan →'}</button></div>
        <div class="p-5 rounded-3xl bg-gradient-to-b from-amber-950/35 to-slate-900 border border-amber-700/40 space-y-4"><div><span class="text-xs font-extrabold uppercase tracking-wider text-amber-400">🩺 Prescription Guidance</span>${latestRx?`<h3 class="font-bold mt-2">Latest Clinical Match</h3><p class="text-xs text-slate-300 mt-1">${escapeHtml(latestRx.summaryNote||'Prescription exercises analyzed.')}</p>`:'<h3 class="font-bold mt-2">Have a Doctor\'s Note?</h3><p class="text-xs text-slate-400 mt-1">Analyze a prescription for safe exercise matches.</p>'}</div><button onclick="switchTab('prescription')" class="w-full min-h-[40px] rounded-xl bg-slate-800 text-amber-300 border border-slate-700">${latestRx?'View Prescription Details →':'Analyze Prescription →'}</button></div>
        <div class="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3"><div class="flex justify-between"><span class="text-xs font-extrabold uppercase tracking-wider text-emerald-400">💧 Daily Readiness</span><b class="text-xs">${habits.waterMl} / ${habits.waterGoal} ml</b></div><div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-sky-400" style="width:${waterPct}%"></div></div><div class="flex gap-2"><button onclick="addTodayWater(250)" class="flex-1 py-2 rounded-xl bg-sky-950/70 text-sky-300 border border-sky-700/50 text-xs font-bold">+250 ml</button><button onclick="addTodayWater(500)" class="flex-1 py-2 rounded-xl bg-sky-950/70 text-sky-300 border border-sky-700/50 text-xs font-bold">+500 ml</button></div><label class="flex gap-2 text-xs text-slate-300"><input type="checkbox" ${habits.warmup?'checked':''} onchange="toggleDailyHabit('warmup')" class="accent-emerald-500">5-min mobility warmup</label><label class="flex gap-2 text-xs text-slate-300"><input type="checkbox" ${habits.stretch?'checked':''} onchange="toggleDailyHabit('stretch')" class="accent-emerald-500">Cooldown stretch</label><button onclick="launchQuickCameraTest()" class="w-full min-h-[40px] rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">📷 Quick Camera Form Check</button></div>
      </div>
    </div>
  `;
}

function renderAll() {
  const name = store.state.user.displayName || 'Athlete';
  const initial = name.charAt(0).toUpperCase();
  if ($('header-user-name')) $('header-user-name').textContent = name;
  if ($('header-user-avatar')) $('header-user-avatar').textContent = initial;
  renderToday();
  renderFitWithAI();
}

function bindModalCloseButtons() {
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => $(button.dataset.closeModal)?.classList.add('hidden'));
  });
}

function bindPrescriptionPage() {}
function bindProfilePage() {}
function renderPrescriptionHistory() {}

function showToast(message) {
  const toast = $('toast-banner');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3000);
}