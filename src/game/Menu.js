import { CARS, carUnlocked, getCar } from './data/cars.js';
import { CAREER_CUPS, DERBY_ARENAS, medalLabel } from './data/career.js';
import { TRACK_LIST, getTrack } from './data/tracks.js';
import {
  loadProgress,
  saveProgress,
  isCupUnlocked,
  applyRaceResult,
  setSettings,
} from './Progress.js';

/**
 * Full Russian meta UI: main / career / race / derby / garage / settings / results.
 */
export class Menu {
  constructor({ onStartRace }) {
    this.onStartRace = onStartRace;
    this.progress = loadProgress();
    this.root = document.getElementById('menu-root');
    this.screen = 'main';
    this.pendingResult = null;
    this.quickTrack = 'city';
    this.quickLaps = 3;
    this.render();
  }

  show() {
    this.root.classList.remove('hidden');
    this.progress = loadProgress();
    this.render();
  }

  hide() {
    this.root.classList.add('hidden');
  }

  refresh() {
    this.progress = loadProgress();
    this.render();
  }

  render() {
    if (!this.root) return;
    const p = this.progress;
    if (this.screen === 'main') this.root.innerHTML = this._main(p);
    else if (this.screen === 'career') this.root.innerHTML = this._career(p);
    else if (this.screen === 'race') this.root.innerHTML = this._race(p);
    else if (this.screen === 'derby') this.root.innerHTML = this._derby(p);
    else if (this.screen === 'garage') this.root.innerHTML = this._garage(p);
    else if (this.screen === 'settings') this.root.innerHTML = this._settings(p);
    else if (this.screen === 'results') this.root.innerHTML = this._results(p);
    this._bind();
  }

  _main(p) {
    return `
      <div class="menu-panel main-menu">
        <h1>Мультяшные гонки</h1>
        <p class="subtitle">FlatOut × CTR · карьера · дерби · гараж · v1.1</p>
        <div class="menu-stats">
          <span>🏅 Медалей: ${p.medals || 0}</span>
          <span>🏆 Кубков: ${p.cupsCleared || 0}/12</span>
          <span>💥 Разрушений: ${p.destructionTotal || 0}</span>
        </div>
        <div class="menu-btns">
          <button data-go="career" class="menu-btn primary">🏆 Карьера</button>
          <button data-go="race" class="menu-btn">⚡ Быстрая гонка</button>
          <button data-go="derby" class="menu-btn">💥 Дерби</button>
          <button data-go="garage" class="menu-btn">🚗 Гараж</button>
          <button data-go="settings" class="menu-btn secondary">⚙️ Настройки</button>
        </div>
        <p class="hint">8 трасс · 8 машин · 12 кубков · 2 арены дерби</p>
      </div>`;
  }

  _career(p) {
    const rows = CAREER_CUPS.map((cup, i) => {
      const unlocked = isCupUnlocked(i, p);
      const res = p.cupResults?.[cup.id];
      const track = getTrack(cup.trackId);
      const lock = unlocked ? '' : 'locked';
      const medal = res ? medalLabel(res.medal) : '—';
      return `
        <button class="cup-row ${lock}" data-cup="${cup.id}" ${unlocked ? '' : 'disabled'}>
          <div class="cup-num">${String(i + 1).padStart(2, '0')}</div>
          <div class="cup-info">
            <strong>${cup.name}</strong>
            <span>${track.name} · ${cup.laps} кр. · ИИ×${cup.ai}</span>
            <span class="cup-desc">${cup.desc}</span>
          </div>
          <div class="cup-medal">${unlocked ? medal : '🔒'}</div>
        </button>`;
    }).join('');
    return `
      <div class="menu-panel wide">
        <button class="back-btn" data-go="main">← Назад</button>
        <h2>Карьера — 12 кубков</h2>
        <p class="subtitle">Финиш в топ-N открывает следующий. Медали за место + разрушения.</p>
        <div class="cup-list">${rows}</div>
      </div>`;
  }

