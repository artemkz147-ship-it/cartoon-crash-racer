/**
 * Career / garage progress — localStorage (+ Capacitor Preferences if available).
 */
const KEY = 'ccr_progress_v1';

const DEFAULT = {
  version: 1,
  cupsCleared: 0,
  medals: 0,
  cupResults: {}, // cupId -> { medal, place, destruction, bestTime }
  unlockedCars: ['kartoshka'],
  selectedCar: 'kartoshka',
  settings: { muted: false, sensitivity: 1 },
  destructionTotal: 0,
};

let cache = null;

export function loadProgress() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      cache = { ...DEFAULT, ...JSON.parse(raw), settings: { ...DEFAULT.settings, ...(JSON.parse(raw).settings || {}) } };
      if (!cache.unlockedCars?.includes('kartoshka')) cache.unlockedCars.unshift('kartoshka');
      return cache;
    }
  } catch (_) {}
  cache = structuredClone(DEFAULT);
  return cache;
}

export function saveProgress(p) {
  cache = p;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (_) {}
  // Capacitor Preferences (optional, fire-and-forget)
  try {
    if (window.Capacitor?.Plugins?.Preferences) {
      window.Capacitor.Plugins.Preferences.set({ key: KEY, value: JSON.stringify(p) });
    }
  } catch (_) {}
}

export function resetProgress() {
  cache = structuredClone(DEFAULT);
  saveProgress(cache);
  return cache;
}

export function isCupUnlocked(index, progress) {
  return index <= (progress.cupsCleared || 0);
}

export function applyRaceResult(progress, { mode, cupId, place, medal, destruction, time, carUnlocks }) {
  const p = { ...progress, cupResults: { ...progress.cupResults }, unlockedCars: [...progress.unlockedCars] };
  p.destructionTotal = (p.destructionTotal || 0) + (destruction || 0);

  if (mode === 'career' && cupId && medal) {
    const prev = p.cupResults[cupId];
    const rank = (m) => (m === 'gold' ? 3 : m === 'silver' ? 2 : m === 'bronze' ? 1 : 0);
    if (!prev || rank(medal) > rank(prev.medal)) {
      if (prev?.medal) p.medals = Math.max(0, (p.medals || 0) - 1);
      p.medals = (p.medals || 0) + 1;
      p.cupResults[cupId] = { medal, place, destruction, bestTime: time };
    } else if (prev && (!prev.bestTime || time < prev.bestTime)) {
      p.cupResults[cupId] = { ...prev, bestTime: time, destruction: Math.max(prev.destruction || 0, destruction || 0) };
    }
    // Clear cup if first time meeting need
    const cupIndex = Number(String(cupId).replace(/\D/g, '')) - 1;
    if (cupIndex >= 0 && cupIndex === p.cupsCleared) {
      p.cupsCleared = Math.min(12, p.cupsCleared + 1);
    }
  }

  if (carUnlocks) {
    for (const id of carUnlocks) {
      if (!p.unlockedCars.includes(id)) p.unlockedCars.push(id);
    }
  }
  saveProgress(p);
  return p;
}

export function getSettings() {
  return loadProgress().settings;
}

export function setSettings(partial) {
  const p = loadProgress();
  p.settings = { ...p.settings, ...partial };
  saveProgress(p);
  return p.settings;
}
