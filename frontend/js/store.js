// Offline localStorage data and backend API synchronization.

const API_BASE = 'http://localhost:4000/api';
const STORAGE_KEY = 'smart_gym_state_v1';
const FITAI_KEY = 'smart_gym_fitwithai_v1';
const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const defaultState = {
  isAuthenticated: false,
  token: null,
  user: {
    id: null,
    email: 'athlete@smartgym.local',
    displayName: 'Athlete',
    units: 'kg',
    language: 'en',
    timeZone: detectedTimeZone,
    birthYear: 2003,
    age: 23
  },
  profile: {
    onboarded: false,
    skippedSetup: false,
    gender: 'male',
    heightCm: 178,
    weightKg: 70,
    goal: 'build_strength',
    experience: 'new',
    equipment: 'none',
    daysPerWeek: 4,
    minutesPerSession: 30
  },
  screening: {
    completed: false,
    riskFlagged: false,
    answers: {},
    completedAt: null
  },
  limitations: [],
  consents: {
    healthData: false,
    cameraOnDevice: false
  },
  dismissedQuickCoachCard: false,
  monthlyPlan: null,
  workoutLogs: [],
  liveSessions: [],
  prescriptionHistory: [],
  bodyMetrics: [
    { date: new Date().toISOString().slice(0, 10), weight: 70, waist: 82 }
  ],
  reminders: {
    enabled: true,
    time: '18:00',
    quietStart: '22:00',
    quietEnd: '07:00'
  }
};

class Store {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        user: { ...structuredClone(defaultState.user), ...(parsed.user || {}) },
        profile: { ...structuredClone(defaultState.profile), ...(parsed.profile || {}) },
        screening: { ...structuredClone(defaultState.screening), ...(parsed.screening || {}) }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  syncToFitWithAI() {
    try {
      const existing = JSON.parse(localStorage.getItem(FITAI_KEY) || '{}');
      const goalMap = {
        build_strength: 'Build muscle',
        lose_weight: 'Lose weight',
        move_more: 'Get stronger',
        stay_mobile: 'Stay mobile',
        recover: 'Stay mobile'
      };
      const equipmentMap = { none: 'no_equipment', home_basics: 'dumbbells', full_gym: 'full_gym' };
      localStorage.setItem(
        FITAI_KEY,
        JSON.stringify({
          ...existing,
          gender: this.state.profile.gender || 'male',
          heightCm: Number(this.state.profile.heightCm || 178),
          weightKg: Number(this.state.profile.weightKg || 70),
          age: Number(this.state.user.age || 23),
          daysPerWeek: Number(this.state.profile.daysPerWeek || 4),
          equipment: equipmentMap[this.state.profile.equipment] || 'no_equipment',
          goal: goalMap[this.state.profile.goal] || 'Build muscle'
        })
      );
    } catch {}
  }

  async api(path, options = {}) {
    if (!this.state.token) return null;
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.state.token}`,
          ...(options.headers || {})
        }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async loginOrRegister(mode, payload) {
    const res = await fetch(`${API_BASE}/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');
    this.state.isAuthenticated = true;
    this.state.token = data.token;
    this.state.user = { ...this.state.user, ...data.user };
    if (data.profile) this.state.profile = { ...this.state.profile, ...data.profile, onboarded: true };
    this.save();
    this.syncToFitWithAI();
    await this.syncFromServer();
    return data;
  }

  enterOfflineDemo(payload = {}) {
    this.state.isAuthenticated = true;
    this.state.token = null;
    this.state.user = {
      ...this.state.user,
      displayName: payload.displayName || 'Athlete',
      email: payload.email || 'guest@smartgym.local',
      age: Number(payload.age || 23),
      birthYear: new Date().getFullYear() - Number(payload.age || 23)
    };
    this.state.profile = {
      ...this.state.profile,
      onboarded: true,
      gender: payload.gender || 'male',
      heightCm: Number(payload.heightCm || 178),
      weightKg: Number(payload.weightKg || 70),
      goal: payload.goal || 'build_strength',
      equipment: payload.equipment || 'none'
    };
    this.save();
    this.syncToFitWithAI();
  }

  logout() {
    this.state.isAuthenticated = false;
    this.state.token = null;
    this.save();
  }

  async syncFromServer() {
    const me = await this.api('/me');
    if (me?.user) {
      this.state.user = { ...this.state.user, ...me.user };
      if (me.profile) {
        this.state.profile = { ...this.state.profile, ...me.profile, onboarded: true, skippedSetup: false };
      }
      if (me.limitations) this.state.limitations = me.limitations;
      if (me.screening) this.state.screening = me.screening;
    }
    const plan = await this.api('/plans/current');
    if (plan?.plan) this.state.monthlyPlan = plan.plan;
    this.save();
    this.syncToFitWithAI();
  }

  exportAllData() {
    return JSON.stringify(this.state, null, 2);
  }

  async deleteAccount() {
    await this.api('/me', { method: 'DELETE' });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FITAI_KEY);
    this.state = structuredClone(defaultState);
    this.save();
  }
}

export const store = new Store();