  _race(p) {
    const tracks = TRACK_LIST.map(
      (t) =>
        `<button class="track-card ${this.quickTrack === t.id ? 'selected' : ''}" data-track="${t.id}">
          <strong>${t.name}</strong>
          <span>${t.theme}</span>
        </button>`
    ).join('');
    return `
      <div class="menu-panel wide">
        <button class="back-btn" data-go="main">← Назад</button>
        <h2>Быстрая гонка</h2>
        <div class="track-grid">${tracks}</div>
        <div class="laps-row">
          <span>Круги:</span>
          ${[2, 3, 4, 5].map((n) => `<button class="lap-btn ${this.quickLaps === n ? 'selected' : ''}" data-laps="${n}">${n}</button>`).join('')}
        </div>
        <button class="menu-btn primary" data-action="start-race">СТАРТ</button>
      </div>`;
  }

  _derby(p) {
    const rows = DERBY_ARENAS.map(
      (d) =>
        `<button class="menu-btn" data-derby="${d.id}">
          ${d.name}<br/><small>ИИ×${d.ai}</small>
        </button>`
    ).join('');
    return `
      <div class="menu-panel">
        <button class="back-btn" data-go="main">← Назад</button>
        <h2>Дерби</h2>
        <p class="subtitle">Арена · последний выживший · очки за разгром</p>
        <div class="menu-btns">${rows}</div>
      </div>`;
  }

  _garage(p) {
    const selected = p.selectedCar || 'kartoshka';
    const cards = CARS.map((c) => {
      const unlocked = carUnlocked(c, p) || p.unlockedCars.includes(c.id);
      const sel = selected === c.id ? 'selected' : '';
      const st = c.stats;
      return `
        <button class="car-card ${sel} ${unlocked ? '' : 'locked'}" data-car="${c.id}" ${unlocked ? '' : 'disabled'}>
          <div class="car-swatch" style="background:#${c.color.toString(16).padStart(6, '0')}"></div>
          <strong>${c.name}</strong>
          <span>${unlocked ? c.desc : this._unlockHint(c)}</span>
          <div class="stat-bars">
            <div class="sbar"><i>Скор</i><b style="width:${st.speed * 100}%"></b></div>
            <div class="sbar"><i>Руль</i><b style="width:${st.handling * 100}%"></b></div>
            <div class="sbar"><i>Броня</i><b style="width:${st.armor * 100}%"></b></div>
            <div class="sbar"><i>Оруж</i><b style="width:${st.weapon * 100}%"></b></div>
          </div>
        </button>`;
    }).join('');
    return `
      <div class="menu-panel wide">
        <button class="back-btn" data-go="main">← Назад</button>
        <h2>Гараж</h2>
        <p class="subtitle">Выбрано: <strong>${getCar(selected).name}</strong></p>
        <div class="car-grid">${cards}</div>
      </div>`;
  }

  _unlockHint(c) {
    const u = c.unlock;
    if (u.type === 'medals') return `🔒 ${u.count} медалей`;
    if (u.type === 'cups') return `🔒 ${u.count} кубков`;
    return '🔒';
  }

  _settings(p) {
    const s = p.settings || { muted: false, sensitivity: 1 };
    return `
      <div class="menu-panel">
        <button class="back-btn" data-go="main">← Назад</button>
        <h2>Настройки</h2>
        <label class="setting-row">
          <span>Без звука</span>
          <input type="checkbox" id="set-mute" ${s.muted ? 'checked' : ''}/>
        </label>
        <label class="setting-row">
          <span>Чувств. руля: <b id="sens-val">${s.sensitivity.toFixed(1)}</b></span>
          <input type="range" id="set-sens" min="0.5" max="1.5" step="0.1" value="${s.sensitivity}"/>
        </label>
        <button class="menu-btn secondary" data-action="reset-progress">Сбросить прогресс</button>
      </div>`;
  }

  _results(p) {
    const r = this.pendingResult || {};
    const medal = r.medal ? medalLabel(r.medal) : 'Без медали';
    const rows = (r.standings || [])
      .map(
        (s) =>
          `<div class="result-row"><span class="place">${s.place}.</span><span class="name">${s.name}</span><span class="lap">${s.extra || ''}</span></div>`
      )
      .join('');
    return `
      <div class="menu-panel">
        <h2>${r.place === 1 ? '🏆 Победа!' : 'Финиш'}</h2>
        <p class="results-time">Место: ${r.place} · ${medal}</p>
        <p>Время: ${formatTime(r.time || 0)} · Разрушения: ${r.destruction || 0}</p>
        <div class="results-body">${rows}</div>
        <div class="menu-btns">
          <button class="menu-btn primary" data-go="main">В меню</button>
          <button class="menu-btn" data-go="career">Карьера</button>
        </div>
      </div>`;
  }

  _bind() {
    this.root.querySelectorAll('[data-go]').forEach((el) => {
      el.addEventListener('click', () => {
        this.screen = el.dataset.go;
        this.render();
      });
    });
    this.root.querySelectorAll('[data-cup]').forEach((el) => {
      el.addEventListener('click', () => {
        const cup = CAREER_CUPS.find((c) => c.id === el.dataset.cup);
        if (!cup) return;
        this.hide();
        this.onStartRace({
          mode: 'career',
          trackId: cup.trackId,
          carId: this.progress.selectedCar,
          laps: cup.laps,
          aiCount: cup.ai,
          difficulty: cup.difficulty,
          cupId: cup.id,
          needPlace: cup.needPlace,
        });
      });
    });
    this.root.querySelectorAll('[data-track]').forEach((el) => {
      el.addEventListener('click', () => {
        this.quickTrack = el.dataset.track;
        this.render();
      });
    });
    this.root.querySelectorAll('[data-laps]').forEach((el) => {
      el.addEventListener('click', () => {
        this.quickLaps = Number(el.dataset.laps);
        this.render();
      });
    });
    this.root.querySelector('[data-action="start-race"]')?.addEventListener('click', () => {
      this.hide();
      this.onStartRace({
        mode: 'race',
        trackId: this.quickTrack,
        carId: this.progress.selectedCar,
        laps: this.quickLaps,
        aiCount: 5,
        difficulty: 0.75,
        needPlace: 3,
      });
    });
    this.root.querySelectorAll('[data-derby]').forEach((el) => {
      el.addEventListener('click', () => {
        const d = DERBY_ARENAS.find((x) => x.id === el.dataset.derby);
        if (!d) return;
        this.hide();
        this.onStartRace({
          mode: 'derby',
          trackId: d.trackId,
          carId: this.progress.selectedCar,
          laps: 1,
          aiCount: d.ai,
          difficulty: d.difficulty,
        });
      });
    });
    this.root.querySelectorAll('[data-car]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.car;
        const car = getCar(id);
        if (!carUnlocked(car, this.progress) && !this.progress.unlockedCars.includes(id)) return;
        this.progress.selectedCar = id;
        if (!this.progress.unlockedCars.includes(id)) this.progress.unlockedCars.push(id);
        saveProgress(this.progress);
        this.render();
      });
    });
    const mute = this.root.querySelector('#set-mute');
    const sens = this.root.querySelector('#set-sens');
    mute?.addEventListener('change', () => {
      setSettings({ muted: mute.checked });
      this.progress = loadProgress();
      window.__applyMute?.(mute.checked);
    });
    sens?.addEventListener('input', () => {
      const v = Number(sens.value);
      document.getElementById('sens-val').textContent = v.toFixed(1);
      setSettings({ sensitivity: v });
      this.progress = loadProgress();
      window.__steerSensitivity = v;
    });
    this.root.querySelector('[data-action="reset-progress"]')?.addEventListener('click', () => {
      if (confirm('Сбросить весь прогресс?')) {
        localStorage.removeItem('ccr_progress_v1');
        this.progress = loadProgress();
        this.screen = 'main';
        this.render();
      }
    });
  }

  showResults(result) {
    // Unlock cars based on new progress
    this.progress = applyRaceResult(this.progress, {
      mode: result.mode,
      cupId: result.cupId,
      place: result.place,
      medal: result.medal,
      destruction: result.destruction,
      time: result.time,
    });
    // Sync car unlocks from medals/cups
    for (const c of CARS) {
      if (carUnlocked(c, this.progress) && !this.progress.unlockedCars.includes(c.id)) {
        this.progress.unlockedCars.push(c.id);
      }
    }
    saveProgress(this.progress);
    this.pendingResult = result;
    this.screen = 'results';
    this.show();
  }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}
